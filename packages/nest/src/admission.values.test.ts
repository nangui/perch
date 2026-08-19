/**
 * Where two mechanisms meet.
 *
 * The boundary now refuses a value no declaration named, and it judges against
 * the tree the server last resolved — in which a dependent select has no
 * options at all until its parent is chosen. On its own that would refuse
 * every city ever sent alongside its country, which is A1.
 *
 * Admission in waves is what saves it: the first pass takes the
 * country, the resolution that follows gives the city its options, and the
 * second pass takes the city. This is the test that would fail if either half
 * were changed without the other in mind.
 */
import { describe, expect, it } from "vitest";
import { Schema, Select, TextInput } from "@perchjs/core";
import { admit } from "./admission.js";

const CITIES: Record<string, { value: string; label: string }[]> = {
  fr: [
    { value: "1", label: "Paris" },
    { value: "2", label: "Lyon" },
  ],
};

describe("a dependent choice, against a closed set", () => {
  it("admits a dependent choice sent in the same breath as its parent", async () => {
    const schema = Schema.make([
      TextInput.make("name"),
      Select.make("countryId").options({ fr: "France", be: "Belgium" }),
      Select.make("cityId").options(
        ({ get }) => CITIES[String(get("countryId"))] ?? [],
      ),
    ]);

    // Both arrive at once. When the boundary first judges, the city has no
    // options at all, because no country had been chosen yet.
    const { accepted } = await admit({
      schema,
      state: { name: "Ada", countryId: "fr", cityId: "2" },
      operation: "create",
      user: null,
      record: null,
    });

    expect(accepted).toEqual({ name: "Ada", countryId: "fr", cityId: "2" });
  });

  it("still refuses a city that belongs to no country", async () => {
    const schema = Schema.make([
      Select.make("countryId").options({ fr: "France" }),
      Select.make("cityId").options(
        ({ get }) => CITIES[String(get("countryId"))] ?? [],
      ),
    ]);

    const { accepted } = await admit({
      schema,
      state: { countryId: "fr", cityId: "999" },
      operation: "create",
      user: null,
      record: null,
    });

    expect(accepted).toEqual({ countryId: "fr" });
  });
});
