/**
 * A refusal has to protect the routes, not just hide a button, and it has to
 * look exactly like a resource that was never there.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Schema, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { Authorization } from "./authorization.js";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import type { ResourceClass } from "./resource-registry.js";

interface Principal {
  readonly role: string;
}

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: Principal;
    }>();
    request.user = { role: request.headers["x-role"] ?? "guest" };
    return true;
  }
}

const form = (): Schema => Schema.make([TextInput.make("title")]);
const role = (user: unknown): string =>
  (user as Principal | undefined)?.role ?? "guest";

@PanelResource({ model: "Open", slug: "open" })
class OpenResource {
  form = form;
}

@PanelResource({ model: "Gated", slug: "gated" })
class GatedResource {
  form = form;
  can: Authorization = { viewAny: (user) => role(user) !== "guest" };
}

@PanelResource({ model: "Readable", slug: "readable" })
class ReadableResource {
  form = form;
  can: Authorization = { create: (user) => role(user) === "admin" };
}

@PanelResource({ model: "Owned", slug: "owned" })
class OwnedResource {
  form = form;
  // Record-scoped, and no record is loaded yet.
  can: Authorization = { update: () => true };
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-can-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(): Promise<string> {
  const resources: ResourceClass[] = [
    OpenResource,
    GatedResource,
    ReadableResource,
    OwnedResource,
  ];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources,
        guards: [HeaderGuard],
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

const page = (url: string, slug: string, role: string): Promise<Response> =>
  fetch(`${url}/admin/${slug}/create`, { headers: { "x-role": role } });

const state = (
  url: string,
  slug: string,
  role: string,
  operation = "create",
): Promise<Response> =>
  fetch(`${url}/admin/api/${slug}/state`, {
    method: "POST",
    headers: { "x-role": role, "content-type": "application/json" },
    body: JSON.stringify({ state: {}, dirtyPath: "title", operation }),
  });

describe("no `can` means allowed", () => {
  it("serves the page and the API to anyone the guards let in", async () => {
    const url = await serve();

    expect((await page(url, "open", "guest")).status).toBe(200);
    expect((await state(url, "open", "guest")).status).toBe(200);
  });
});

describe("a viewAny refusal protects the routes", () => {
  it("hides both of them from a guest", async () => {
    const url = await serve();

    expect((await page(url, "gated", "guest")).status).toBe(404);
    expect((await state(url, "gated", "guest")).status).toBe(404);
  });

  it("opens both of them to anyone else", async () => {
    const url = await serve();

    expect((await page(url, "gated", "editor")).status).toBe(200);
    expect((await state(url, "gated", "editor")).status).toBe(200);
  });

  it("answers exactly as it does for a resource that never existed", async () => {
    const url = await serve();
    const refused = await page(url, "gated", "guest");
    const absent = await page(url, "nope", "guest");

    expect(refused.status).toBe(absent.status);
    expect(await refused.text()).toBe(await absent.text());
  });
});

describe("create is checked per operation", () => {
  it("refuses an editor and admits an administrator", async () => {
    const url = await serve();

    expect((await page(url, "readable", "editor")).status).toBe(404);
    expect((await state(url, "readable", "editor")).status).toBe(404);
    expect((await page(url, "readable", "admin")).status).toBe(200);
  });
});

describe("an edit with no adapter behind it", () => {
  it("is refused", async () => {
    // Refused before authorisation is even asked: this panel has no adapter, so
    // there is no row for the edit to be about. That `authorize` also refuses a
    // record-scoped check with no record is its own test.
    const url = await serve();

    expect((await state(url, "owned", "admin", "edit")).status).toBe(404);
  });

  it("still allows the operations that check out", async () => {
    const url = await serve();

    expect((await state(url, "owned", "admin")).status).toBe(200);
  });
});
