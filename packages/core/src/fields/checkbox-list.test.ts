/**
 * Several of a few, and the closed set that keeps them honest.
 *
 * Every choice is on the page, so there is no window and no relation to excuse
 * a value from outside the list — the same reading a radio gets. What differs
 * is the arithmetic: the value is a list, and an empty one is a real answer.
 */
import { describe, expect, it } from "vitest";
import { auditSchema } from "../audit.js";
import { Schema } from "../layout.js";
import { dehydrate, resolveSchema } from "../resolve.js";
import { sanitize } from "../sanitize.js";
import { serialise } from "../serialise.js";
import { CheckboxList } from "./checkbox-list.js";

const ROLES = { lead: "Lead", member: "Member", guest: "Guest" };

const tree = (made = CheckboxList.make("roles").options(ROLES)) =>
  resolveSchema(Schema.make([made]), {}, { operation: "create" });

const refusal = async (value: unknown, made?: CheckboxList) =>
  sanitize(await tree(made), { roles: value }).rejected[0]?.reason;

describe("what a checkbox list may hold", () => {
  it("several of what was declared", async () => {
    expect(sanitize(await tree(), { roles: ["lead", "guest"] }).state).toEqual({
      roles: ["lead", "guest"],
    });
  });

  it("one of them, which is still a list", async () => {
    expect(sanitize(await tree(), { roles: ["lead"] }).state).toEqual({
      roles: ["lead"],
    });
  });

  it("an empty list, which is a reader unticking everything", async () => {
    // A real answer, and different from never having been asked: it is a
    // clearing, and clearing is always allowed.
    expect(sanitize(await tree(), { roles: [] }).state).toEqual({ roles: [] });
  });

  it("nothing that is not a list, however single the value looks", async () => {
    expect(await refusal("lead")).toBe("wrong-shape");
    expect(await refusal(3)).toBe("wrong-shape");
    expect(await refusal({ lead: true })).toBe("wrong-shape");
  });

  it("nothing that is not a scalar inside the list", async () => {
    expect(await refusal([{ value: "lead" }])).toBe("wrong-shape");
    expect(await refusal([["lead"]])).toBe("wrong-shape");
  });

  it("nothing nobody declared, even beside something that was", async () => {
    // The whole list is refused rather than the stranger dropped from it: a
    // half-admitted answer is one the reader never gave.
    expect(await refusal(["lead", "owner"])).toBe("undeclared-value");
  });

  it("nothing at all where nothing was declared", async () => {
    expect(await refusal(["lead"], CheckboxList.make("roles"))).toBe(
      "undeclared-value",
    );
  });

  it("nothing ticked twice, which no page can produce", async () => {
    // The same reading a repeater gives its keys: two ticks of one choice are
    // one choice, and left in, the list says the reader picked it twice.
    expect(await refusal(["lead", "lead"])).toBe("wrong-shape");
  });

  it("a key declared as a number, which a form returns as text", async () => {
    const numbered = CheckboxList.make("roles").options({ 1: "One", 2: "Two" });

    expect(sanitize(await tree(numbered), { roles: ["1"] }).state).toEqual({
      roles: ["1"],
    });
  });
});

describe("what it writes", () => {
  it("the list, as the list", async () => {
    const resolved = await resolveSchema(
      Schema.make([CheckboxList.make("roles").options(ROLES)]),
      { roles: ["lead", "guest"] },
      { operation: "create" },
    );

    expect(dehydrate(resolved, { operation: "create", user: undefined }).set).toEqual({
      roles: ["lead", "guest"],
    });
  });
});

describe("what it tells the browser", () => {
  it("its choices, and how they are laid out", async () => {
    const payload = serialise(
      await tree(CheckboxList.make("roles").options(ROLES).columns(3).bulkToggleable()),
    );
    const node = payload.schema.children?.[0];

    expect(node?.type).toBe("CheckboxList");
    expect(node?.options?.map((one) => one.value)).toEqual(["lead", "member", "guest"]);
    expect(node?.props?.["columns"]).toBe(3);
    expect(node?.props?.["bulkToggleable"]).toBe(true);
  });

  it("nothing about a layout nobody asked for", async () => {
    // `bulkToggleable` has a default and crosses with it, the way a radio's
    // `inline` does. `columns` has none, so silence is the answer.
    const node = serialise(await tree()).schema.children?.[0];

    expect(node?.props?.["columns"]).toBeUndefined();
    expect(node?.props?.["bulkToggleable"]).toBe(false);
  });
});

describe("a count of columns nothing can be laid out in", () => {
  const audited = (columns: number) =>
    auditSchema(
      Schema.make([CheckboxList.make("roles").options(ROLES).columns(columns)]),
    );

  it("stops the boot, because the grid quietly falls back to one", () => {
    // `repeat(0, …)` is invalid, so the declaration is dropped and the layout
    // silently becomes what it would have been with no columns at all.
    expect(audited(0)[0]?.problem).toMatch(/not a number of columns/);
    expect(audited(-2)).toHaveLength(1);
    expect(audited(1.5)).toHaveLength(1);
  });

  it("says nothing about a count that works", () => {
    expect(audited(2)).toEqual([]);
  });
});

describe("a choice with nothing to choose from", () => {
  it("stops the boot, the way every other one does", () => {
    // The same complaint a select and a radio get. A control that can only be
    // put back where it started is not a control.
    expect(auditSchema(Schema.make([CheckboxList.make("roles")]))).not.toEqual([]);
  });
});
