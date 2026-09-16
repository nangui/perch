/**
 * The panel answers at its own address.
 *
 * It did not. Every page route named a resource, so a reader who mounted a
 * panel at `/admin` and opened `/admin` met a 404 while the documentation told
 * them the panel was there. It is the address an application advertises, the
 * one a browser is left at after a sign-in, and the one somebody pastes into a
 * message, and it was the one address of the panel that did nothing.
 *
 * What it does now is send them to the first thing their menu offers. Theirs is
 * the word that matters: the navigation is filtered per request by what the
 * reader may reach, so two readers land in two places, and one who may reach
 * nothing is told nothing.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Injectable, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Schema, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import type { ResourceClass } from "./resource-registry.js";
import { PanelResource } from "./resource.js";
import type { UserResolver } from "./user-resolver.js";

const JS = "panel-a1b2c3d4.js";
const CSS = "panel-e5f6a7b8.css";

/** The reader is whoever the header says, which is enough to be two readers. */
@Injectable()
class HeaderUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    const headers = (request as { headers?: Record<string, string | undefined> })
      .headers;
    return { role: headers?.["x-role"] ?? "visitor" };
  }
}

const isAdmin = (user: unknown): boolean =>
  (user as { role?: string } | undefined)?.role === "admin";

/** First in the menu, and not everybody's to open. */
@PanelResource({ model: "Person", slug: "staff", navigationSort: 1 })
class StaffResource {
  can = { viewAny: isAdmin };
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
}

@PanelResource({ model: "Post", slug: "posts", navigationSort: 2 })
class PostsResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-panel-root-"));
  writeFileSync(join(directory, JS), "export const panel = 1;\n");
  writeFileSync(join(directory, CSS), ".perch-root{}\n");
  return { directory, entries: { "panel.js": JS, "panel.css": CSS }, chunks: [] };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(resources: readonly ResourceClass[]): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources,
        userResolver: HeaderUserResolver,
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

/** `redirect: "manual"`, or fetch follows it and the answer is the page. */
const enter = async (url: string, role?: string): Promise<Response> =>
  await fetch(`${url}/admin`, {
    redirect: "manual",
    ...(role === undefined ? {} : { headers: { "x-role": role } }),
  });

/**
 * A path sent exactly as written.
 *
 * `fetch` normalises one before it leaves, which is the opposite of what these
 * need: the address this route builds is made from the URL that reached it, so
 * the interesting cases are the ones a browser or a proxy would pass through
 * unnormalised.
 */
async function raw(
  url: string,
  path: string,
): Promise<{ status: number; location?: string }> {
  const target = new URL(url);
  return await new Promise((resolve, reject) => {
    const call = httpRequest(
      {
        // `getUrl` answers `[::1]`, and `hostname` keeps the brackets that
        // make it a URL rather than a host somebody can look up.
        hostname: target.hostname.replace(/^\[|\]$/g, ""),
        port: target.port,
        path,
        method: "GET",
      },
      (response) => {
        response.resume();
        const location = response.headers.location;
        resolve({
          status: response.statusCode ?? 0,
          ...(location === undefined ? {} : { location }),
        });
      },
    );
    call.on("error", reject);
    call.end();
  });
}

describe("the address it builds", () => {
  it("offers no way off this origin", async () => {
    // The root is cut from the URL that reached the route, so it is the
    // caller's to write. These are the shapes that have got past a check like
    // this before: a scheme-less origin, and one spelled with escapes. Express
    // turns them away before the route sees them, which is the first of the
    // two answers; the second is that whatever does reach it is built into an
    // address through the same same-origin check every other link here uses.
    //
    // A literal tab is the third shape, and it is absent on purpose: Node's
    // client refuses to send a path containing one, so a test for it would be
    // testing the client. `redirect.test.ts` holds that case at the unit.
    const url = await serve([PostsResource]);

    for (const path of ["//evil.example/admin", "/%2f%2fevil.example/admin"]) {
      const response = await raw(url, path);
      expect(
        response.location ?? "",
        `${path} came back pointing at ${String(response.location)}`,
      ).not.toMatch(/^(https?:)?\/\//);
    }
  });

  it("answers the panel's address and not a lookalike", async () => {
    const url = await serve([PostsResource]);

    expect((await raw(url, "/admin")).location).toBe("/admin/posts");
  });
});

describe("the panel's own address", () => {
  it("sends a reader to the first thing their menu offers", async () => {
    const url = await serve([StaffResource, PostsResource]);
    const response = await enter(url, "admin");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/admin/staff");
  });

  it("sends a reader past what they may not open", async () => {
    // The whole point of building it per request. `staff` is first in the menu
    // and this reader has no menu entry for it, so the front door cannot be a
    // constant: a visitor sent to `staff` would meet a 404 one step later.
    const url = await serve([StaffResource, PostsResource]);
    const response = await enter(url, "visitor");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/admin/posts");
  });

  it("answers 404 where the reader may reach nothing", async () => {
    // Rather than an empty panel. A page saying there is nothing here for you
    // has still said there is a panel here, and a refusal is an absence
    // everywhere else in this codebase.
    const url = await serve([StaffResource]);
    const response = await enter(url, "visitor");

    expect(response.status).toBe(404);
  });

  it("is never cached, because the answer depends on who asked", async () => {
    // A shared cache holding one reader's would send the next one somewhere
    // they may not go, which is the bug this route would otherwise introduce.
    const url = await serve([StaffResource, PostsResource]);
    const response = await enter(url, "admin");

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers the same with a trailing slash", async () => {
    const url = await serve([StaffResource, PostsResource]);
    const response = await fetch(`${url}/admin/`, {
      redirect: "manual",
      headers: { "x-role": "admin" },
    });

    expect(response.status).toBe(302);
    // Not `/admin//staff`, which is a different origin to a browser.
    expect(response.headers.get("location")).toBe("/admin/staff");
  });

  it("leaves the resource pages alone", async () => {
    // The new route has no path of its own, so the worry is that it swallows
    // the addresses under it. A create page is the one that answers without a
    // data adapter, which this module has none of.
    const url = await serve([StaffResource, PostsResource]);
    const response = await fetch(`${url}/admin/posts/create`, {
      headers: { "x-role": "admin" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("does not answer for an address that names a resource", async () => {
    // The list page here is a 404 because nothing serves records, and a 404 is
    // what a swallowed address would give too. What tells them apart is the
    // redirect: this reader's front door is `/admin/staff`, so a root route
    // that had matched would have said so in a `location`.
    const url = await serve([StaffResource, PostsResource]);
    const response = await fetch(`${url}/admin/posts`, {
      redirect: "manual",
      headers: { "x-role": "admin" },
    });

    expect(response.status).not.toBe(302);
    expect(response.headers.get("location")).toBeNull();
  });
});
