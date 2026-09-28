/**
 * What the port for rows asks of an adapter, run against a real one.
 *
 * The promises worth checking are the ones written in the port's own comments
 * rather than in its signatures, because those are the ones a plausible
 * implementation gets wrong. A page has to end on something unique even when
 * the sort does not, or two pages repeat a row and drop another and the reader
 * never learns which. `restore` answers how many rows it lifted rather than how
 * many were asked for. A transaction that half-applies is the failure milestone
 * A3 exists for.
 *
 * Handed back rather than asserted, like the storage contract beside it: this
 * package names no test runner. An empty list is the adapter conforming.
 *
 * Given `filterOn` and `searchOn` it asks what a query means as well: the seven
 * operators a string can answer, that a total counts what matched rather than
 * what the table holds, and that a search reaches the paths it was handed and
 * no others. The last is an authorization question rather than a correctness
 * one, which is why it is here rather than left to a reader to think of.
 *
 * What it does not check, and says so rather than implying otherwise. Relations
 * are untouched: `attach` and `detach` want a join table this has no way to
 * name, and an include wants a second model. So are the four comparisons, which
 * want an ordered value rather than the text everything here is written in.
 */
import type { Clause, DataAdapter, Id, Page, Row, WriteTree } from "@perchjs/core";

export interface DataAdapterCheck {
  /** The model written to and read back. */
  readonly model: string;
  /**
   * Three writes the adapter accepts, tied on the path below.
   *
   * Tied on purpose: it is what makes the paging question real. Sorted on a
   * column holding one value in every row, the order is the adapter's to settle
   * and a page boundary is where it shows.
   */
  readonly rows: readonly WriteTree[];
  /** A path all three carry, holding the same value in each. */
  readonly tiedOn: string;
  /**
   * A path holding text, and what the first of the rows holds there.
   *
   * Given, this checks what a clause means rather than only that one is
   * accepted: the seven operators a string can answer, and that the total
   * counts what matched rather than what the table holds.
   */
  readonly filterOn?: {
    readonly path: string;
    /** What the first row holds there, exactly. */
    readonly value: string;
    /** What none of them hold. */
    readonly absent: string;
  };
  /**
   * A term, the path that holds it, and a path that does not.
   *
   * The second is the point. Which columns a search reaches is an
   * authorization decision — a match on a column nobody displays answers a
   * question about it, one letter at a time — so an adapter that searches
   * everything and ignores the paths it was handed is answering questions the
   * panel never asked.
   */
  readonly searchOn?: {
    readonly term: string;
    /** A path holding the term in the first row. */
    readonly reaching: string;
    /** A path on the same model that does not hold it. */
    readonly notReaching: string;
  };
}

export async function checkDataAdapter(
  adapter: DataAdapter,
  check: DataAdapterCheck,
): Promise<readonly string[]> {
  const wrong: string[] = [];
  const say = (what: string): void => void wrong.push(what);
  const attempt = async <T>(
    what: string,
    run: () => Promise<T> | T,
  ): Promise<T | undefined> => {
    try {
      return await run();
    } catch (error) {
      say(`${what} raised: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  const { model, rows, tiedOn } = check;
  if (rows.length < 3) {
    say("checkDataAdapter wants three rows: two pages of one leave nothing to tie.");
    return wrong;
  }

  const meta = await attempt("meta()", () => adapter.meta(model));
  if (meta === undefined) return wrong;
  const key = meta.primaryKey.name;
  const idOf = (row: Row): Id => row[key] as Id;

  const made: Row[] = [];
  for (const write of rows) {
    const row = await attempt("create()", () => adapter.create(model, write));
    if (row === undefined) return wrong;
    if (row[key] === undefined) say(`create() answered a row with no ${key} in it.`);
    made.push(row);
  }
  const keys = made.map(idOf);

  const found = await attempt("findOne()", () => adapter.findOne(model, keys[0] as Id));
  if (found !== undefined && found === null)
    say("findOne() did not find a row it had just made.");

  // A page ends on something unique, whatever the sort says. Read one at a
  // time, sorted on the path they all share: an adapter that stops there hands
  // the same row back twice and never mentions the one it skipped.
  // The whole table, a page at a time, rather than the first few: a model this
  // is pointed at may already hold rows, and the promise is about any two pages
  // rather than about the ones written here happening to land on the first.
  const whole = await attempt("findMany()", () => adapter.findMany({ model }));
  if (whole === undefined) return wrong;

  // Bounded, because this is a query per page and a reader may point it at a
  // table with a hundred thousand rows in it. Crossing a page boundary is what
  // the promise is about, and twenty-five of them cross plenty.
  const pages = Math.min(whole.total, 25);
  const seen: Id[] = [];
  let total: number | undefined;
  for (let skip = 0; skip < pages; skip += 1) {
    const page = await attempt("findMany()", () =>
      adapter.findMany({
        model,
        sort: [{ path: tiedOn, direction: "asc" }],
        skip,
        take: 1,
      }),
    );
    if (page === undefined) return wrong;
    total ??= page.total;
    for (const row of page.rows) seen.push(idOf(row));
  }

  const distinct = new Set(seen.map(String));
  if (distinct.size !== seen.length) {
    say(
      `findMany() gave the same row on two pages: ${String(seen.length)} rows read, ${String(distinct.size)} of them different. The order has to end on something unique.`,
    );
  }
  // Only where every page was read: past the bound above, a row missing from
  // what was seen is a row further down the table rather than one skipped.
  if (pages === whole.total) {
    for (const one of keys) {
      if (!distinct.has(String(one))) {
        say(
          `findMany() never gave row ${String(one)} on any page, having repeated another.`,
        );
        break;
      }
    }
  }
  if (total !== undefined && total < rows.length) {
    say(
      `findMany() answered a total of ${String(total)} for ${String(rows.length)} rows.`,
    );
  }

  if (check.filterOn !== undefined) {
    const { path, value, absent } = check.filterOn;
    const mine = String(keys[0]);
    const ask = async (
      operator: Clause["operator"],
      against: unknown,
    ): Promise<Page | undefined> =>
      await attempt(`findMany() with ${operator}`, () =>
        adapter.findMany({ model, clauses: [{ path, operator, value: against }] }),
      );
    const holds = (page: Page): boolean =>
      page.rows.some((row) => String(idOf(row)) === mine);

    // The substring three are only asked for where there is a substring to ask
    // about: a value of two letters slices to nothing, and `contains ""`
    // matches every row, which is a check that cannot fail.
    const substrings =
      value.length >= 3
        ? ([
            ["contains", value.slice(1, -1)],
            ["startsWith", value.slice(0, 2)],
            ["endsWith", value.slice(-2)],
          ] as const)
        : ([] as const);
    if (value.length < 3) {
      say(
        `checkDataAdapter was given "${value}" to filter on, which is too short to slice: contains, startsWith and endsWith went unchecked.`,
      );
    }

    for (const [operator, against] of [
      ["equals", value],
      ["in", [value]],
      ...substrings,
    ] as const) {
      const page = await ask(operator, against);
      if (page === undefined) continue;
      if (!holds(page))
        say(`findMany() with ${operator} left out the row that matches it.`);
      if (page.total < page.rows.length) {
        say(`findMany() with ${operator} answered a total below the page it gave.`);
      }
    }

    const none = await ask("equals", absent);
    if (none !== undefined) {
      if (none.rows.length > 0) {
        say("findMany() gave rows for a clause nothing matches.");
      }
      if (none.total !== 0) {
        say(
          `findMany() answered a total of ${String(none.total)} for a clause nothing matches, which is the table's rather than the query's.`,
        );
      }
    }

    for (const operator of ["not", "notIn"] as const) {
      const wrap = (one: string): unknown => (operator === "not" ? one : [one]);

      const kept = await ask(operator, wrap(absent));
      if (kept !== undefined && !holds(kept)) {
        say(
          `findMany() with ${operator} left out a row that holds none of what it excludes.`,
        );
      }

      // And the half that says it is an exclusion at all. Without it an adapter
      // ignoring the operator and answering with the table passes the line
      // above, which is a check that cannot fail.
      const excluded = await ask(operator, wrap(value));
      if (excluded !== undefined && holds(excluded)) {
        say(`findMany() with ${operator} kept the row it was told to exclude.`);
      }
    }
  }

  if (check.searchOn !== undefined) {
    const { term, reaching, notReaching } = check.searchOn;
    const mine = String(keys[0]);

    const reached = await attempt("findMany() with a search", () =>
      adapter.findMany({ model, search: { term, paths: [reaching] } }),
    );
    if (
      reached !== undefined &&
      !reached.rows.some((row) => String(idOf(row)) === mine)
    ) {
      say(`findMany() searched ${reaching} and did not find a term it holds.`);
    }

    // The one that matters: the paths are the panel's decision, not the
    // adapter's, and an adapter that searches everything answers about columns
    // nobody was shown.
    const elsewhere = await attempt("findMany() with a search", () =>
      adapter.findMany({ model, search: { term, paths: [notReaching] } }),
    );
    if (
      elsewhere !== undefined &&
      elsewhere.rows.some((row) => String(idOf(row)) === mine)
    ) {
      say(
        `findMany() searched beyond the paths it was given: a term in ${reaching} came back from a search of ${notReaching}.`,
      );
    }
  }

  const first = keys[0] as Id;
  const dropped = await attempt("delete()", () => adapter.delete(model, [first]));
  if (dropped !== undefined && dropped !== 1) {
    say(`delete() answered ${String(dropped)} for one row.`);
  }

  // The default everywhere, and named rather than assumed: a read that says
  // nothing about deleted rows is a read that does not want them.
  const after = await attempt("findMany()", () => adapter.findMany({ model }));
  if (
    after !== undefined &&
    after.rows.some((row) => String(idOf(row)) === String(first))
  ) {
    say("findMany() gave back a deleted row to a read that did not ask for one.");
  }

  if (meta.hasSoftDelete) {
    const marked = await attempt("findOne()", () =>
      adapter.findOne(model, first, { deleted: "with" }),
    );
    if (marked !== undefined && marked === null) {
      say(
        "delete() destroyed a row on a model that marks, where the mark was asked for.",
      );
    }

    // Answers what it lifted, not what it was asked for: the second was never
    // marked, so the count is one.
    const lifted = await attempt("restore()", () =>
      adapter.restore(model, [first, keys[1] as Id]),
    );
    if (lifted !== undefined && lifted !== 1) {
      say(`restore() answered ${String(lifted)} for one marked row and one live one.`);
    }

    await attempt("delete()", () => adapter.delete(model, [first]));
    const destroyed = await attempt("forceDelete()", () =>
      adapter.forceDelete(model, [first]),
    );
    if (destroyed !== undefined && destroyed !== 1) {
      say(`forceDelete() answered ${String(destroyed)} for one marked row.`);
    }
    const gone = await attempt("findOne()", () =>
      adapter.findOne(model, first, { deleted: "with" }),
    );
    if (gone !== undefined && gone !== null) {
      say("forceDelete() left a row a read asking for marked ones still finds.");
    }
  }

  const missing = await attempt("findOne()", () =>
    adapter.findOne(model, "a-key-that-was-never-there"),
  );
  if (missing !== undefined && missing !== null) {
    say("findOne() answered a row for a key that was never there.");
  }

  // Rolls back entirely, which is the milestone rather than a nicety: a
  // repeater writes its rows and its parent in one of these.
  const before = await attempt("findMany()", () => adapter.findMany({ model }));
  try {
    await adapter.transaction(async (tx) => {
      await tx.create(model, rows[0] as WriteTree);
      throw new Error("rolled back on purpose");
    });
    say("transaction() swallowed a throw from inside it.");
  } catch (error) {
    if (error instanceof Error && error.message !== "rolled back on purpose") {
      say(`transaction() raised something else: ${error.message}`);
    }
  }
  const afterRollback = await attempt("findMany()", () => adapter.findMany({ model }));
  if (
    before !== undefined &&
    afterRollback !== undefined &&
    afterRollback.total > before.total
  ) {
    say(
      `transaction() kept a write from a transaction that threw: ${String(before.total)} rows before, ${String(afterRollback.total)} after.`,
    );
  }

  return wrong;
}
