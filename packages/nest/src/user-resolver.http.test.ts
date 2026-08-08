/**
 * A resolver has to be able to ask who is looking. Perch authenticates nobody —
 * the guards decide whether a request gets through, and this decides what the
 * principal they left behind looks like by the time a resolver reads it.
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
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import type { PanelModuleOptions } from "./panel.module.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import type { UserResolver } from "./user-resolver.js";

interface Principal {
  readonly name: string;
  readonly admin: boolean;
}

/** Reads the header a guard would normally have validated. */
@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: Principal;
    }>();
    const name = request.headers["x-user"];
    if (name === undefined) return true;
    request.user = { name, admin: name === "root" };
    return true;
  }
}

/** A panel that keeps its principal somewhere other than `request.user`. */
@Injectable()
class SessionUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    const headers = (request as { headers?: Record<string, string | undefined> })
      .headers;
    return { name: headers?.["x-session"] ?? "anonymous", admin: false };
  }
}

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("name").label(({ user }) => `Name — ${label(user)}`),
      // Only an administrator may see this field, so only an administrator may
      // send a value for it.
      TextInput.make("salary").visible(({ user }) => isAdmin(user)),
    ]);
  }
}

const isAdmin = (user: unknown): boolean =>
  (user as Principal | undefined)?.admin === true;
const label = (user: unknown): string =>
  (user as Principal | undefined)?.name ?? "nobody";

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-user-"));
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

async function serve(userResolver?: Type<UserResolver>): Promise<string> {
  const base = {
    path: "/admin",
    resources: [PersonResource],
    guards: [HeaderGuard],
    assets: assets(),
  } satisfies PanelModuleOptions;

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot(
        userResolver === undefined ? base : { ...base, userResolver },
      ),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

async function post(
  url: string,
  headers: Record<string, string>,
  state: Record<string, unknown> = {},
): Promise<SchemaPayload> {
  const response = await fetch(`${url}/admin/api/people/state`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ state, dirtyPath: "name", operation: "create" }),
  });
  return (await response.json()) as SchemaPayload;
}

const field = (payload: SchemaPayload, path: string): SchemaNode | undefined =>
  payload.schema.children?.find((node) => node.path === path);

describe("the principal reaches the resolvers", () => {
  it("is read off request.user by default", async () => {
    const url = await serve();

    expect(field(await post(url, { "x-user": "ada" }), "name")?.label).toBe(
      "Name — ada",
    );
  });

  it("is whatever a configured resolver says instead", async () => {
    const url = await serve(SessionUserResolver);

    expect(field(await post(url, { "x-session": "grace" }), "name")?.label).toBe(
      "Name — grace",
    );
  });

  it("is absent when no guard left one", async () => {
    const url = await serve();

    expect(field(await post(url, {}), "name")?.label).toBe("Name — nobody");
  });

  it("reaches the page as well as the API", async () => {
    const url = await serve();
    const html = await (
      await fetch(`${url}/admin/people/create`, { headers: { "x-user": "ada" } })
    ).text();

    expect(html).toContain("Name — ada");
  });
});

describe("a field the principal may not see", () => {
  it("is absent for everyone else", async () => {
    const url = await serve();

    expect(field(await post(url, { "x-user": "ada" }), "salary")).toBeUndefined();
    expect(field(await post(url, { "x-user": "root" }), "salary")).toBeDefined();
  });

  it("refuses a value they send for it anyway", async () => {
    const url = await serve();
    const payload = await post(url, { "x-user": "ada" }, { name: "Ada", salary: 999 });

    expect(payload.state["salary"]).toBeUndefined();
  });

  it("keeps the value an administrator sends", async () => {
    // This is what says the admission passes carry the principal. Resolving
    // them for nobody hides the field from everybody, so the boundary holds and
    // the administrator's own value is thrown away instead.
    const url = await serve();
    const payload = await post(
      url,
      { "x-user": "root" },
      { name: "Root", salary: 999 },
    );

    expect(payload.state["salary"]).toBe(999);
  });
});
