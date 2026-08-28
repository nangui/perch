/**
 * The limits a message can be written for, and the rules that check them.
 *
 * The list is written twice: once as a union in `field.ts`, and once as a
 * string at each place a rule is tagged. Neither can see the other, and both
 * fail quietly.
 *
 * A kind in the union that nothing tags is the worse of the two. A resource may
 * pass it, the boot then refuses the message on every field it is ever put on —
 * because the boot checks against rules that exist — and the author is told
 * their field has no such limit rather than that the limit has no rule. The
 * complaint is true and points at the wrong thing.
 *
 * A tag that is not in the union is the other way round: it does not compile.
 * That one the language already holds, and this holds the half it cannot.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = new URL(".", import.meta.url);

/** Every source file that could tag a rule. */
function sources(): readonly string[] {
  return readdirSync(here, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
    .map((name) => readFileSync(new URL(name, here), "utf8"));
}

/** The union, read off the declaration. */
function declared(): readonly string[] {
  const source = readFileSync(new URL("./field.ts", here), "utf8");
  const block = /export type RuleKind =([\s\S]*?);/.exec(source);
  expect(block?.[1], "RuleKind is no longer declared where this looks").toBeDefined();

  return [...(block?.[1] ?? "").matchAll(/"(\w+)"/g)]
    .map((found) => found[1] ?? "")
    .sort();
}

/** The kinds something actually tags a rule with. */
function tagged(): readonly string[] {
  const names = new Set<string>();
  for (const source of sources()) {
    for (const call of source.matchAll(/ruleFor\(\s*"(\w+)"/g)) {
      names.add(call[1] ?? "");
    }
  }
  // Checked before any rule and worded on its own, so nothing tags it — and it
  // is a kind a resource may write a message for all the same.
  names.add("required");
  return [...names].sort();
}

describe("every limit a message may be written for", () => {
  it("has a rule that checks it", () => {
    expect(tagged()).toEqual(declared());
  });

  it("is read off the source, so this cannot pass by finding nothing", () => {
    expect(declared().length).toBeGreaterThan(8);
    expect(tagged().length).toBeGreaterThan(8);
  });
});
