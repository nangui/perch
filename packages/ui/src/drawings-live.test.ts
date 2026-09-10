/**
 * Two homes for a drawing, and nothing written twice.
 *
 * A **named** mark is one a resource asked for by name: uniform, one box and
 * one stroke, and it lives in `icons.tsx`. A **fitted** mark is one the
 * panel draws for its own slot, sized in pixels against that slot, and it lives
 * in `marks.tsx`. Which file a drawing belongs in follows from which
 * kind it is, so neither question needs remembering.
 *
 * What does need holding is the rule that keeps the two from breeding copies.
 * A calendar and a copy were each written twice — the same `d`, in two files,
 * at two sizes — and before them the stylesheet drew the select's chevron a
 * second time as a data URI, which could not reach `currentColor` and stayed
 * grey on the dark ramp while the drawn one lightened. One shape, two drawings,
 * and the one nobody is looking at is the one that goes wrong.
 *
 * Read from the sources. A drawing nobody wired up is exactly the case to
 * catch, and a component that is never rendered cannot be asked at runtime what
 * it draws.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = new URL("./", import.meta.url).pathname;

/** The two files a drawing may live in. */
const HOMES = ["icons.tsx", "marks.tsx"] as const;

function sources(): readonly { readonly name: string; readonly text: string }[] {
  const found: { name: string; text: string }[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path, `${prefix}${entry}/`);
        continue;
      }
      if (!entry.endsWith(".tsx") || entry.includes(".test.")) continue;
      found.push({ name: `${prefix}${entry}`, text: readFileSync(path, "utf8") });
    }
  };
  walk(HERE, "");
  return found;
}

/** Every shape a source draws, as the file that draws it. */
function drawnIn(): ReadonlyMap<string, readonly string[]> {
  const byShape = new Map<string, string[]>();
  for (const { name, text } of sources()) {
    // Both spellings: `d="…"` and the two literals of a `d={a ? "…" : "…"}`.
    for (const found of text.matchAll(/"([Mm][\s\d.,-][^"]*)"/g)) {
      const shape = (found[1] ?? "").replace(/\s+/g, " ").trim();
      const files = byShape.get(shape) ?? [];
      if (!files.includes(name)) files.push(name);
      byShape.set(shape, files);
    }
  }
  return byShape;
}

describe("a drawing", () => {
  it("is looked for, and found", () => {
    // Guards the guard: a regex matching nothing passes everything below.
    expect(drawnIn().size).toBeGreaterThan(25);
  });

  it("is declared in one of the two homes and nowhere else", () => {
    const stray = sources()
      .filter(({ text }) => text.includes("<svg"))
      .map(({ name }) => name)
      .filter((name) => !(HOMES as readonly string[]).includes(name));

    // A component drawing its own is how the calendar and the two month arrows
    // came to sit inside `DateTimePicker`, where nothing compared them to the
    // set. If this fails: a named mark goes to `icons.tsx`, a fitted one to
    // `marks.tsx`, and the component imports it.
    expect(stray).toEqual([]);
  });

  it("is never the same shape written in two files", () => {
    const twice = [...drawnIn()]
      .filter(([, files]) => files.length > 1)
      .map(([shape, files]) => `${files.join(" + ")}: ${shape.slice(0, 40)}`);

    // The test is on the `d`, not on the idea. Two drawings of one idea are
    // allowed and are why there are two homes — a select's chevron is wide and
    // short because that is the space it has. Two copies of one drawing are
    // not: that is a shape with somewhere to drift to.
    expect(twice).toEqual([]);
  });
});
