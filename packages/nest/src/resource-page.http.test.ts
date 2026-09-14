/**
 * A page about one record, over HTTP.
 *
 * Two claims are under test. That the browser needed nothing: the page is
 * handed a base address and the bundle asks it the same questions it asks a
 * form, so a dependent field takes its round trip and a required one left
 * empty comes back with its error. And that a page under a record is not a way
 * around the policy on that record — the row is loaded and its `view` is asked
 * before anything else happens, the page's own gate coming after.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter, Id, Ir, ModelMeta, Row } from "@perchjs/core";
import { Schema, Select, TextEntry, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { PanelResourcePage } from "./resource-page.js";
import { model } from "./__fixtures__/ir.js";

const ROWS: Row[] = [
  { id: 1, title: "Ada's post", views: 120 },
  { id: 2, title: "Grace's post", views: 7 },
];

/** What a submit wrote, so a test can say whether it ran. */
const written: { id: unknown; state: Record<string, unknown> }[] = [];

@Injectable()
class MemoryAdapter implements DataAdapter {
  ir(): Ir {
    return { models: [] };
  }
  meta(): ModelMeta {
    return model({ fields: [] });
  }
  findMany(): Promise<{ rows: readonly Row[]; total: number }> {
    return Promise.resolve({ rows: ROWS, total: ROWS.length });
  }
  findOne(_model: string, id: Id): Promise<Row | null> {
    if (!Number.isInteger(id))
      throw new TypeError(`id must be an Int, got ${String(id)}`);
    return Promise.resolve(ROWS.find((row) => row["id"] === id) ?? null);
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

@Injectable()
class Stats {
  reach(views: unknown): string {
    return `${String(views)} readers`;
  }
}

@Module({ providers: [Stats], exports: [Stats] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class StatsModule {}

@PanelResourcePage({ path: "stats", label: "Statistics", icon: "star" })
class StatsPage {
  constructor(private readonly stats: Stats) {}
  schema(): Schema {
    return Schema.make([
      TextInput.make("summary").required(),
      Select.make("range").options({ week: "This week" }).live(),
      Select.make("detail")
        .options({ full: "Full" })
        .visible(({ get }) => Boolean(get("range"))),
    ]);
  }
  state(record: Row): Record<string, unknown> {
    return { summary: this.stats.reach(record["views"]) };
  }
  submit(record: Row, state: Record<string, unknown>): void {
    written.push({ id: record["id"], state });
  }
}

@PanelResourcePage({ path: "audit" })
class AuditPage {
  can = {
    viewAny: (user: unknown) =>
      (user as { admin?: boolean } | undefined)?.admin === true,
  };
  schema(): Schema {
    return Schema.make([TextInput.make("trail")]);
  }
}

@PanelResourcePage({ path: "chart" })
class ChartPage {
  schema(): Schema {
    return Schema.make([TextInput.make("note")]);
  }
}

@PanelResource({
  model: "Post",
  slug: "posts",
  pages: [StatsPage, AuditPage, ChartPage],
})
class PostResource {
  can = {
    view: (_user: unknown, record: unknown) => (record as Row)["id"] !== 2,
  };
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  infolist(): Schema {
    return Schema.make([TextEntry.make("title")]);
  }
}

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { admin: boolean };
    }>();
    request.user = { admin: request.headers["x-admin"] === "yes" };
    return true;
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-resource-page-"));
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
  written.length = 0;
});

async function serve(): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        dataAdapter: MemoryAdapter,
        guards: [HeaderGuard],
        imports: [StatsModule],
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

const unescape = (raw: string): string =>
  raw
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const attribute = (html: string, name: string): string =>
  unescape(new RegExp(`${name}="([^"]*)"`).exec(html)?.[1] ?? "");

const paths = (payload: Record<string, unknown>): readonly string[] =>
  (
    (payload["schema"] as { children?: readonly { path?: string }[] }).children ?? []
  ).flatMap((one) => (one.path === undefined ? [] : [one.path]));

const admin = { "x-admin": "yes" };

describe("the page", () => {
  it("is served under the record it is about", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/posts/1/stats`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("starts from the row, through whatever the page made of it", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/posts/1/stats`)).text();
    const payload = JSON.parse(attribute(html, "data-payload")) as Record<
      string,
      unknown
    >;

    // Which is also the injected service doing its work: a page that cannot
    // reach one is a page that cannot do its job.
    expect(payload["state"]).toEqual({ summary: "120 readers" });
  });

  it("carries its tree resolved, the dependent field pruned", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/posts/1/stats`)).text();
    const payload = JSON.parse(attribute(html, "data-payload")) as Record<
      string,
      unknown
    >;

    expect(paths(payload)).toEqual(["summary", "range"]);
  });

  it("points the bundle at its own address under the record", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/posts/1/stats`)).text();

    expect(attribute(html, "data-api")).toBe("/admin/api/posts/1/page/stats");
  });

  it("leaves the generated pages where they were", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/posts/1/edit`)).status).toBe(200);
    expect((await fetch(`${url}/admin/posts/1`)).status).toBe(200);
  });

  it("is a 404 at a segment the resource never declared", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/posts/1/nowhere`)).status).toBe(404);
  });

  it("is a 404 on a row that is not there", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/posts/99/stats`)).status).toBe(404);
  });
});

describe("the policy on the record", () => {
  it("gates the page, a page under a row being no way around it", async () => {
    // Row 2 is one this reader may not view. The page about it is refused for
    // the same reason the record is.
    const url = await serve();

    expect((await fetch(`${url}/admin/posts/2/stats`)).status).toBe(404);
    expect(
      (
        await fetch(`${url}/admin/api/posts/2/page/stats/state`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: {} }),
        })
      ).status,
    ).toBe(404);
  });

  it("is asked before the page's own gate, which narrows it further", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/posts/1/audit`)).status).toBe(404);
    expect((await fetch(`${url}/admin/posts/1/audit`, { headers: admin })).status).toBe(
      200,
    );
  });
});

describe("a round trip on a record page", () => {
  const ask = async (url: string, state: Record<string, unknown>, dirtyPath?: string) =>
    await fetch(`${url}/admin/api/posts/1/page/stats/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state,
        ...(dirtyPath === undefined ? {} : { dirtyPath }),
      }),
    });

  it("answers what a form's does, at the page's own address", async () => {
    const url = await serve();
    const payload = (await (
      await ask(url, { range: "week" }, "range")
    ).json()) as Record<string, unknown>;

    expect(paths(payload)).toEqual(["summary", "range", "detail"]);
  });

  it("drops a path no field on this page admits", async () => {
    const url = await serve();
    const payload = (await (
      await ask(url, { summary: "x", stowaway: "!" })
    ).json()) as Record<string, unknown>;

    expect(payload["state"]).not.toHaveProperty("stowaway");
  });
});

describe("pressing save", () => {
  const save = async (url: string, state: Record<string, unknown>, at = "stats") =>
    await fetch(`${url}/admin/api/posts/1/page/${at}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...admin },
      body: JSON.stringify({ state }),
    });

  it("hands the page its row and what survived the boundary", async () => {
    const url = await serve();
    const answer = (await (
      await save(url, { summary: "up", stowaway: "!" })
    ).json()) as Record<string, unknown>;

    expect(written).toEqual([{ id: 1, state: { summary: "up" } }]);
    expect(answer["notification"]).toBe("Statistics saved.");
  });

  it("runs nothing where the form has errors", async () => {
    const url = await serve();
    const answer = (await (await save(url, { summary: "" })).json()) as Record<
      string,
      unknown
    >;

    expect(written).toEqual([]);
    expect(answer["errors"]).toHaveProperty("summary");
  });

  it("is a 404 on a page that only shows", async () => {
    const url = await serve();

    expect((await save(url, { note: "x" }, "chart")).status).toBe(404);
  });
});

describe("the strip of links a record carries", () => {
  const strip = async (url: string, at: string, headers: Record<string, string> = {}) =>
    JSON.parse(
      attribute(
        await (await fetch(`${url}${at}`, { headers })).text(),
        "data-record-pages",
      ),
    ) as readonly { label: string; href: string; current?: true }[];

  it("holds the generated pages and the declared ones together", async () => {
    // A strip of only the declared ones would leave a reader on a statistics
    // screen with no way back to the form.
    const url = await serve();

    expect((await strip(url, "/admin/posts/1/stats")).map((one) => one.label)).toEqual([
      "View",
      "Edit",
      "Statistics",
      "Chart",
    ]);
  });

  it("is on the form and the view too, not only on the pages themselves", async () => {
    const url = await serve();

    expect((await strip(url, "/admin/posts/1/edit")).length).toBeGreaterThan(1);
    expect((await strip(url, "/admin/posts/1")).length).toBeGreaterThan(1);
  });

  it("names the page being read", async () => {
    const url = await serve();
    const here = (await strip(url, "/admin/posts/1/stats")).find(
      (one) => one.current === true,
    );

    expect(here?.label).toBe("Statistics");
  });

  it("never links to a page that would answer 404", async () => {
    const url = await serve();

    expect(
      (await strip(url, "/admin/posts/1/stats")).map((o) => o.label),
    ).not.toContain("Audit");
    expect(
      (await strip(url, "/admin/posts/1/stats", admin)).map((o) => o.label),
    ).toContain("Audit");
  });

  it("is absent on a create, where there is no record yet", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/posts/create`)).text();

    expect(html).not.toContain("data-record-pages");
  });
});
