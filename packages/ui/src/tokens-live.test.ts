/**
 * A token nobody reads.
 *
 * `tokens.css` is the panel's whole answer to theming: an integrator redefines
 * a custom property and the components follow, because a component style names
 * a token and never a raw colour. That promise only holds one way round. A
 * token the sheet declares and nothing reads is a setting that looks exactly
 * like one that works, and the reader who tries it has no way to tell.
 *
 * Three of them existed. `--perch-debounce-text` and its immediate twin were
 * worse than idle: they carried the same 400 and 0 that `DEBOUNCE_MS` holds in
 * TypeScript, where the decision is actually made, so tuning them changed
 * nothing and editing the source would have left them announcing a stale
 * number. `--perch-font-serif` named a stack no component ever asked for.
 *
 * None of the three was found by reading the sheet. They were found by
 * checking a sentence in the documentation before writing it, which is not a
 * thing that happens on a schedule.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = join(import.meta.dirname);
const SHEET = join(HERE, "tokens.css");

/** Every property the token sheet declares, by name. */
function declared(): readonly string[] {
  const text = readFileSync(SHEET, "utf8");
  return [...new Set(text.match(/^\s*--perch-[a-z0-9-]+(?=\s*:)/gm) ?? [])].map((one) =>
    one.trim(),
  );
}

/**
 * Everything that could read one: the component styles, and the modules.
 *
 * The token sheet is in here too, because a token may be built from another —
 * `--perch-focus-ring` is written out of `--perch-surface` and the accent, and
 * neither of those is idle for being used there rather than in a component.
 */
function readers(): string {
  const walk = (at: string): readonly string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
      const next = join(at, entry.name);
      if (entry.isDirectory()) return walk(next);
      return /\.(css|ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")
        ? [next]
        : [];
    });
  return walk(HERE)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

describe("the token sheet", () => {
  it("declares nothing that no stylesheet and no module reads", () => {
    const corpus = readers();
    const idle = declared().filter((token) => !corpus.includes(`var(${token}`));

    expect(idle).toEqual([]);
  });

  it("is where every token a component sets is first declared", () => {
    // A component may redefine one against a selector: `--perch-modal-width`
    // is declared once here and narrowed ten times by `[data-width]`, which is
    // what custom properties are for. What it may not do is invent one. A
    // token an integrator cannot find in the sheet is a token they cannot
    // theme, whatever it happens to control.
    const known = new Set(declared());

    const walk = (at: string): readonly string[] =>
      readdirSync(at, { withFileTypes: true }).flatMap((entry) => {
        const next = join(at, entry.name);
        if (entry.isDirectory()) return walk(next);
        return entry.name.endsWith(".css") && entry.name !== "tokens.css" ? [next] : [];
      });

    const invented = walk(HERE).flatMap((file) =>
      (readFileSync(file, "utf8").match(/^\s*--perch-[a-z0-9-]+(?=\s*:)/gm) ?? [])
        .map((one) => one.trim())
        .filter((one) => !known.has(one))
        .map((one) => `${file.slice(HERE.length + 1)}: ${one}`),
    );

    expect(invented).toEqual([]);
  });
});
