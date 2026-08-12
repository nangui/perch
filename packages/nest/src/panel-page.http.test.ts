/**
 * The page a browser actually receives, and the URLs it would follow from it.
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
import { PanelResource } from "./resource.js";

const JS = "panel-a1b2c3d4.js";
const CSS = "panel-e5f6a7b8.css";

@PanelResource({ model: "Person", slug: "people", label: "Person" })
class PersonResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("name").required(),
      Select.make("countryId").options({ fr: "France" }).live(),
      Select.make("cityId")
        .options({ paris: "Paris" })
        .visible(({ get }) => Boolean(get("countryId"))),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-page-"));
  writeFileSync(join(directory, JS), "export const panel = 1;\n");
  writeFileSync(join(directory, CSS), ".perch-root{}\n");
  return { directory, entries: { "panel.js": JS, "panel.css": CSS } };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(globalPrefix?: string): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PersonResource],
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  if (globalPrefix !== undefined) app.setGlobalPrefix(globalPrefix);
  await app.listen(0);
  return await app.getUrl();
}

describe("the create page", () => {
  it("is HTML the browser will not cache", async () => {
    const url = await serve();
    const response = await fetch(`${url}/admin/people/create`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    // It embeds one record's state; a shared cache would hand it to the next
    // visitor.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("carries the resolved form, with the dependent field already pruned", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/people/create`)).text();
    const raw = /data-payload="([^"]*)"/.exec(html)?.[1] ?? "";
    const payload = JSON.parse(
      raw
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&"),
    ) as { schema: { children?: { path?: string }[] } };
    const paths = payload.schema.children?.map((node) => node.path);

    expect(paths).toContain("countryId");
    expect(paths).not.toContain("cityId");
  });

  it("serves the assets it points at", async () => {
    const url = await serve();
    const html = await (await fetch(`${url}/admin/people/create`)).text();
    const script = /src="([^"]*)"/.exec(html)?.[1] ?? "";

    const asset = await fetch(`${url}${script}`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("export const panel");
  });

  it("keeps every URL right under a global prefix", async () => {
    // The controller cannot see setGlobalPrefix, so the root is taken from the
    // URL that reached it. This is what says that works.
    const url = await serve("api/v1");
    const html = await (await fetch(`${url}/api/v1/admin/people/create`)).text();

    expect(html).toContain('data-api="/api/v1/admin/api/people"');
    expect(html).toContain(`src="/api/v1/admin/assets/${JS}"`);
    expect((await fetch(`${url}/api/v1/admin/assets/${JS}`)).status).toBe(200);
  });

  it("still finds its root when the slug arrives percent-encoded", async () => {
    // Express decodes the route parameter but not the URL it came from, so a
    // raw match would miss and every link on the page would be wrong.
    const url = await serve();
    const html = await (await fetch(`${url}/admin/%70eople/create`)).text();

    expect(html).toContain('data-api="/admin/api/people"');
  });

  it("answers 404 for a resource that is not registered", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/nope/create`)).status).toBe(404);
  });

  it("leaves the routes it sits beside alone", async () => {
    // `:resource/create` is greedy enough to swallow both if it is registered
    // first; the module orders the controllers for that reason.
    const url = await serve();

    expect((await fetch(`${url}/admin/assets/${JS}`)).status).toBe(200);
    expect(
      (
        await fetch(`${url}/admin/api/people/state`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: {}, dirtyPath: "name", operation: "create" }),
        })
      ).status,
    ).toBe(200);
  });
});
