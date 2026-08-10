/**
 * Perch provides no authentication. What it provides is this: the guards handed
 * to `forRoot` stand in front of every panel route, and in front of nothing else.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Type,
} from "@nestjs/common";
import { Controller, Get, Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Schema, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import type { PanelModuleOptions } from "./panel.module.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const JS = "panel-a1b2c3d4.js";

@Injectable()
class Sessions {
  allows(token: string | undefined): boolean {
    return token === "let-me-in";
  }
}

@Module({ providers: [Sessions], exports: [Sessions] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class SessionModule {}

/** Injected, because a real one always is. */
@Injectable()
class TokenGuard implements CanActivate {
  readonly #sessions: Sessions;

  constructor(sessions: Sessions) {
    this.#sessions = sessions;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    return this.#sessions.allows(request.headers["x-token"]);
  }
}

@Controller("elsewhere")
class HostController {
  @Get()
  hello(): string {
    return "host";
  }
}

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-guards-"));
  writeFileSync(join(directory, JS), "export const panel = 1;\n");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return { directory, entries: { "panel.js": JS, "panel.css": "panel-e5f6a7b8.css" } };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(guards?: readonly Type<CanActivate>[]) {
  const base = {
    path: "/admin",
    resources: [PersonResource],
    imports: [SessionModule],
    assets: assets(),
  } satisfies PanelModuleOptions;

  const moduleRef = await Test.createTestingModule({
    imports: [PanelModule.forRoot(guards === undefined ? base : { ...base, guards })],
    controllers: [HostController],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

/**
 * Every route the panel registers, read from the router rather than listed.
 *
 * A hand-written list is a list that stops covering the workspace the moment
 * somebody adds a route — and a panel route that escapes the guards is an
 * authentication bypass, not a gap in coverage. `/records` was added while this
 * list named three routes and would not have been noticed.
 */
function panelRoutes(url: string): readonly string[] {
  const stack = routerStack();
  const requests = stack
    .filter((path) => path.startsWith("/admin"))
    .map((path) =>
      path.replace(":resource", "people").replace(":file", JS).replace(":id", "1"),
    )
    .map((path) => `${url}${path}`);

  expect(requests.length, "no panel route was found to check").toBeGreaterThan(4);
  return requests;
}

interface Layer {
  readonly route?: { readonly path?: string };
}

function routerStack(): readonly string[] {
  const server = app?.getHttpAdapter().getInstance() as {
    router?: { stack?: Layer[] };
    _router?: { stack?: Layer[] };
  };
  const stack = server.router?.stack ?? server._router?.stack ?? [];
  return stack
    .map((layer) => layer.route?.path)
    .filter((p): p is string => p !== undefined);
}

describe("guards stand in front of every panel route", () => {
  it("refuses every one of them without the token", async () => {
    const url = await serve([TokenGuard]);

    for (const route of panelRoutes(url)) {
      const response = await fetch(route, { method: methodFor(route) });
      expect(response.status, `${route} answered ${String(response.status)}`).toBe(403);
    }
  });

  it("lets all three through with it", async () => {
    const url = await serve([TokenGuard]);
    const withToken = { "x-token": "let-me-in" };

    expect(
      (await fetch(`${url}/admin/people/create`, { headers: withToken })).status,
    ).toBe(200);
    expect(
      (await fetch(`${url}/admin/assets/${JS}`, { headers: withToken })).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${url}/admin/api/people/state`, {
          method: "POST",
          headers: { ...withToken, "content-type": "application/json" },
          body: JSON.stringify({ state: {}, dirtyPath: "name", operation: "create" }),
        })
      ).status,
    ).toBe(200);
  });
});

/** The verb does not matter to a guard, but the route has to exist to be refused. */
function methodFor(url: string): string {
  if (url.endsWith("/edit") || url.includes("/assets/") || url.endsWith("/create")) {
    return "GET";
  }
  if (url.endsWith("/records")) return "GET";
  if (/\/api\/[^/]+\/\d+$/.test(url)) return "PATCH";
  if (url.endsWith("/state")) return "POST";
  return "POST";
}

describe("and in front of nothing else", () => {
  it("leaves the host's own routes alone", async () => {
    // A global guard would have taken these too, which is why the guards are not
    // registered as one.
    const url = await serve([TokenGuard]);

    expect((await fetch(`${url}/elsewhere`)).status).toBe(200);
  });

  it("leaves the panel open when none are given", async () => {
    const url = await serve();

    expect((await fetch(`${url}/admin/people/create`)).status).toBe(200);
  });
});

describe("guards do not leak between panels", () => {
  it("does not carry the first panel's guards into a later one", async () => {
    // The controllers are module-level singletons; decorating them in place
    // would leave the guards behind for whatever came next.
    await serve([TokenGuard]);
    await app?.close();
    app = undefined;

    const url = await serve();
    expect((await fetch(`${url}/admin/people/create`)).status).toBe(200);
  });
});
