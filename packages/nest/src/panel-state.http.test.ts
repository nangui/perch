/**
 * A1 over HTTP: a Select whose options depend on another, updated in one round
 * trip, with no JavaScript written by the user.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import { Schema, Select, TextInput } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const CITIES: Record<string, { value: number; label: string }[]> = {
  fr: [
    { value: 1, label: "Paris" },
    { value: 2, label: "Lyon" },
  ],
  be: [{ value: 3, label: "Brussels" }],
};

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  form(): Schema {
    return Schema.make([
      TextInput.make("name").required(),
      TextInput.make("reference").readOnly(),
      TextInput.make("secret").visible(({ get }) => get("reference") === "forged"),
      Select.make("countryId").options({ fr: "France", be: "Belgium" }).live(),
      Select.make("cityId")
        .options(({ get }) => CITIES[String(get("countryId"))] ?? [])
        .visible(({ get }) => Boolean(get("countryId"))),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-state-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
  };
}

let app: INestApplication;
let url: string;

beforeEach(async () => {
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
  await app.listen(0);
  url = await app.getUrl();
});

afterEach(async () => {
  await app.close();
});

async function post(
  slug: string,
  body: unknown,
): Promise<{ status: number; payload: SchemaPayload }> {
  const response = await fetch(`${url}/admin/api/${slug}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = response.ok
    ? ((await response.json()) as SchemaPayload)
    : ({} as SchemaPayload);
  return { status: response.status, payload };
}

const field = (payload: SchemaPayload, path: string): SchemaNode | undefined =>
  payload.schema.children?.find((node) => node.path === path);

describe("A1 — dependent options in one round trip", () => {
  it("returns the cities of the country that was just picked", async () => {
    const { status, payload } = await post("people", {
      state: { name: "Ada", countryId: "fr" },
      dirtyPath: "countryId",
      operation: "create",
    });

    expect(status).toBe(200);
    expect(field(payload, "cityId")?.options).toEqual(CITIES["fr"]);
  });

  it("keeps the city on the round trip that follows", async () => {
    // The second exchange, which is where a stateless server has to rebuild
    // whatever it confronts the incoming state with.
    const { payload } = await post("people", {
      state: { name: "Ada", countryId: "fr", cityId: 2 },
      dirtyPath: "cityId",
      operation: "create",
    });

    expect(payload.state["cityId"]).toBe(2);
  });

  it("hides the dependent field until the one it reads is answered", async () => {
    const { payload } = await post("people", {
      state: { name: "Ada" },
      dirtyPath: "name",
      operation: "create",
    });

    // Omitted from the tree entirely: hiding it on the client would still put
    // its options on the wire.
    expect(field(payload, "cityId")).toBeUndefined();
  });
});

describe("the trust boundary", () => {
  it("discards a value for a field that is read-only", async () => {
    const { payload } = await post("people", {
      state: { name: "Ada", reference: "forged" },
      dirtyPath: "name",
      operation: "create",
    });

    expect(payload.state["reference"]).toBeUndefined();
    // Silently: nothing in the answer says a field was refused.
    expect(JSON.stringify(payload)).not.toContain("forged");
  });

  it("will not let a refused field unlock another one", async () => {
    // `secret` is visible only when `reference` says so, and `reference` is
    // read-only. Admitting fields in waves must not give the client a way to
    // bootstrap that cascade with a value the tree already refused.
    const { payload } = await post("people", {
      state: { name: "Ada", reference: "forged", secret: "let me in" },
      dirtyPath: "name",
      operation: "create",
    });

    expect(payload.state["secret"]).toBeUndefined();
    expect(field(payload, "secret")).toBeUndefined();
  });

  it("discards a path the tree does not know", async () => {
    const { payload } = await post("people", {
      state: { name: "Ada", isAdmin: true },
      dirtyPath: "name",
      operation: "create",
    });

    expect(payload.state["isAdmin"]).toBeUndefined();
  });

  it("answers the same 404 for an unknown resource as for a forbidden one", async () => {
    const { status } = await post("nope", {
      state: {},
      dirtyPath: "name",
      operation: "create",
    });

    expect(status).toBe(404);
  });

  it.each([
    ["no operation", { state: {}, dirtyPath: "name" }],
    ["an unknown operation", { state: {}, dirtyPath: "name", operation: "destroy" }],
    ["no dirtyPath", { state: {}, operation: "create" }],
    ["state as an array", { state: [], dirtyPath: "name", operation: "create" }],
    ["a body that is not an object", ["nope"]],
  ])("refuses a request with %s", async (_, body) => {
    expect((await post("people", body)).status).toBe(404);
  });
});
