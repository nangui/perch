/**
 * A page with a schema and no model behind it, over HTTP.
 *
 * The claim being tested is that the browser needs nothing new. It was handed
 * a base address and asks the same two questions of it that it asks of a
 * resource's form — so a dependent `Select` on a settings screen works, and a
 * required field left empty comes back with its error, without a line written
 * for pages anywhere in the bundle.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Schema, Select, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelPage } from "./custom-page.js";
import { PanelResource } from "./resource.js";

const JS = "panel-a1b2c3d4.js";
const CSS = "panel-e5f6a7b8.css";

/** What a submit wrote, so a test can say whether it ran. */
const written: Record<string, unknown>[] = [];

@PanelPage({ path: "settings", label: "Settings", icon: "star" })
class SettingsPage {
  schema(): Schema {
    return Schema.make([
      TextInput.make("title").required(),
      Select.make("theme").options({ dark: "Dark" }).live(),
      Select.make("accent")
        .options({ teal: "Teal" })
        .visible(({ get }) => Boolean(get("theme"))),
    ]);
  }
  state(): Record<string, unknown> {
    return { title: "Perch" };
  }
  submit(state: Record<string, unknown>): void {
    written.push(state);
  }
}

@PanelPage({ path: "dashboard" })
class DashboardPage {
  schema(): Schema {
    return Schema.make([TextInput.make("note")]);
  }
}

@PanelPage({ path: "secret" })
class SecretPage {
  can = {
    viewAny: (user: unknown) =>
      (user as { admin?: boolean } | undefined)?.admin === true,
  };
  schema(): Schema {
    return Schema.make([TextInput.make("key")]);
  }
}

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-custom-page-"));
  writeFileSync(join(directory, JS), "export const panel = 1;\n");
  writeFileSync(join(directory, CSS), ".perch-root{}\n");
  return { directory, entries: { "panel.js": JS, "panel.css": CSS }, chunks: [] };
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
        resources: [PersonResource],
        pages: [SettingsPage, DashboardPage, SecretPage],
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

const payloadOf = (html: string): Record<string, unknown> =>
  JSON.parse(
    (/data-payload="([^"]*)"/.exec(html)?.[1] ?? "")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&"),
  ) as Record<string, unknown>;

const paths = (payload: Record<string, unknown>): readonly string[] =>
  (
    (payload["schema"] as { children?: readonly { path?: string }[] }).children ?? []
  ).flatMap((one) => (one.path === undefined ? [] : [one.path]));

describe("the page itself", () => {
  it("is served at its own segment, under the panel", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/settings`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("carries the values it said it starts with", async () => {
    // A settings page that opens empty wipes the settings the first time
    // somebody presses save.
    const url = await serve();
    const payload = payloadOf(await (await fetch(`${url}/admin/settings`)).text());

    expect(payload["state"]).toEqual({ title: "Perch" });
  });

  it("carries its tree already resolved, the dependent field pruned", async () => {
    const url = await serve();
    const payload = payloadOf(await (await fetch(`${url}/admin/settings`)).text());

    expect(paths(payload)).toEqual(["title", "theme"]);
  });

  it("points the bundle at its own API rather than a resource's", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/settings`)).text();

    expect(html).toContain('data-api="/admin/api/page/settings"');
  });

  it("leaves the resources answering where they did", async () => {
    const url = await serve();

    // Its list wants a data adapter this fixture has none of; its form does
    // not, and either one answering is the point.
    expect((await fetch(`${url}/admin/people/create`)).status).toBe(200);
  });

  it("is a 404 at a segment nobody declared", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/nowhere`)).status).toBe(404);
  });
});

describe("a round trip on a page", () => {
  it("answers the same question a form's does, at the page's own address", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/api/page/settings/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: { theme: "dark" }, dirtyPath: "theme" }),
    });
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    // The dependent field appears, which is the whole of milestone A1 working
    // on a page nobody wrote client code for.
    expect(paths(payload)).toEqual(["title", "theme", "accent"]);
  });

  it("drops a path no field on this page admits", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/api/page/settings/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: { title: "x", stowaway: "!" } }),
    });
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload["state"]).not.toHaveProperty("stowaway");
  });
});

describe("pressing save", () => {
  const save = async (url: string, state: Record<string, unknown>, at = "settings") =>
    await fetch(`${url}/admin/api/page/${at}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    });

  it("hands the page what survived the boundary, and says so", async () => {
    const url = await serve();
    const response = await save(url, { title: "Perch", stowaway: "!" });
    const answer = (await response.json()) as Record<string, unknown>;

    expect(written).toEqual([{ title: "Perch" }]);
    expect(answer["notification"]).toBe("Settings saved.");
  });

  it("runs nothing where the form has errors", async () => {
    // Whatever submit does is the write, and running it on a state the form
    // itself refuses is the one order that cannot be undone.
    const url = await serve();
    const answer = (await (await save(url, { title: "" })).json()) as Record<
      string,
      unknown
    >;

    expect(written).toEqual([]);
    expect(answer["errors"]).toHaveProperty("title");
    // With the tree the errors belong to, so they land on the right field.
    expect(answer["payload"]).toBeTruthy();
  });

  it("is a 404 on a page that only shows", async () => {
    // A save that answers yes and writes nothing is the worst of the three
    // things this could do.
    const url = await serve();

    expect((await save(url, { note: "x" }, "dashboard")).status).toBe(404);
  });
});

describe("a page this reader may not have", () => {
  it("is a 404 rather than a refusal, so asking tells them nothing", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/secret`)).status).toBe(404);
    expect(
      (
        await fetch(`${url}/admin/api/page/secret/state`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: {} }),
        })
      ).status,
    ).toBe(404);
  });

  it("is not in the menu either", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/settings`)).text();

    expect(html).toContain("Settings");
    expect(html).not.toContain("secret");
  });
});

describe("the menu", () => {
  it("holds the pages beside the resources", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/settings`)).text();
    const raw = /data-navigation="([^"]*)"/.exec(html)?.[1] ?? "";
    const navigation = JSON.parse(
      raw.replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
    ) as readonly { items: readonly { label: string; href: string }[] }[];
    const items = navigation.flatMap((group) => group.items);

    expect(items.map((one) => one.label)).toEqual(["Persons", "Dashboard", "Settings"]);
    expect(items.find((one) => one.label === "Settings")?.href).toBe("/admin/settings");
  });

  it("marks the page being read", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/settings`)).text();

    expect(html).toContain("&quot;current&quot;:true");
  });
});
