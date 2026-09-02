/**
 * Every textarea the panel draws says how wide it is.
 *
 * A textarea is 20 columns wide until somebody says otherwise — about 196px,
 * whatever it was put in. Two of the three got away with saying nothing because
 * their parent is a flex box that stretches them; the third sits in a block
 * parent and did not, so its frame was the field's full width and its writing
 * surface was a small rectangle in the corner. Clicking anywhere else did
 * nothing, which is what "it does not work" looked like.
 *
 * Read from the source: jsdom computes no layout, so a rendered editor measures
 * zero and would vouch for any rule at all. The classes are found in the
 * components rather than listed here — a list is what a fourth textarea gets
 * left off.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HERE = new URL("./", import.meta.url);
const STYLES = readFileSync(new URL("./styles.css", HERE), "utf8");

/** Every class name a `<textarea>` in this package is drawn with. */
function textareaClasses(): readonly string[] {
  const found = new Set<string>();
  for (const file of readdirSync(new URL("./fields/", HERE))) {
    if (!file.endsWith(".tsx") || file.includes(".test.")) continue;

    const source = readFileSync(new URL(`./fields/${file}`, HERE), "utf8");
    for (const tag of source.matchAll(/<textarea\b([\s\S]*?)\/?>/g)) {
      const named = /className="([^"]+)"/.exec(tag[1] ?? "");
      expect(named, `a textarea in ${file} is drawn with no class`).not.toBeNull();
      for (const one of (named?.[1] ?? "").split(/\s+/)) if (one !== "") found.add(one);
    }
  }
  return [...found];
}

/** What a property settles to once every rule naming this class has had its say. */
function settled(cls: string, property: string): string | undefined {
  let value: string | undefined;
  for (const rule of STYLES.matchAll(/(^|\n)([^{}@\n][^{}]*?)\{([^{}]*)\}/g)) {
    const named = (rule[2] ?? "").split(",").map((one) => one.trim());
    if (!named.includes(`.${cls}`)) continue;

    const declared = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, "m").exec(
      rule[3] ?? "",
    );
    if (declared?.[1] !== undefined) value = declared[1].trim();
  }
  return value;
}

describe("a writing surface", () => {
  const classes = textareaClasses();

  it("is drawn by more than one component", () => {
    // Guards the guard: a regex that found nothing would pass every case below
    // by having none to check.
    expect(classes.length).toBeGreaterThanOrEqual(3);
  });

  it.each(classes)("%s fills the field it was put in", (cls) => {
    expect(
      settled(cls, "width"),
      `.${cls} leaves its width to the browser, which makes it 20 columns`,
    ).toBe("100%");
  });
});
