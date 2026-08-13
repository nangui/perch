/**
 * The acceptance criterion the fields PRD names: a date entered in UTC+2 is
 * persisted in UTC and displayed again in UTC+2 with no drift, across a
 * daylight-saving change.
 *
 * The dates here are not invented. Europe/Paris in 2026 shifts on 29 March —
 * the clock goes 02:00 to 03:00, so 02:30 never happens — and back on
 * 25 October, when it goes 03:00 to 02:00 and 02:30 happens twice.
 */
import { describe, expect, it } from "vitest";
import { isWallClock, toInstant, toWallClock } from "./zoned.js";

const PARIS = "Europe/Paris";
const at = (wall: string, zone = PARIS) => toInstant(wall, zone)?.toISOString();

describe("a wall clock becomes an instant", () => {
  it("in summer, when the zone is two hours ahead", () => {
    expect(at("2026-06-15T12:00")).toBe("2026-06-15T10:00:00.000Z");
  });

  it("in winter, when it is one", () => {
    expect(at("2026-01-15T12:00")).toBe("2026-01-15T11:00:00.000Z");
  });

  it("in a zone that never shifts at all", () => {
    expect(at("2026-06-15T12:00", "Asia/Tokyo")).toBe("2026-06-15T03:00:00.000Z");
  });

  it("for a date with no time, which means midnight there", () => {
    expect(at("2026-06-15")).toBe("2026-06-14T22:00:00.000Z");
  });

  it("and answers nothing for a string that is not one", () => {
    expect(toInstant("not a date", PARIS)).toBeUndefined();
  });
});

describe("the hour that happens twice", () => {
  it("takes the first of them", () => {
    // 02:30 came round at 00:30Z and again at 01:30Z. The reader wrote a time
    // that had already come once; the later one moves their appointment on.
    expect(at("2026-10-25T02:30")).toBe("2026-10-25T00:30:00.000Z");
  });

  it("leaves the hours either side of it alone", () => {
    expect(at("2026-10-25T01:30")).toBe("2026-10-24T23:30:00.000Z");
    expect(at("2026-10-25T03:30")).toBe("2026-10-25T02:30:00.000Z");
  });
});

describe("the hour that never happens", () => {
  it("takes the instant the clock skipped to", () => {
    // 02:30 does not exist on 29 March. Answering with an error would be about
    // a time somebody's own calendar showed them.
    expect(at("2026-03-29T02:30")).toBe("2026-03-29T01:30:00.000Z");
  });

  it("shows that instant as the time after the gap", () => {
    expect(toWallClock(new Date("2026-03-29T01:30:00.000Z"), PARIS, true)).toBe(
      "2026-03-29T03:30",
    );
  });
});

describe("an instant becomes a wall clock", () => {
  it("two hours on in summer", () => {
    expect(toWallClock(new Date("2026-06-15T10:00:00Z"), PARIS, true)).toBe(
      "2026-06-15T12:00",
    );
  });

  it("one hour on in winter", () => {
    expect(toWallClock(new Date("2026-01-15T11:00:00Z"), PARIS, true)).toBe(
      "2026-01-15T12:00",
    );
  });

  it("as a bare date where the field asked for no time", () => {
    expect(toWallClock(new Date("2026-06-15T10:00:00Z"), PARIS, false)).toBe(
      "2026-06-15",
    );
  });

  it("across midnight, where the day itself differs from UTC", () => {
    // 23:30 UTC is already the next day in Paris. A field that got this wrong
    // would show a row as written a day before it was.
    expect(toWallClock(new Date("2026-06-15T23:30:00Z"), PARIS, true)).toBe(
      "2026-06-16T01:30",
    );
  });
});

describe("there and back", () => {
  it("survives the round trip on either side of a shift", () => {
    for (const wall of ["2026-01-15T09:45", "2026-06-15T09:45", "2026-12-31T23:59"]) {
      const instant = toInstant(wall, PARIS);
      expect(instant).toBeDefined();
      expect(toWallClock(instant as Date, PARIS, true)).toBe(wall);
    }
  });

  it("survives it in a zone on a half-hour offset", () => {
    // Kolkata is UTC+5:30, which is where an implementation that thought in
    // whole hours would come apart.
    const instant = toInstant("2026-06-15T12:00", "Asia/Kolkata");
    expect(instant?.toISOString()).toBe("2026-06-15T06:30:00.000Z");
    expect(toWallClock(instant as Date, "Asia/Kolkata", true)).toBe("2026-06-15T12:00");
  });
});

describe("what a wall clock is shaped like", () => {
  it("accepts the two shapes and nothing else", () => {
    expect(isWallClock("2026-06-15T12:00", true)).toBe(true);
    expect(isWallClock("2026-06-15", false)).toBe(true);
    expect(isWallClock("2026-06-15", true)).toBe(false);
    expect(isWallClock("2026-06-15T12:00", false)).toBe(false);
    expect(isWallClock("2026-06-15T12:00:00Z", true)).toBe(false);
    expect(isWallClock(20260615, true)).toBe(false);
  });
});
