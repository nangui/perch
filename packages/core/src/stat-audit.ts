/**
 * What a card cannot be drawn with, asked when it is answered.
 *
 * Not at boot, because a stat has no declaration to inspect there: it is built
 * inside a widget's `stats()`, from numbers that did not exist until somebody
 * asked. So this runs per request, and what it finds is one card's failure
 * rather than a page's.
 *
 * Its own file because it is a different question from the builder's, and
 * because `audit.ts` is about trees that are declared once.
 */
import type { Complaint } from "./audit.js";
import { refuseIcon } from "./audit.js";
import type { Stat } from "./stat.js";

/**
 * Every complaint a set of cards earns. Empty means all of them can be drawn.
 *
 * Two kinds. An icon the panel has no drawing for, which is the same refusal a
 * column's gets and the same closed vocabulary. And a value in a shape that
 * cannot be sent: a host works these out itself, so unlike a row's columns
 * nothing upstream has already widened them, and a `bigint` here would take
 * the request down the way one in a row did.
 */
export function auditStats(stats: readonly Stat[]): readonly Complaint[] {
  return stats.flatMap((stat, index) => {
    const { label, value, icon, descriptionIcon } = stat.state;
    const named = label === "" ? `the stat at ${String(index)}` : label;

    return [
      ...refuseIcon(icon, named),
      ...refuseIcon(descriptionIcon, named),
      ...(value === null || typeof value === "number" || typeof value === "string"
        ? []
        : [
            {
              field: named,
              problem:
                `has a ${typeof value} for a value. A card carries a number, ` +
                `a string or nothing: those are the three a response can be ` +
                `sent as, and a bigint or an object takes the request down`,
            },
          ]),
    ];
  });
}
