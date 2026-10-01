import { describe, expect, it } from "vitest";
import type { Narrowing, Query } from "./data-adapter.js";
import { narrowingOf } from "./data-adapter.js";

/**
 * Every field a narrowing has, named.
 *
 * `Required` is what makes this a guard rather than an example: a field added
 * to `Narrowing` and left out of this literal stops the compiler here, which
 * is the only place that can notice. Left out of `narrowingOf` instead, it
 * would be a footer worked out over rows the page never listed, and a total
 * over the wrong rows reads exactly like a total.
 */
const WHOLE: Required<Narrowing> = {
  model: "Order",
  clauses: [{ path: "status", operator: "equals", value: "sent" }],
  deleted: "only",
  search: { term: "ada", paths: ["reference"] },
  joinedTo: { relation: "items", key: "orderId", value: 7, holding: "joined" },
};

describe("a query's narrowing, apart from how much of it to read", () => {
  it("carries every field that says which rows", () => {
    expect(narrowingOf(WHOLE)).toEqual(WHOLE);
  });

  it("leaves behind every field that says how much", () => {
    // An aggregate over a page is a total that moves when somebody turns one,
    // and the port says nothing about what a `take` would mean to it because
    // it must not arrive.
    const paged: Query = {
      ...WHOLE,
      sort: [{ path: "reference", direction: "asc" }],
      skip: 25,
      take: 25,
      include: { items: true },
    };

    expect(narrowingOf(paged)).toEqual(WHOLE);
  });

  it("keeps a bare query bare, rather than filling it with undefined", () => {
    // A key present and undefined is not the same as a key absent: the first
    // one an adapter spreads into its arguments, and some of them mind.
    expect(narrowingOf({ model: "Order" })).toEqual({ model: "Order" });
    expect(Object.keys(narrowingOf({ model: "Order" }))).toEqual(["model"]);
  });
});
