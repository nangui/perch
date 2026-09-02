/**
 * One value inside a row, by a dotted path.
 *
 * Core has this function and `@perchjs/ui` may not call it: the renderer gets
 * *types* from the domain and no values, because core is not a runtime
 * dependency of this package and an import that compiles here would fail for
 * whoever installs it. Eight lines is what that boundary costs, and
 * `boundaries.test.ts` is what noticed.
 *
 * Here rather than inside the table, because a cell reads paths too: a column
 * drawing a face beside a name is handed the whole row and told where the other
 * two values are.
 */
import type { Row } from "@perchjs/core";

export function readPath(row: Row, path: string): unknown {
  let cursor: unknown = row;
  for (const segment of path.split(".")) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
