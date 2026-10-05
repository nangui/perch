/**
 * A list gathered into groups.
 *
 * Four things make it a grouping rather than something that looks like one:
 * the page is ordered by the group ahead of what the reader asked for, the
 * sizes are the groups' and not the parts of them on the page, only the groups
 * this page draws are asked about, and the rows holding nothing are a group
 * rather than rows nobody accounts for.
 *
 * The third is the one with teeth. A page that asked about every group would
 * grow with the table, which is the N+1 this project refuses, one level up.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DataAdapter,
  GroupCount,
  GroupQuery,
  Id,
  Ir,
  ModelMeta,
  Query,
  Row,
  Sort,
} from "@perchjs/core";
import { Schema, SelectFilter, Table, TextColumn, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { key, model, scalar } from "./__fixtures__/ir.js";

/** Two teams, one row holding nothing, so the null group is on every page. */
const ROWS: Row[] = [
  { id: 1, name: "Ada", team: "swifts", seat: 2 },
  { id: 2, name: "Grace", team: "swifts", seat: 5 },
  { id: 3, name: "Katherine", team: "wrens", seat: 1 },
  { id: 4, name: "Mei", team: null, seat: 9 },
];

let gathered: GroupQuery[] = [];
let pages: Query[] = [];

beforeEach(() => {
  gathered = [];
  pages = [];
});

/** A value as something comparable, or as nothing. */
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * Whether a key is one the clauses kept.
 *
 * Only the two shapes this layer sends: a list of keys, and nothing at all.
 * A double that read more would be answering questions nobody asks it.
 */
function admitted(
  key: unknown,
  by: string,
  clauses: readonly { path: string; operator: string; value: unknown }[],
): boolean {
  return clauses.every((clause) => {
    if (clause.path !== by) return true;
    // A clause about another column says nothing about this key. Read rather
    // than assumed: without it, a narrowing on any other path would compare
    // its value to the group key and drop every row.

    if (clause.operator === "in") {
      return Array.isArray(clause.value) && clause.value.includes(key);
    }
    if (clause.operator === "equals") return key === clause.value;
    return true;
  });
}

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [this.meta()] };
  }
  meta(): ModelMeta {
    return model({
      name: "Person",
      fields: [
        key(),
        scalar("name"),
        scalar("team"),
        scalar("seat", { type: "Int" }),
        scalar("joinedAt", { type: "DateTime" }),
      ],
    });
  }
  findMany(query: Query): Promise<{ rows: readonly Row[]; total: number }> {
    pages.push(query);
    const sorted = [...ROWS].sort((a, b) => {
      for (const one of query.sort ?? []) {
        const left = text(a[one.path]);
        const right = text(b[one.path]);
        if (left !== right) {
          return one.direction === "asc"
            ? left.localeCompare(right)
            : right.localeCompare(left);
        }
      }
      return 0;
    });
    const from = query.skip ?? 0;
    return Promise.resolve({
      rows: sorted.slice(from, from + (query.take ?? ROWS.length)),
      total: ROWS.length,
    });
  }
  groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
    gathered.push(query);
    // Honours the clauses, which is what makes two reads two reads: a double
    // answering every group whatever it was asked would hand back the same
    // groups twice and a design that double-counted would pass.
    //
    // And it answers the whole group's size rather than the part of it on the
    // page, which is the other promise a real adapter keeps here.
    const whole = new Map<string, GroupCount>();
    for (const row of ROWS) {
      const held = (row[query.by] ?? null) as string | number | null;
      if (!admitted(held, query.by, query.clauses ?? [])) continue;
      const under = `${typeof held}:${String(held)}`;
      whole.set(under, { key: held, total: (whole.get(under)?.total ?? 0) + 1 });
    }
    return Promise.resolve([...whole.values()]);
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(ROWS.find((row) => row["id"] === id) ?? null);
  }
  aggregate(): never {
    throw new Error("not needed here");
  }
  create(): Promise<Row> {
    throw new Error("not needed here");
  }
  update(): Promise<Row> {
    throw new Error("not needed here");
  }
  delete(): Promise<number> {
    throw new Error("not needed here");
  }
  forceDelete(): Promise<number> {
    throw new Error("not needed here");
  }
  restore(): Promise<number> {
    throw new Error("not needed here");
  }
  attach(): Promise<void> {
    return Promise.resolve();
  }
  detach(): Promise<void> {
    return Promise.resolve();
  }
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

@PanelResource({ model: "Person", slug: "people" })
class PeopleResource {
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
  table(): Table {
    return (
      Table.make()
        .columns([
          TextColumn.make("name").sortable().searchable(),
          TextColumn.make("seat").sortable(),
        ])
        // A choice rather than a text box, because the clause it makes compares
        // for equality. That is the shape a double comparing clauses without
        // reading their path gets wrong, and a `contains` falls through such a
        // double harmlessly.
        .filters([
          SelectFilter.make("seat").options([
            { value: "2", label: "Two" },
            { value: "5", label: "Five" },
          ]),
        ])
        .groupBy("team")
    );
  }
}

@PanelResource({ model: "Person", slug: "plain" })
class PlainResource {
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
  table(): Table {
    return Table.make().columns([TextColumn.make("name")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-grouped-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(resources: readonly unknown[] = [PeopleResource, PlainResource]) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: resources as never,
        dataAdapter: MemoryAdapter,
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

interface Records {
  readonly groups?: readonly GroupCount[];
  readonly sort?: Sort;
  readonly columns: { readonly groupBy?: string };
}

const records = async (url: string, slug = "people", search = ""): Promise<Records> =>
  (await (await fetch(`${url}/admin/api/${slug}/records${search}`)).json()) as Records;

describe("what a grouped list comes back with", () => {
  it("names the column in the table's shape and the sizes beside the rows", async () => {
    const answer = await records(await serve());

    expect(answer.columns.groupBy).toBe("team");
    expect(answer.groups).toEqual([
      { key: "swifts", total: 2 },
      { key: "wrens", total: 1 },
      { key: null, total: 1 },
    ]);
  });

  it("gathers nothing for a table that gathers nothing", async () => {
    const answer = await records(await serve(), "plain");

    expect(answer.columns.groupBy).toBeUndefined();
    expect(answer.groups).toBeUndefined();
    expect(gathered).toHaveLength(0);
  });

  it("keeps the rows holding nothing as a group of their own", async () => {
    // A list that hides rows while saying it shows them is the worst thing a
    // table does quietly. Mei is in the page and has to be counted somewhere.
    const answer = await records(await serve());

    expect(answer.groups?.some((one) => one.key === null)).toBe(true);
  });
});

describe("how the page is ordered", () => {
  it("orders by the group ahead of what the reader asked for", async () => {
    // A group whose rows are scattered down a page is not a group, and a
    // header appearing three times has stopped meaning anything.
    await records(await serve(), "people", "?sort=seat:desc");

    expect(pages[0]?.sort?.[0]).toEqual({ path: "team", direction: "asc" });
    expect(pages[0]?.sort?.[1]).toEqual({ path: "seat", direction: "desc" });
  });

  it("still answers with the reader's own order, not the group's", async () => {
    // What the client draws its indicator from. Answering the group's column
    // would put the arrow on a column nobody chose.
    const answer = await records(await serve(), "people", "?sort=seat:desc");

    expect(answer.sort).toEqual({ path: "seat", direction: "desc" });
  });

  it("orders by the group even where the reader asked for nothing", async () => {
    await records(await serve());

    expect(pages[0]?.sort?.[0]).toEqual({ path: "team", direction: "asc" });
  });
});

describe("how much a grouped page asks about", () => {
  it("asks only about the keys its own rows hold", async () => {
    // The bound that makes this safe. A page asking about every group would
    // grow with the table.
    //
    // The property rather than which key lands on page one: where a null sorts
    // is the database's answer, and a test naming the key would be a test
    // about this file's double.
    await records(await serve(), "people", "?perPage=1&sort=name");

    expect(gathered).toHaveLength(1);
    expect(gathered[0]?.clauses?.filter((one) => one.path === "team")).toHaveLength(1);
  });

  it("takes a second read for a page holding rows with nothing in it", async () => {
    // `in` over a list holding null matches no row, so the null group would
    // come back missing: the page would show those rows and nothing would say
    // how many there are.
    await records(await serve());

    expect(gathered).toHaveLength(2);
    expect(gathered.flatMap((one) => one.clauses ?? [])).toContainEqual({
      path: "team",
      operator: "equals",
      value: null,
    });
  });

  it("is not confused by a clause about another column", async () => {
    // A clause carries a path, and one about `seat` says nothing about a
    // `team` key. Compared without reading the path it is false for every key,
    // and the page comes back with no groups at all while still showing rows.
    const answer = await records(await serve(), "people", "?filter.seat=2");

    expect(gathered.flatMap((one) => one.clauses ?? [])).toContainEqual({
      path: "seat",
      operator: "equals",
      value: "2",
    });
    expect(answer.groups?.length).toBeGreaterThan(0);
  });

  it("carries the narrowing the page was read with", async () => {
    await records(await serve(), "people", "?search=ada");
    const asked = gathered[0];

    expect(asked?.search?.term).toBe("ada");
    // And not the paging, a group's size being the group's.
    expect((asked as unknown as Query | undefined)?.take).toBeUndefined();
    expect((asked as unknown as Query | undefined)?.skip).toBeUndefined();
  });
});

describe("a column that gathers nothing", () => {
  it("stops the boot, naming the column and what it would have needed", async () => {
    @PanelResource({ model: "Person", slug: "stamped" })
    class StampedResource {
      form(): Schema {
        return Schema.make([TextInput.make("name")]);
      }
      table(): Table {
        return Table.make()
          .columns([TextColumn.make("name")])
          .groupBy("joinedAt");
      }
    }

    await expect(serve([StampedResource])).rejects.toThrow(
      /`joinedAt` is a timestamp, and grouping one without a bucket/,
    );
  });
});
