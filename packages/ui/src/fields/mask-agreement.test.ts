/**
 * The two halves of a mask, held against each other.
 *
 * One decides what a keystroke looks like and lives here; the other decides
 * what may be stored and lives on the server, because a shape enforced only in
 * a box is a shape a forged request walks straight past. Neither can import the
 * other — the renderer takes types from the domain and no behaviour.
 *
 * So they are written twice, and the failure that matters is silent: a box that
 * accepts what the server refuses. A reader types something the mask lets them,
 * presses save, and is told it is wrong by a rule they cannot see. That is
 * worse than no mask at all, and nothing else would catch it.
 *
 * Everything this box produces must therefore pass the rule behind it. The
 * other direction is not required and not true: the rule accepts a value with
 * no punctuation, and the box would have written some.
 */
import { describe, expect, it } from "vitest";
import { Schema, TextInput, resolveSchema } from "@perchjs/core";
import { masked } from "./mask.js";

const refusedBy = async (mask: string, value: string): Promise<string | undefined> =>
  (
    await resolveSchema(
      Schema.make([TextInput.make("one").mask(mask)]),
      { one: value },
      { operation: "create" },
    )
  ).errors["one"];

/** Masks worth trying, and what somebody might type into each. */
const SHAPES: readonly { readonly mask: string; readonly typed: readonly string[] }[] =
  [
    {
      mask: "(999) 999-9999",
      typed: [
        "5551234567",
        "(555) 123-4567",
        "555-123-4567",
        "5551234567890",
        "55a51234567",
      ],
    },
    { mask: "aa-9999", typed: ["AB1234", "ab-1234", "AB12345", "12ab34"] },
    { mask: "**-**", typed: ["a1b2", "a1-b2", "abcd", "1234", "a1b2c3"] },
    { mask: "99/99/9999", typed: ["31122026", "31/12/2026", "3112202", "311220269"] },
  ];

describe("everything the box lets through", () => {
  it.each(SHAPES)("fits the rule behind $mask", async ({ mask, typed }) => {
    for (const one of typed) {
      const shown = masked(one, mask);
      // A half-filled box is not a finished value, and the rule is entitled to
      // say so. What must never happen is the box producing something *full*
      // that the rule then turns away.
      const full = (shown.match(/[a-z0-9]/gi) ?? []).length;
      const wanted = (mask.match(/[9a*]/g) ?? []).length;
      if (full !== wanted) continue;

      expect(
        await refusedBy(mask, shown),
        `${mask} <- ${one} => ${shown}`,
      ).toBeUndefined();
    }
  });

  it("is tried against something, so this cannot pass by trying nothing", () => {
    expect(SHAPES.flatMap((one) => one.typed).length).toBeGreaterThan(12);
  });
});

describe("the placeholders both halves know", () => {
  it("are the same three", async () => {
    // Read off each side rather than listed here: a fourth added to one and not
    // the other is a box that shapes a character the rule refuses, or a rule
    // that expects one the box will not type.
    const { readFileSync } = await import("node:fs");
    const mine = readFileSync(new URL("./mask.ts", import.meta.url), "utf8");
    const theirs = readFileSync(
      new URL("../../../core/src/fields/text-input.ts", import.meta.url),
      "utf8",
    );

    const placeholders = (source: string): readonly string[] => {
      const block = /const PLACEHOLDERS[\s\S]*?\{([\s\S]*?)\n\};/.exec(source);
      expect(block?.[1], "PLACEHOLDERS is no longer where this looks").toBeDefined();
      return [...(block?.[1] ?? "").matchAll(/^\s*"?([\w*])"?:/gm)]
        .map((found) => found[1] ?? "")
        .sort();
    };

    expect(placeholders(mine)).toEqual(placeholders(theirs));
    expect(placeholders(mine).length).toBe(3);
  });
});
