import { describe, expect, it } from "vitest";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { DateTimePicker } from "./date-time-picker.js";

const PARIS = "Europe/Paris";
const field = () => DateTimePicker.make("publishedAt").timezone(PARIS);
const tree = (state: Record<string, unknown> = {}, made = field()) =>
  resolveSchema(Schema.make([made]), state, { operation: "create" });

const written = async (state: Record<string, unknown>, made = field()) =>
  dehydrate(await tree(state, made), { operation: "create" }).set["publishedAt"];

describe("the acceptance criterion, end to end", () => {
  it("a summer date is stored as the instant it names", async () => {
    // Entered at UTC+2, persisted in UTC.
    expect(await written({ publishedAt: "2026-06-15T12:00" })).toEqual(
      new Date("2026-06-15T10:00:00.000Z"),
    );
  });

  it("and comes back showing the same wall clock", async () => {
    const settled = await tree({ publishedAt: new Date("2026-06-15T10:00:00.000Z") });

    expect(settled.state["publishedAt"]).toBe("2026-06-15T12:00");
  });

  it("survives the round trip across the shift, in both directions", async () => {
    for (const wall of ["2026-01-15T09:45", "2026-06-15T09:45"]) {
      const stored = await written({ publishedAt: wall });
      const back = await tree({ publishedAt: stored });

      expect(back.state["publishedAt"]).toBe(wall);
    }
  });
});

describe("a value arriving from the driver", () => {
  it("is read whether it comes as a Date or as an ISO string", async () => {
    const asDate = await tree({ publishedAt: new Date("2026-06-15T10:00:00Z") });
    const asText = await tree({ publishedAt: "2026-06-15T10:00:00.000Z" });

    expect(asDate.state["publishedAt"]).toBe("2026-06-15T12:00");
    expect(asText.state["publishedAt"]).toBe("2026-06-15T12:00");
  });

  it("is left alone once it is already a wall clock", async () => {
    // The second round trip carries what the first produced; converting again
    // would move the hour every time the reader touched the form.
    const once = await tree({ publishedAt: new Date("2026-06-15T10:00:00Z") });
    const twice = await tree({ publishedAt: once.state["publishedAt"] });

    expect(twice.state["publishedAt"]).toBe("2026-06-15T12:00");
  });
});

describe("what the boundary accepts", () => {
  it("a wall clock, and nothing shaped otherwise", async () => {
    const built = await tree();

    expect(sanitize(built, { publishedAt: "2026-06-15T12:00" }).state).toEqual({
      publishedAt: "2026-06-15T12:00",
    });
    for (const forged of [
      "2026-06-15T10:00:00Z",
      "2026-06-15",
      "yesterday",
      1_780_000_000,
    ]) {
      expect(sanitize(built, { publishedAt: forged }).rejected).toEqual([
        { path: "publishedAt", reason: "wrong-shape" },
      ]);
    }
  });

  it("a bare date where the field asked for no time", async () => {
    const dateOnly = DateTimePicker.make("publishedAt").timezone(PARIS).date();
    const built = await tree({}, dateOnly);

    expect(sanitize(built, { publishedAt: "2026-06-15" }).state).toEqual({
      publishedAt: "2026-06-15",
    });
    expect(sanitize(built, { publishedAt: "2026-06-15T12:00" }).rejected).toEqual([
      { path: "publishedAt", reason: "wrong-shape" },
    ]);
  });
});

describe("a date-only field", () => {
  it("stores midnight in its own zone, not in UTC", async () => {
    const dateOnly = DateTimePicker.make("publishedAt").timezone(PARIS).date();

    expect(await written({ publishedAt: "2026-06-15" }, dateOnly)).toEqual(
      new Date("2026-06-14T22:00:00.000Z"),
    );
  });
});

describe("the bounds", () => {
  it("refuse a day before the first one allowed", async () => {
    const bounded = field().minDate("2026-06-01T00:00");
    const settled = await tree({ publishedAt: "2026-05-31T23:00" }, bounded);

    expect(settled.errors["publishedAt"]).toBe("Must be on or after 2026-06-01T00:00.");
  });

  it("refuse a day after the last", async () => {
    const bounded = field().maxDate("2026-06-30T23:59");
    const settled = await tree({ publishedAt: "2026-07-01T00:00" }, bounded);

    expect(settled.errors["publishedAt"]).toBe(
      "Must be on or before 2026-06-30T23:59.",
    );
  });

  it("let the bounds themselves through", async () => {
    const bounded = field().minDate("2026-06-01T00:00").maxDate("2026-06-30T23:59");

    expect((await tree({ publishedAt: "2026-06-01T00:00" }, bounded)).errors).toEqual(
      {},
    );
    expect((await tree({ publishedAt: "2026-06-30T23:59" }, bounded)).errors).toEqual(
      {},
    );
  });
});

describe("the zone", () => {
  it("is declared, never taken from wherever the code happens to run", () => {
    // The default is UTC rather than the host's zone: a deployment moving
    // between machines would otherwise move every date in the table.
    expect(DateTimePicker.make("at").state.timezone).toBe("UTC");
  });

  it("reaches the renderer, which has to say which one it is showing", async () => {
    const { serialise } = await import("../serialise.js");
    const payload = serialise(await tree());

    expect(payload.schema.children?.[0]?.props).toMatchObject({
      timezone: PARIS,
      withTime: true,
    });
  });
});

describe("a bound shaped unlike the values it bounds", () => {
  it("stops the boot rather than refusing the first day it should allow", async () => {
    // Compared as text, `"2026-06-01" >= "2026-06-01T00:00"` is false: the
    // shorter one is a prefix. A reader picking exactly the earliest allowed
    // day was told it was too early, in a message showing an hour the field
    // cannot display.
    const { auditSchema } = await import("../audit.js");
    const wrong = DateTimePicker.make("at").date().minDate("2026-06-01T00:00");

    expect(auditSchema(Schema.make([wrong]))).toEqual([
      {
        field: "at",
        problem:
          "has a `minDate` of `2026-06-01T00:00`, which is not shaped like the " +
          "values it bounds — this field holds `YYYY-MM-DD`",
      },
    ]);
  });

  it("names a maximum in the wrong shape too", async () => {
    const { auditSchema } = await import("../audit.js");
    const wrong = DateTimePicker.make("at").maxDate("2026-06-30");

    expect(auditSchema(Schema.make([wrong]))[0]?.problem).toContain("`maxDate`");
  });

  it("says nothing when the shapes agree", async () => {
    const { auditSchema } = await import("../audit.js");
    const right = DateTimePicker.make("at").date().minDate("2026-06-01");

    expect(auditSchema(Schema.make([right]))).toEqual([]);
  });

  it("lets the earliest allowed day through, once the shapes agree", async () => {
    const bounded = DateTimePicker.make("publishedAt")
      .timezone(PARIS)
      .date()
      .minDate("2026-06-01");
    const settled = await tree({ publishedAt: "2026-06-01" }, bounded);

    expect(settled.errors).toEqual({});
  });
});
