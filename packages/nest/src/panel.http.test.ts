/**
 * The panel coexists with `setGlobalPrefix` without route collisions. Nothing
 * short of a real server proves that, so this boots one on an ephemeral port
 * and asks it over HTTP.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";

const JS = "panel-abc12345.js";
const CSS = "panel-def67890.css";
const BODY = "export const panel = 1;\n";

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-http-"));
  writeFileSync(join(directory, JS), BODY);
  writeFileSync(join(directory, CSS), ".perch-root{color:red}\n");
  writeFileSync(join(directory, "secret.js"), "const key = 1;\n");
  return { directory, entries: { "panel.js": JS, "panel.css": CSS } };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(options: {
  path: string;
  globalPrefix?: string;
}): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [PanelModule.forRoot({ path: options.path, assets: assets() })],
  }).compile();

  app = moduleRef.createNestApplication();
  if (options.globalPrefix !== undefined) app.setGlobalPrefix(options.globalPrefix);
  await app.listen(0);
  return await app.getUrl();
}

describe("the assets route over HTTP", () => {
  it("serves the file the manifest names, under the configured path", async () => {
    const url = await serve({ path: "/admin" });
    const response = await fetch(`${url}/admin/assets/${JS}`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BODY);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("sits under setGlobalPrefix rather than beside it", async () => {
    // The criterion: the host prefixes its own API, and the panel follows.
    const url = await serve({ path: "/admin", globalPrefix: "api" });

    expect((await fetch(`${url}/api/admin/assets/${JS}`)).status).toBe(200);
    expect((await fetch(`${url}/admin/assets/${JS}`)).status).toBe(404);
  });

  it("answers 404 for a file the manifest does not name", async () => {
    const url = await serve({ path: "/admin" });

    expect((await fetch(`${url}/admin/assets/secret.js`)).status).toBe(404);
  });

  it("does not let a traversal out of the directory", async () => {
    // Encoded, so the router hands the controller the decoded segment rather
    // than resolving it away first.
    const url = await serve({ path: "/admin" });

    expect((await fetch(`${url}/admin/assets/%2e%2e%2fpackage.json`)).status).toBe(404);
    expect((await fetch(`${url}/admin/assets/..%2fpackage.json`)).status).toBe(404);
  });

  it("claims nothing outside its own path", async () => {
    const url = await serve({ path: "/admin" });

    expect((await fetch(`${url}/assets/${JS}`)).status).toBe(404);
    expect((await fetch(`${url}/`)).status).toBe(404);
  });
});
