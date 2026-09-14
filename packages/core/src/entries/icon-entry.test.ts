/**
 * The mark an infolist shows, decided on the server.
 *
 * The rule that turns a value into a shape is a rule the resource wrote, and it
 * never crosses: a browser handed the map would be a browser deciding what a
 * row means. What crosses is the answer — one name, already chosen.
 */
import { describe, expect, it } from "vitest";
import { IconEntry } from "./icon-entry.js";
import { Schema } from "../layout.js";
import { resolveSchema } from "../resolve.js";
import { serialise } from "../serialise.js";

const drawn = async (entry: IconEntry, record: Record<string, unknown>) =>
  serialise(
    await resolveSchema(Schema.make([entry]), {}, { operation: "edit", record }),
  ).schema.children?.[0];

describe("a mark chosen from a boolean", () => {
  it("is a tick for true and a cross for false", async () => {
    const entry = IconEntry.make("active").boolean();

    expect((await drawn(entry, { active: true }))?.mark).toBe("check");
    expect((await drawn(entry, { active: false }))?.mark).toBe("close");
  });

  it("is neither where the record holds neither", async () => {
    // Absent is not false. A third mark for it would be a value the row does
    // not hold, drawn as though it did.
    const entry = IconEntry.make("active").boolean();

    expect((await drawn(entry, {}))?.mark).toBeUndefined();
    expect((await drawn(entry, { active: null }))?.mark).toBeUndefined();
  });
});

describe("a mark chosen by a rule", () => {
  it("crosses as the name the rule answered, and never as the rule", async () => {
    const entry = IconEntry.make("status").icons((value) =>
      value === "live" ? "check" : "pencil",
    );

    const node = await drawn(entry, { status: "live" });

    expect(node?.mark).toBe("check");
    // The function itself is not part of the wire format. A client that had it
    // would be deciding what a row means.
    expect(JSON.stringify(node)).not.toContain("function");
  });

  it("wins over the boolean default, which is only a default", async () => {
    const entry = IconEntry.make("active")
      .boolean()
      .icons(() => "star");

    expect((await drawn(entry, { active: true }))?.mark).toBe("star");
  });

  it("takes a fixed name without a function at all", async () => {
    expect((await drawn(IconEntry.make("x").icons("bell"), { x: 1 }))?.mark).toBe(
      "bell",
    );
  });
});

describe("the colour beside it", () => {
  it("is resolved from the value, like the mark", async () => {
    const entry = IconEntry.make("status")
      .boolean()
      .colors((value) => (value === true ? "success" : "danger"));

    expect((await drawn(entry, { status: true }))?.tone).toBe("success");
    expect((await drawn(entry, { status: false }))?.tone).toBe("danger");
  });

  it("is absent where no rule named one", async () => {
    expect(
      (await drawn(IconEntry.make("a").boolean(), { a: true }))?.tone,
    ).toBeUndefined();
  });
});

describe("what an entry is not", () => {
  it("reads the record rather than the state map", async () => {
    // A field's name says where a value lives while it is edited; an entry's
    // says where one lives in the row. The two are never converted.
    const node = await drawn(IconEntry.make("user.verified").boolean(), {
      user: { verified: true },
    });

    expect(node?.mark).toBe("check");
  });
});
