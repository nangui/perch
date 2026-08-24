/**
 * Between two dates, and the day at the far end.
 *
 * Almost everything here is about that far end. A reader asking for the 1st to
 * the 30th means the 30th included, and a column of instants compared against
 * midnight on the 30th drops everything that happened during it — the last day
 * of every range, in a table that otherwise looks correct. The rest is about
 * whose midnight, which is a question a panel read from two countries cannot
 * leave to whoever is looking.
 */
import { describe, expect, it } from "vitest";
import { auditTable } from "./audit.js";
import { DateRangeFilter } from "./filter.js";
import { Table } from "./table.js";
import { TextColumn } from "./column.js";

const between = (value: string, zone?: string) => {
  const made = DateRangeFilter.make("createdAt");
  return (zone === undefined ? made : made.timezone(zone)).clauses(value);
};

/** What an instant is, written the way a reader of this file can check it. */
const at = (iso: string) => new Date(iso);

describe("both ends", () => {
  it("start at the first midnight and stop before the next one", () => {
    expect(between("2026-01-01..2026-06-30")).toEqual([
      { path: "createdAt", operator: "gte", value: at("2026-01-01T00:00:00.000Z") },
      { path: "createdAt", operator: "lt", value: at("2026-07-01T00:00:00.000Z") },
    ]);
  });

  it("include the whole of the last day asked for", () => {
    // The fault this shape exists to avoid: an afternoon on the 30th is inside
    // a range that ends on the 30th, and comparing against the 30th's own
    // midnight would have left it out.
    const [, end] = between("2026-06-01..2026-06-30");

    expect(end?.operator).toBe("lt");
    expect(at("2026-06-30T14:00:00.000Z") < (end?.value as Date)).toBe(true);
    expect(at("2026-07-01T00:00:00.000Z") < (end?.value as Date)).toBe(false);
  });

  it("cross a month and a year without help", () => {
    expect(between("2026-01-31..2026-01-31")[1]?.value).toEqual(
      at("2026-02-01T00:00:00.000Z"),
    );
    expect(between("2026-12-31..2026-12-31")[1]?.value).toEqual(
      at("2027-01-01T00:00:00.000Z"),
    );
    // February in a leap year, which is the arithmetic nobody writes by hand.
    expect(between("2028-02-28..2028-02-28")[1]?.value).toEqual(
      at("2028-02-29T00:00:00.000Z"),
    );
  });
});

describe("one end", () => {
  it("is everything since, where only a start was given", () => {
    expect(between("2026-01-01..")).toEqual([
      { path: "createdAt", operator: "gte", value: at("2026-01-01T00:00:00.000Z") },
    ]);
  });

  it("is everything until, where only an end was given", () => {
    expect(between("..2026-06-30")).toEqual([
      { path: "createdAt", operator: "lt", value: at("2026-07-01T00:00:00.000Z") },
    ]);
  });
});

describe("a value that is not a range", () => {
  it("narrows nothing, and says so by narrowing nothing", () => {
    // Left blank, which is what putting the control back sends.
    expect(between("..")).toEqual([]);
    expect(between("")).toEqual([]);
  });

  it("is refused a day at a time, so half a range still works", () => {
    // A reader typing into one box has not filled the other in yet.
    expect(between("2026-01-01..notadate").map((one) => one.operator)).toEqual(["gte"]);
    expect(between("notadate..2026-06-30").map((one) => one.operator)).toEqual(["lt"]);
  });

  it("is refused where it is only shaped like one", () => {
    // A day that passes for one and is not one. The shape is the first gate,
    // never the only one.
    expect(between("2026-13-01..2026-06-30").map((one) => one.operator)).toEqual([
      "lt",
    ]);
    expect(between("2026-02-30..").map((one) => one.operator)).toEqual([]);
    expect(between("2026..2027")).toEqual([]);
    // An hour on one end is not a day, and the other end still stands.
    expect(between("2026-01-01T09:00..2026-06-30").map((one) => one.operator)).toEqual([
      "lt",
    ]);
    // No separator at all is not half a range, it is not a range.
    expect(between("2026-01-01")).toEqual([]);
  });

  it("is not a way to ask a question nobody declared", () => {
    // The path and the comparison are settled in code. Nothing that arrives
    // can name a column, and nothing that arrives becomes an operator.
    for (const forged of ["password..zzz", "'; drop table--..x", "1..2"]) {
      expect(between(forged)).toEqual([]);
    }
  });
});

describe("a range whose ends cross", () => {
  it("produces both, and an empty table", () => {
    // Not dropped. A reader who asked for an impossible range should see that
    // they did, rather than a full page that looks like the filter is broken.
    expect(between("2026-06-30..2026-01-01")).toHaveLength(2);
  });
});

describe("whose midnight", () => {
  it("is the one the table declared, not the one the server keeps", () => {
    const [start, end] = between("2026-06-01..2026-06-30", "Europe/Paris");

    // Summer in Paris is two hours ahead, so the day begins at 22:00 the
    // evening before, in UTC.
    expect(start?.value).toEqual(at("2026-05-31T22:00:00.000Z"));
    expect(end?.value).toEqual(at("2026-06-30T22:00:00.000Z"));
  });

  it("holds across the morning a zone changes offset", () => {
    // 29 March 2026, when Paris goes forward. The day still starts at its own
    // midnight and the one after still starts at its own, an hour closer.
    const [start, end] = between("2026-03-28..2026-03-29", "Europe/Paris");

    expect(start?.value).toEqual(at("2026-03-27T23:00:00.000Z"));
    expect(end?.value).toEqual(at("2026-03-29T22:00:00.000Z"));
  });

  it("is UTC where a table said nothing", () => {
    expect(between("2026-06-01..")[0]?.value).toEqual(at("2026-06-01T00:00:00.000Z"));
  });
});

describe("what it says was applied", () => {
  const applied = (value: string) => DateRangeFilter.make("createdAt").applied(value);

  it("is the range that arrived, where it could all be read", () => {
    expect(applied("2026-01-01..2026-06-30")).toBe("2026-01-01..2026-06-30");
  });

  it("leaves out an end it could not read", () => {
    // What comes back is what a control draws itself from and what a link
    // carries. Sending the whole of a value half of which was dropped puts an
    // unreadable date in a box that will not show it, beside an address that
    // claims it was applied.
    expect(applied("2026-02-30..2026-06-30")).toBe("..2026-06-30");
    expect(applied("2026-01-01..whenever")).toBe("2026-01-01..");
    expect(applied("  2026-01-01  ..  2026-06-30 ")).toBe("2026-01-01..2026-06-30");
  });
});

describe("the top of the calendar", () => {
  it("is a range like any other until the year runs out", () => {
    expect(between("9998-12-31..9998-12-31")[1]?.value).toEqual(
      at("9999-01-01T00:00:00.000Z"),
    );
  });

  it("stops rather than inventing a day nobody can write", () => {
    // Past 9999 the ISO form grows a sign and a fifth digit, and the first ten
    // characters of `+010000-01-01` are not a day. It parses anyway, which is
    // how it would have gone unnoticed.
    expect(between("9999-12-31..9999-12-31").map((one) => one.operator)).toEqual(["gte"]);
  });
});

describe("what it filters", () => {
  it("is the column it is named after", () => {
    expect(between("2026-06-01..")[0]?.path).toBe("createdAt");
  });

  it("is another one where it was told to reach it", () => {
    expect(
      DateRangeFilter.make("written")
        .path("article.createdAt")
        .clauses("2026-06-01..")[0]?.path,
    ).toBe("article.createdAt");
  });

  it("keeps the zone through a rename, a label and a path", () => {
    // Every fluent method clones, and one that dropped a field would leave a
    // filter comparing against the wrong midnight with nothing to show for it.
    const made = DateRangeFilter.make("createdAt")
      .timezone("Europe/Paris")
      .label("Created")
      .path("written");

    expect(made.clauses("2026-06-01..")[0]).toEqual({
      path: "written",
      operator: "gte",
      value: at("2026-05-31T22:00:00.000Z"),
    });
  });
});

describe("a zone nothing has heard of", () => {
  it("stops the boot rather than every request", () => {
    // `Intl` throws on one instead of falling back, so without this the panel
    // boots clean and fails the moment a reader touches the control.
    const complaints = auditTable(
      Table.make()
        .columns([TextColumn.make("createdAt")])
        .filters([DateRangeFilter.make("createdAt").timezone("Mars/Olympus")]),
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]?.problem).toContain("Mars/Olympus");
  });

  it("says nothing about one it has", () => {
    const complaints = auditTable(
      Table.make()
        .columns([TextColumn.make("createdAt")])
        .filters([DateRangeFilter.make("createdAt").timezone("Africa/Abidjan")]),
    );

    expect(complaints).toEqual([]);
  });
});
