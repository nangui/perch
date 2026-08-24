/**
 * Between two numbers, and what counts as one.
 *
 * Simpler than the range of dates beside it, because a number names a point
 * where a date names a whole day: both ends are inclusive and there is no
 * midnight to work out. What is left is the reading — `Number()` accepts a
 * great deal a URL should not be able to say, and a whole number past what a
 * double holds comes back as a different number.
 */
import { describe, expect, it } from "vitest";
import { NumberRangeFilter } from "./filter.js";

const between = (value: string) => NumberRangeFilter.make("price").clauses(value);

describe("both ends", () => {
  it("are inclusive, because a number is a point and not a span", () => {
    // The difference from a range of days, which has to stop before the next
    // midnight to take the last day in. Nothing sits between 20 and 20.
    expect(between("10..20")).toEqual([
      { path: "price", operator: "gte", value: 10 },
      { path: "price", operator: "lte", value: 20 },
    ]);
  });

  it("carry numbers and not the text they arrived as", () => {
    // A URL carries `10`, and an Int column compared against the string finds
    // nothing and reads as an empty table rather than as a bug.
    for (const clause of between("10..20")) expect(typeof clause.value).toBe("number");
  });

  it("go below nothing, and between whole numbers", () => {
    expect(between("-40..-10").map((one) => one.value)).toEqual([-40, -10]);
    expect(between("1.5..2.75").map((one) => one.value)).toEqual([1.5, 2.75]);
    expect(between("0..0").map((one) => one.value)).toEqual([0, 0]);
  });
});

describe("one end", () => {
  it("is everything from, where only a floor was given", () => {
    expect(between("10..")).toEqual([{ path: "price", operator: "gte", value: 10 }]);
  });

  it("is everything up to, where only a ceiling was given", () => {
    expect(between("..20")).toEqual([{ path: "price", operator: "lte", value: 20 }]);
  });
});

describe("a value that is not a range", () => {
  it("narrows nothing, and says so by narrowing nothing", () => {
    expect(between("..")).toEqual([]);
    expect(between("")).toEqual([]);
    // No separator is not half a range, it is not a range.
    expect(between("10")).toEqual([]);
  });

  it("is refused an end at a time, so half a range still works", () => {
    expect(between("10..lots").map((one) => one.operator)).toEqual(["gte"]);
    expect(between("some..20").map((one) => one.operator)).toEqual(["lte"]);
  });

  it("refuses everything `Number()` would take and nobody would type", () => {
    // Each of these is a number as far as `Number()` is concerned, and none of
    // them is something a reader put in a box.
    for (const forged of [
      "1e3..2e3",
      "0x10..0x20",
      "Infinity..",
      "..Infinity",
      "0b101..",
      "1_000..2_000",
      "+10..+20",
      "NaN..NaN",
    ]) {
      expect(between(forged), forged).toEqual([]);
    }
  });

  it("reads the last separator, not the first", () => {
    // Which is what lets a half-typed decimal keep its dot on the way to the
    // box: `1.` and an empty far end join into `1...`, and cutting at the
    // front hands the reader's decimal point to the separator — `1.5` came out
    // as `15`. A far end can never begin with a dot, so the last cut is the
    // only one that can have been meant.
    expect(between("10...20").map((one) => one.value)).toEqual([20]);
    expect(between("1.5..2.5").map((one) => one.value)).toEqual([1.5, 2.5]);
  });

  it("refuses what a stray dot leaves behind", () => {
    // `10.` is not a number here even though `Number()` would call it ten. The
    // end nobody could read is dropped and the one that survives still
    // narrows, which is the answer a reader gets while filling the second box.
    expect(between("--10..20").map((one) => one.operator)).toEqual(["lte"]);
    expect(between(" 10 .. 20 x").map((one) => one.value)).toEqual([10]);
  });

  it("takes the spaces a link picks up along the way", () => {
    expect(between("  10  ..  20  ").map((one) => one.value)).toEqual([10, 20]);
  });

  it("is not a way to ask a question nobody declared", () => {
    // The path and the comparison are settled in code, so what arrives cannot
    // name a column and cannot become an operator — whatever it does to the
    // ends. That is the property, not that every odd string produces nothing.
    for (const forged of [
      "price..0",
      "'; drop table--..1",
      "id..id",
      "passwordHash..zzz",
      "10..20",
    ]) {
      for (const clause of between(forged)) {
        expect(clause.path, forged).toBe("price");
        expect(["gte", "lte"], forged).toContain(clause.operator);
        expect(typeof clause.value, forged).toBe("number");
      }
    }
  });
});

describe("a number a double would name only approximately", () => {
  it("is refused rather than rounded, whole", () => {
    // `9007199254740993` comes back as `...992`. The row it was meant to bound
    // ends up on the wrong side of a comparison nobody can see was rounded.
    expect(between("9007199254740993..")).toEqual([]);
    expect(between("..-9007199254740993")).toEqual([]);
  });

  it("is refused rather than rounded, with a fraction", () => {
    // Which is the harder half, and the one a `Decimal` column exists for:
    // this comes back as `1`, so a bound meant to sit just above one lands on
    // it and takes in every row that equals it.
    expect(between("1.0000000000000001..2").map((one) => one.operator)).toEqual(["lte"]);
    expect(between("..1.00000000000000001")).toEqual([]);
    // And the other way: a fraction a double does name exactly is let through,
    // however long it looks.
    expect(between("..0.30000000000000004").map((one) => one.value)).toEqual([
      0.30000000000000004,
    ]);
  });

  it("is allowed right up to where that stops being true", () => {
    expect(between("9007199254740991..").map((one) => one.value)).toEqual([
      Number.MAX_SAFE_INTEGER,
    ]);
    expect(between("1.999999999999999..").map((one) => one.value)).toEqual([
      1.999999999999999,
    ]);
  });

  it("is not confused by zeros that carry no meaning", () => {
    // `1.50` and `007` are the same numbers as `1.5` and `7`, and a check that
    // compared the text as written would have refused an ordinary bound.
    expect(between("007..020").map((one) => one.value)).toEqual([7, 20]);
    expect(between("1.50..2.0").map((one) => one.value)).toEqual([1.5, 2]);
    expect(between("-0..0").map((one) => one.value)).toEqual([0, 0]);
  });

  it("stops at the magnitudes where printing gives up on plain digits", () => {
    // A billion billion and up, a ten-millionth and down. Refused rather than
    // guessed at, which is the safe direction and far outside a filter box.
    expect(between("100000000000000000000000..")).toEqual([]);
    expect(between("0.0000001..")).toEqual([]);
  });
});

describe("a range whose ends cross", () => {
  it("produces both, and an empty table", () => {
    // A reader who asked for an impossible range should see that they did,
    // rather than a full page that looks like the filter is broken.
    expect(between("20..10")).toHaveLength(2);
  });
});

describe("what it says was applied", () => {
  const applied = (value: string) => NumberRangeFilter.make("price").applied(value);

  it("is the range that arrived, where it could all be read", () => {
    expect(applied("10..20")).toBe("10..20");
  });

  it("leaves out an end it could not read", () => {
    // What comes back is what the two boxes draw themselves from. Saying back
    // an end that was dropped puts a value in a box beside a link claiming a
    // narrowing that never happened.
    expect(applied("1e3..20")).toBe("..20");
    expect(applied("10..lots")).toBe("10..");
    expect(applied("  10  ..  20  ")).toBe("10..20");
  });
});

describe("what it filters", () => {
  it("is the column it is named after", () => {
    expect(between("10..")[0]?.path).toBe("price");
  });

  it("is another one where it was told to reach it", () => {
    expect(
      NumberRangeFilter.make("cost").path("item.price").clauses("10..")[0]?.path,
    ).toBe("item.price");
  });

  it("survives a label and a path, every method cloning", () => {
    const made = NumberRangeFilter.make("cost").label("Cost").path("item.price");

    expect(made.clauses("10..20")).toEqual([
      { path: "item.price", operator: "gte", value: 10 },
      { path: "item.price", operator: "lte", value: 20 },
    ]);
  });
});
