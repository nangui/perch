/**
 * The wire format: plain JSON, and nothing a hidden field owns.
 */
import { describe, expect, it } from "vitest";
import { Schema, Section } from "./layout.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import { resolveSchema } from "./resolve.js";
import type { ResolveOptions } from "./resolve.js";
import { serialise } from "./serialise.js";

const CREATE: ResolveOptions = { operation: "create" };

function form() {
  return Schema.make([
    Section.make("Location")
      .columns(2)
      .schema([
        Select.make("countryId").options({ fr: "France" }).live(),
        Select.make("cityId")
          .options(() => [{ value: 1, label: "Paris" }])
          .visible(({ get }) => Boolean(get("countryId"))),
        TextInput.make("email").email().required().maxLength(255),
      ]),
  ]);
}

describe("the payload is transportable", () => {
  it("survives a JSON round trip unchanged", async () => {
    const payload = serialise(await resolveSchema(form(), { countryId: "fr" }, CREATE));
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("carries a type discriminator rather than a class", async () => {
    const payload = serialise(await resolveSchema(form(), {}, CREATE));
    expect(payload.schema.type).toBe("Schema");
    expect(payload.schema.children?.[0]?.type).toBe("Section");
    expect(payload.schema.children?.[0]?.children?.[0]?.type).toBe("Select");
  });

  it("keeps the tree shape", async () => {
    const payload = serialise(await resolveSchema(form(), { countryId: "fr" }, CREATE));
    const section = payload.schema.children?.[0];
    expect(section?.children).toHaveLength(3);
  });
});

describe("a hidden node is absent, not flagged", () => {
  it("omits the node entirely", async () => {
    const payload = serialise(await resolveSchema(form(), {}, CREATE));
    const ids = JSON.stringify(payload.schema);
    expect(ids).not.toContain("cityId");
  });

  it("omits its options, which would otherwise leak the list", async () => {
    const payload = serialise(await resolveSchema(form(), {}, CREATE));
    expect(JSON.stringify(payload)).not.toContain("Paris");
  });

  it("brings it back once the server itself makes it visible", async () => {
    const payload = serialise(await resolveSchema(form(), { countryId: "fr" }, CREATE));
    const city = payload.schema.children?.[0]?.children?.[1];
    expect(city?.path).toBe("cityId");
    expect(city?.options).toEqual([{ value: 1, label: "Paris" }]);
  });

  it("sends no state and no error for a path with no node", async () => {
    const withHidden = Schema.make([
      TextInput.make("visible"),
      TextInput.make("secret").required().hidden(),
    ]);
    const payload = serialise(
      await resolveSchema(withHidden, { visible: "a", secret: "s" }, CREATE),
    );
    expect(payload.state).toEqual({ visible: "a" });
    expect(payload.errors).toEqual({});
  });
});

describe("per-type props", () => {
  it("carries what a TextInput renderer needs", async () => {
    const payload = serialise(await resolveSchema(form(), { countryId: "fr" }, CREATE));
    const email = payload.schema.children?.[0]?.children?.[2];
    expect(email?.props).toMatchObject({ flavour: "email", maxLength: 255 });
    expect(email?.required).toBe(true);
  });

  it("carries what a Select renderer needs", async () => {
    const payload = serialise(await resolveSchema(form(), { countryId: "fr" }, CREATE));
    const country = payload.schema.children?.[0]?.children?.[0];
    expect(country?.props).toMatchObject({ searchable: false, multiple: false });
    expect(country?.options).toEqual([{ value: "fr", label: "France" }]);
  });

  it("carries the layout's columns", async () => {
    const payload = serialise(await resolveSchema(form(), {}, CREATE));
    expect(payload.schema.children?.[0]?.props).toMatchObject({ columns: 2 });
  });

  it("sends what a resolver returned, not the resolver and not nothing", async () => {
    // The earlier version of this asserted only that no function reached the
    // wire, which the old code satisfied by dropping the property outright.
    const withResolvers = Schema.make([
      TextInput.make("a")
        .placeholder(() => "typed")
        .required(() => true),
    ]);
    const payload = serialise(await resolveSchema(withResolvers, {}, CREATE));
    const field = payload.schema.children?.[0];

    expect(field?.placeholder).toBe("typed");
    expect(field?.required).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("function");
  });

  it("does not advertise a property the cycle never resolves", async () => {
    // Section.description accepts a resolver and nothing resolves it, so it
    // stays off the wire rather than travelling as a static half of itself.
    const payload = serialise(await resolveSchema(form(), {}, CREATE));
    expect(payload.schema.children?.[0]?.props).not.toHaveProperty("description");
  });
});

describe("the client cannot invent the debounce", () => {
  it("carries live when the field declares it, per field type", async () => {
    const payload = serialise(await resolveSchema(form(), { countryId: "fr" }, CREATE));
    const country = payload.schema.children?.[0]?.children?.[0];
    // A select commits at 0 ms, a text field waits 400.
    expect(country?.live).toEqual({ debounce: 0, onBlur: false });
  });

  it("omits it on a field that triggers nothing", async () => {
    const payload = serialise(await resolveSchema(form(), { countryId: "fr" }, CREATE));
    const email = payload.schema.children?.[0]?.children?.[2];
    expect(email?.live).toBeUndefined();
  });
});
