/**
 * The index an agent reads names every page, and is shaped the way the
 * convention says.
 *
 * `llms.txt` is generated from the sidebar, so the failure it can still have
 * is a page that is in neither: written, committed, reachable by nobody and
 * absent from the index. That is the quiet one. A page missing from the site's
 * navigation is a page a reader never finds; a page missing from the index is
 * a page an agent answers without, and answers confidently.
 *
 * The shape is checked too, because a file that parses as prose rather than as
 * an index is a file a reader fetched for nothing: an H1, a summary in a
 * blockquote, then H2 sections of links, with `Optional` meaning what may be
 * skipped.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { llmsTxt } from "../docs/.vitepress/llms.js";
import { addressOf, OPTIONAL_SECTIONS, SIDEBAR } from "../docs/.vitepress/sidebar.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GUIDE = join(ROOT, "docs", "guide");

/** Every page on disk, as the link a sidebar would use for it. */
function pages(directory: string = GUIDE): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "public") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...pages(path));
    else if (entry.name.endsWith(".md")) {
      const link = `/${relative(GUIDE, path).replace(/\.md$/, "")}`;
      out.push(link === "/index" ? "/" : link);
    }
  }
  return out.sort();
}

const generated = (): string =>
  llmsTxt({ guide: GUIDE, title: "Perch", summary: "A summary." });

describe("every page of the guide", () => {
  it("is in the sidebar, so it is reachable and indexed", () => {
    const linked = new Set(
      SIDEBAR.flatMap((section) => section.items.map((i) => i.link)),
    );
    const orphans = pages().filter((link) => !linked.has(link));

    expect(
      orphans,
      `written and linked from nowhere: ${orphans.join(", ")}. Add it to ` +
        "docs/.vitepress/sidebar.ts, which is what the site and llms.txt are both built from.",
    ).toEqual([]);
  });

  it("has a line in llms.txt", () => {
    const text = generated();
    const missing = pages().filter((link) => !text.includes(`(${addressOf(link)})`));

    expect(missing, `absent from llms.txt: ${missing.join(", ")}`).toEqual([]);
  });

  it("was found at all", () => {
    // Otherwise both rules pass by reading an empty directory.
    expect(pages().length).toBeGreaterThan(40);
  });
});

describe("llms.txt", () => {
  it("opens with a title and a summary in a blockquote", () => {
    const lines = generated().split("\n");

    expect(lines[0]).toBe("# Perch");
    expect(lines[2]).toBe("> A summary.");
  });

  it("says Optional, which is the one name the format gives a meaning", () => {
    const text = generated();

    expect(text).toContain("\n## Optional\n");
    // And the reference goes under it rather than beside it: a section called
    // Fields reads as ordinary, and an agent short of room keeps all eleven
    // column pages instead of the page it needed.
    for (const name of OPTIONAL_SECTIONS) {
      expect(text).not.toContain(`\n## ${name}\n`);
    }
  });

  it("carries a note on a link, taken whole rather than to the wrapping", () => {
    const line = generated()
      .split("\n")
      .find((one) => one.includes("guide/tables.md)"));

    // The pages are wrapped at ninety columns, so a note cut at the first line
    // break ends mid-sentence. This one is a whole sentence and ends in a stop.
    expect(line).toContain(": A resource's `table()`");
    expect(line?.trimEnd().endsWith(".")).toBe(true);
  });
});
