/**
 * The guide as an index an agent can read in one fetch.
 *
 * `llms.txt` is a convention: a markdown file at a site's root holding an H1,
 * an optional summary in a blockquote, then H2 sections that are lists of
 * links. One name in it means something, `Optional`, and it means what may be
 * skipped when there is not room for everything.
 *
 * Built from the sidebar rather than written beside it. A hand-kept index of
 * fifty-five pages is an index that is wrong by the third commit, and wrong in
 * the direction nobody notices: a page missing from it is a page the agent
 * answers without.
 *
 * The note on each link is the page's own opening line. A summary written here
 * would be a second description of every page, kept in step by nobody.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addressOf, OPTIONAL_SECTIONS, SIDEBAR } from "./sidebar.js";

/**
 * What the page says it is, in its own words.
 *
 * The first line of prose under the heading, which every page in this guide
 * opens with because that is how they are written. Nothing invented where a
 * page has none.
 */
export function summaryOf(guide: string, link: string): string | undefined {
  const file = join(guide, `${link === "/" ? "/index" : link}.md`);
  const lines = readFileSync(file, "utf8").split("\n");

  let seenHeading = false;
  const paragraph: string[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (text.startsWith("# ")) {
      seenHeading = true;
      continue;
    }
    if (!seenHeading) continue;
    if (text === "") {
      // A blank line ends the paragraph, and only once one has started: there
      // is one between the heading and the prose under it.
      if (paragraph.length > 0) break;
      continue;
    }
    // Anything that is not prose means the page opened without a sentence. A
    // truncated line of TypeScript is worse as a note than no note at all.
    if (text.startsWith("```") || text.startsWith("#")) {
      return paragraph.length > 0 ? paragraph.join(" ") : undefined;
    }
    paragraph.push(text);
  }
  // Whole, not the first line of it. These pages are wrapped at ninety
  // columns, so one line is a sentence cut wherever the wrapping fell.
  return paragraph.length > 0 ? paragraph.join(" ") : undefined;
}

export interface LlmsOptions {
  /** Where the pages are, so the notes can be read off them. */
  readonly guide: string;
  readonly title: string;
  readonly summary: string;
}

export function llmsTxt({ guide, title, summary }: LlmsOptions): string {
  const listed = (section: (typeof SIDEBAR)[number]): string[] =>
    section.items.map((item) => {
      const note = summaryOf(guide, item.link);
      return `- [${item.text}](${addressOf(item.link)})${note === undefined ? "" : `: ${note}`}`;
    });

  const ordinary = SIDEBAR.filter((one) => !OPTIONAL_SECTIONS.includes(one.text));
  const optional = SIDEBAR.filter((one) => OPTIONAL_SECTIONS.includes(one.text));

  const parts = [`# ${title}`, "", `> ${summary}`, ""];
  for (const section of ordinary) {
    parts.push(`## ${section.text}`, "", ...listed(section), "");
  }

  // One section, not one per kind: `Optional` is a name the format gives a
  // meaning to, and three sections called something else would be three
  // sections an agent reads as ordinary.
  if (optional.length > 0) {
    parts.push("## Optional", "");
    for (const section of optional) {
      parts.push(`<!-- ${section.text} -->`, ...listed(section), "");
    }
  }
  return `${parts.join("\n").trimEnd()}\n`;
}
