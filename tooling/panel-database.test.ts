/**
 * The panel, served by the real adapter, against a real PostgreSQL.
 *
 * Every HTTP test in @perchjs/nest writes its own adapter by hand — fourteen of
 * them — and each is written to satisfy the route under test. That proves the
 * routes agree with a fake. `tooling/database.test.ts` proves the adapter
 * agrees with PostgreSQL. Nothing has ever joined the two, so a shape the real
 * adapter returns and no fake imitates would leave both suites green.
 *
 * It lives here for the same reason the other one does: it spans @perchjs/nest,
 * @perchjs/prisma and the generated IR, and no package may depend on another.
 *
 * `tooling/database.test.ts` is what fails in CI when DATABASE_URL is missing;
 * one guard for the variable both files read is enough.
 *
 * It owns its rows, not the database. Vitest runs files in parallel and that
 * other file shares this schema, so anything global here — a wipe, a total over
 * every row — is a race. Measured: four runs in five failed before every
 * assertion was scoped to what this file created.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  DataAdapter,
  Ir,
  Row,
  Schema as SchemaTree,
  Table as TableTree,
} from "@perchjs/core";
import {
  Repeater,
  Schema,
  Section,
  Table,
  TextColumn,
  TextFilter,
  TextInput,
} from "@perchjs/core";
import { PrismaDataAdapter } from "@perchjs/prisma";
import { PanelModule, PanelResource } from "@perchjs/nest";

const DATABASE_URL = process.env["DATABASE_URL"];
const withDatabase = DATABASE_URL === undefined ? describe.skip : describe;

let pool: pg.Pool;
let client: { $disconnect: () => Promise<void> };
let adapter: DataAdapter;

/**
 * What a host has to write to use the real adapter, and the reason this test
 * exists as much as the queries do: `dataAdapter` is built by Nest's container,
 * and `PrismaDataAdapter` takes a client and an IR. Nothing else in the
 * repository had ever written this class.
 *
 * No `@Injectable()`: it takes no constructor arguments, so there is nothing
 * for the container to look up.
 */
class AppAdapter implements DataAdapter {
  ir = () => adapter.ir();
  meta = (model: string) => adapter.meta(model);
  findMany: DataAdapter["findMany"] = (query) => adapter.findMany(query);
  findOne: DataAdapter["findOne"] = (model, id, include) =>
    adapter.findOne(model, id, include);
  create: DataAdapter["create"] = (model, data) => adapter.create(model, data);
  update: DataAdapter["update"] = (model, id, data) => adapter.update(model, id, data);
  delete: DataAdapter["delete"] = (model, ids) => adapter.delete(model, ids);
  forceDelete: DataAdapter["forceDelete"] = (model, ids) =>
    adapter.forceDelete(model, ids);
  restore: DataAdapter["restore"] = (model, ids) => adapter.restore(model, ids);
  transaction: DataAdapter["transaction"] = (fn) => adapter.transaction(fn);
}

/**
 * Declared without decorator syntax, which is off outside `@perchjs/nest` and
 * deliberately so. A decorator is a function; it is applied below as one.
 */
class AuthorResource {
  table(): TableTree {
    return Table.make()
      .columns([
        TextColumn.make("name").label("Name").sortable().searchable(),
        // Through a relation, which is what no fake ever has to resolve.
        TextColumn.make("country.name").label("Country"),
      ])
      .filters([TextFilter.make("email").label("Email contains")]);
  }

  form(): SchemaTree {
    return Schema.make([
      Section.make("Author").schema([
        TextInput.make("name").label("Name").required(),
        TextInput.make("email").label("Email").required(),
      ]),
      // A hasMany written in the same request as its parent.
      Repeater.make("posts")
        .label("Posts")
        .schema([TextInput.make("title").label("Title").required()]),
    ]);
  }
}

PanelResource({ model: "Author", slug: "authors" })(AuthorResource);

function assets(): {
  directory: string;
  entries: Record<string, string>;
  chunks: readonly string[];
} {
  const directory = mkdtempSync(join(tmpdir(), "perch-panel-db-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    // Empty, and required: the asset route reads this as its allowlist, and
    // the boot iterates it. Missing, the module threw before a single test in
    // this file ran — which nothing noticed, because it only runs where a
    // database exists, and that is CI alone.
    chunks: [],
  };
}

let app: INestApplication;
let url: string;

beforeAll(async () => {
  if (DATABASE_URL === undefined) return;

  pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { PrismaClient } = (await import("./.generated/client/index.js")) as {
    PrismaClient: new (options: unknown) => Record<string, never>;
  };
  const { IR } = (await import("./.generated/ir.ts")) as { IR: Ir };

  client = new PrismaClient({ adapter: new PrismaPg(pool) }) as never;
  adapter = new PrismaDataAdapter({ client: client as never, ir: IR });

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [AuthorResource],
        dataAdapter: AppAdapter,
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await client?.$disconnect();
  await pool?.end();
});

/** Unique to this file, so the filter below cannot reach another one's rows. */
const READER = "ada.panel@example.com";
const WRITER = "grace.panel@example.com";

/**
 * Every list here is filtered to this file's own rows.
 *
 * `filter.<name>`, which is the declared filter's name and not a path: a
 * parameter no filter declares is dropped in silence, so a wrong shape here
 * reads as a list that matched everything.
 */
function records(email: string, extra = ""): string {
  return `${url}/admin/api/authors/records?filter.email=${encodeURIComponent(email)}${extra}`;
}

const COUNTRY = "Panel France";

/**
 * Removes what a previous run of this file left, and nothing else. Email and
 * country name are unique, so seeding twice would collide; wiping the tables
 * instead would take the other file's rows with it.
 */
async function clear(): Promise<void> {
  for (const [model, path, value] of [
    ["Author", "email", READER],
    ["Author", "email", WRITER],
    ["Country", "name", COUNTRY],
  ] as const) {
    const page = await adapter.findMany({
      model,
      clauses: [{ path, operator: "equals", value }],
    });
    // Posts go with their author: the schema cascades that one.
    await adapter.delete(
      model,
      page.rows.map((row) => row["id"] as never),
    );
  }
}

withDatabase("the panel over the real adapter", () => {
  let reader: Row;

  beforeAll(async () => {
    await clear();
    const france = await adapter.create("Country", { set: { name: COUNTRY } });
    reader = await adapter.create("Author", {
      set: { email: READER, name: "Ada Lovelace" },
      relations: { country: { connect: [france["id"] as never] } },
    });
  }, 60_000);

  it("lists rows PostgreSQL returned, and a column that reached through a relation", async () => {
    const answer = await fetch(records(READER, "&with=country"));
    const body = (await answer.json()) as { rows: Row[]; total: number };

    expect(answer.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.rows[0]?.["name"]).toBe("Ada Lovelace");
    expect((body.rows[0]?.["country"] as Row)?.["name"]).toBe(COUNTRY);
  });

  it("filters on the text the reader typed", async () => {
    const found = (await (await fetch(records(READER))).json()) as { total: number };
    const missing = (await (await fetch(records("nobody@example.com"))).json()) as {
      total: number;
    };

    expect(found.total).toBe(1);
    expect(missing.total).toBe(0);
  });

  it("draws an edit page from a row the database holds", async () => {
    const id = reader["id"];

    const page = await (await fetch(`${url}/admin/authors/${String(id)}/edit`)).text();

    expect(page).toContain("Ada Lovelace");
  });

  it("saves through the whole chain, with its children, in one request", async () => {
    const answer = await fetch(`${url}/admin/api/authors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: {
          name: "Grace Hopper",
          email: WRITER,
          // The keys a repeater's rows are addressed by are the client's, and
          // the row it writes is a child Prisma has to create nested.
          posts: ["a", "b"],
          "posts.a.title": "On compilers",
          "posts.b.title": "On bugs",
        },
      }),
    });

    expect(answer.status).toBe(200);

    const authors = await adapter.findMany({
      model: "Author",
      clauses: [{ path: "email", operator: "equals", value: WRITER }],
    });
    const saved = authors.rows[0];
    expect(saved?.["name"]).toBe("Grace Hopper");

    // Its own children, asked for by their parent: another file writing posts
    // at the same moment must not be able to change this answer.
    const posts = await adapter.findMany({
      model: "Post",
      clauses: [{ path: "authorId", operator: "equals", value: saved?.["id"] }],
    });
    expect(posts.rows.map((row) => row["title"]).sort()).toEqual([
      "On bugs",
      "On compilers",
    ]);
  });
});
