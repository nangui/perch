/**
 * Adding one name to a list in a TypeScript module, without breaking the file.
 *
 * Two commands need this — `perch panel` puts `AdminModule` in the root
 * module's `imports`, `perch resource` puts a resource in the panel's
 * `resources` — and the hard part is the same both times: know when not to.
 *
 * Everything here fails closed. An anchor it cannot read without guessing gives
 * back `undefined`, and the caller prints the line to add by hand. A
 * registration that lands in the wrong decorator is worse than a message.
 */

import { dirname, relative } from "node:path";

/** A relative specifier from one generated file to another path. */
export function importFrom(from: string, to: string): string {
  const target = to.replace(/\.tsx?$/, ".js").replace(/\.json$/, ".js");
  const path = relative(dirname(from), target).split("\\").join("/");
  return path.startsWith(".") ? path : `./${path}`;
}

/**
 * `--src` as the generated paths spell it: no leading `./`, no trailing slash.
 * One rule, because three copies of it drift and the symptom is an import that
 * does not resolve.
 */
export function normaliseRoot(src = "src"): string {
  return src.replace(/^\.\//, "").replace(/\/+$/, "") || ".";
}

export interface Entry {
  /** The name to add to the list, and to import. */
  readonly className: string;
  /** Where to import it from, as written. */
  readonly from: string;
  /** The key whose array it joins, e.g. `imports`. */
  readonly key: string;
  /** Whether an absent key may be created. Only true where one belongs. */
  readonly create?: boolean;
}

/**
 * The file with that name added, or `undefined` if it cannot be added safely.
 * A file that already names it comes back unchanged.
 */
export function addToList(text: string, entry: Entry): string | undefined {
  // Both names go into a regex, and both come from somebody else's schema, so
  // both are escaped. `\b` around the name is what keeps `Post` from matching
  // inside `PostResource`.
  if (word(entry.className).test(text)) return text;

  // Exactly one, or this cannot know which list was meant. Two `imports:` in one
  // file is a nested module configuration, and guessing between them puts the
  // panel somewhere nobody asked for.
  const keys = text.match(new RegExp(`\\b${escaped(entry.key)}\\s*:`, "g")) ?? [];
  if (keys.length > 1) return undefined;

  const withImport = addImport(text, entry);
  const list = new RegExp(`\\b${escaped(entry.key)}\\s*:\\s*\\[`).exec(withImport);

  if (list !== null) {
    const at = list.index + list[0].length;
    const rest = withImport.slice(at);
    // We are writing into a file somebody reads, so it comes back as they would
    // have written it: no comma before a `]`, no trailing space before a
    // newline, one space between entries on a line.
    const separator = /^\s*\]/.test(rest) ? "" : /^\n/.test(rest) ? "," : ", ";
    return `${withImport.slice(0, at)}${entry.className}${separator}${rest}`;
  }

  // The key is there but is not an array literal — computed, spread, a variable.
  // Adding one would leave the object with the key twice, which is a syntax
  // error in the file we were asked not to break.
  if (keys.length === 1 || entry.create !== true) return undefined;

  const decorator = /@Module\s*\(\s*\{/.exec(withImport);
  if (decorator === null) return undefined;
  const at = decorator.index + decorator[0].length;
  return `${withImport.slice(0, at)} ${entry.key}: [${entry.className}],${withImport.slice(at)}`;
}

/** That name, as a whole word. */
function word(name: string): RegExp {
  return new RegExp(`\\b${escaped(name)}\\b`);
}

function escaped(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, (match) => `\\${match}`);
}

/**
 * Before the first import, not after the last one.
 *
 * Where an import *ends* cannot be found by a line match: prettier writes
 * `import {\n  Module,\n} from …` all the time, and inserting after that first
 * line lands inside the braces and produces a file that does not parse. Where
 * one *begins* is unambiguous, so that is what this uses.
 */
function addImport(text: string, entry: Entry): string {
  const statement = `import { ${entry.className} } from "${entry.from}";`;
  const first = /^import\b/m.exec(text);
  if (first === null) return `${statement}\n${text}`;

  return `${text.slice(0, first.index)}${statement}\n${text.slice(first.index)}`;
}
