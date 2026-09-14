/**
 * A resource's table, driven the way a browser drives it.
 *
 * Through `/records`, which is where the panel's own table goes for every page
 * after the first — same query string, same answer. What a test asserts on is
 * therefore the rows a reader would be shown, filtered by the same policy and
 * narrowed by the same filters, rather than whatever the database holds.
 *
 * The query count is the exception: it is taken at the adapter, because how
 * many times the panel went to the database is not a thing a browser can see,
 * and it is the whole point of the N+1 guardrail.
 */
import type { RecordsResponse } from "@perchjs/nest";
import type { Counter } from "./counter.js";
import type { Wire } from "./wire.js";

type Step = () => Promise<void>;

/** A record, or just its key. Both are things a test has in hand. */
export type RecordLike = string | number | Readonly<Record<string, unknown>>;

function show(value: unknown): string {
  const said = (JSON.stringify as (one: unknown) => string | undefined)(value);
  return said ?? String(value);
}

export class TableTest implements PromiseLike<undefined> {
  readonly #wire: Wire;
  readonly #slug: string;
  readonly #counter: Counter;
  readonly #steps: Step[] = [];
  readonly #filters: Record<string, string> = {};
  #search: string | undefined;
  #page: RecordsResponse | undefined;
  #ran = false;
  #threw: unknown;

  constructor(wire: Wire, slug: string, counter: Counter) {
    this.#wire = wire;
    this.#slug = slug;
    this.#counter = counter;
    // Counted from here, so a number in an assertion is about what the chain
    // did rather than about whatever booted the panel.
    this.#steps.push(async () => {
      this.#counter.reset();
      await this.#fetch();
    });
  }

  async #fetch(): Promise<void> {
    const query = new URLSearchParams();
    if (this.#search !== undefined) query.set("search", this.#search);
    for (const [name, value] of Object.entries(this.#filters)) {
      query.set(`filter.${name}`, value);
    }
    const at = `/api/${encodeURIComponent(this.#slug)}/records`;
    const response = await this.#wire.get(
      query.size === 0 ? at : `${at}?${query.toString()}`,
    );
    if (!response.ok) {
      throw new Error(
        `The table of "${this.#slug}" answered ${String(response.status)}. A reader ` +
          `who cannot list sees no rows, so there is nothing here to assert on.`,
      );
    }
    this.#page = (await response.json()) as RecordsResponse;
  }

  #step(step: Step): this {
    this.#steps.push(step);
    return this;
  }

  #shown(): RecordsResponse {
    if (this.#page === undefined) throw new Error("The table was never read.");
    return this.#page;
  }

  /** The key of a record a test named, whichever way it named it. */
  #keyOf(record: RecordLike): unknown {
    if (typeof record === "string" || typeof record === "number") return record;
    const key = this.#shown().recordKey;
    const found = record[key];
    if (found === undefined) {
      throw new Error(
        `A record was named by an object with no "${key}" on it, and "${key}" is what ` +
          `this model is keyed by. Pass the key itself, or a row that carries it.`,
      );
    }
    return found;
  }

  /** Narrows the list, by a filter the table declared. */
  filter(name: string, value: string | number): this {
    return this.#step(async () => {
      this.#filters[name] = String(value);
      await this.#fetch();
      // A filter nothing declared is dropped in silence — that is the
      // boundary working — and a test that asked for one would otherwise
      // assert against an unfiltered list believing it filtered.
      if (this.#shown().filters?.[name] === undefined) {
        throw new Error(
          `The table of "${this.#slug}" applied no filter called "${name}". It ` +
            `applied: ${show(this.#shown().filters ?? {})}. A filter the table did ` +
            `not declare is dropped without a word.`,
        );
      }
    });
  }

  /** Searches, as the box above the table does. */
  search(term: string): this {
    return this.#step(async () => {
      this.#search = term;
      await this.#fetch();
    });
  }

  /** Exactly these, in no particular order, and nothing else. */
  assertCanSeeRecords(records: readonly RecordLike[]): this {
    return this.#step(async () => {
      const page = this.#shown();
      const shown = page.rows.map((row) => String(row[page.recordKey]));
      const want = records.map((one) => String(this.#keyOf(one)));
      const missing = want.filter((one) => !shown.includes(one));
      const extra = shown.filter((one) => !want.includes(one));
      if (missing.length > 0 || extra.length > 0) {
        throw new Error(
          `Expected the table of "${this.#slug}" to show ${show(want)} and it showed ` +
            `${show(shown)}.` +
            (missing.length > 0 ? ` Missing: ${show(missing)}.` : "") +
            (extra.length > 0 ? ` Unexpected: ${show(extra)}.` : ""),
        );
      }
      await Promise.resolve();
    });
  }

  /** That a record is not on the page, whatever else is. */
  assertCannotSeeRecords(records: readonly RecordLike[]): this {
    return this.#step(async () => {
      const page = this.#shown();
      const shown = page.rows.map((row) => String(row[page.recordKey]));
      const found = records
        .map((one) => String(this.#keyOf(one)))
        .filter((one) => shown.includes(one));
      if (found.length > 0) {
        throw new Error(
          `Expected the table of "${this.#slug}" not to show ${show(found)}, and it did.`,
        );
      }
      await Promise.resolve();
    });
  }

  /** How many rows the server says there are, which is not how many it sent. */
  assertTotal(total: number): this {
    return this.#step(async () => {
      const said = this.#shown().total;
      if (said !== total) {
        throw new Error(
          `Expected the table of "${this.#slug}" to hold ${String(total)} rows in all, ` +
            `and it says ${String(said)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /**
   * How many times the panel went to the database for all of this.
   *
   * The N+1 guardrail. A relation drawn in a column has to arrive with the
   * rows, in one query, and the number that proves it is this one — a table
   * that fetches a country per row still looks perfectly correct on screen.
   */
  assertQueryCount(queries: number): this {
    return this.#step(async () => {
      const made = this.#counter.count();
      if (made !== queries) {
        throw new Error(
          `Expected the table of "${this.#slug}" to cost ${String(queries)} ` +
            `${queries === 1 ? "query" : "queries"}, and it cost ${String(made)}. ` +
            `A count that grows with the number of rows is a relation being ` +
            `fetched one row at a time.`,
        );
      }
      await Promise.resolve();
    });
  }

  /** What the server last sent, for an assertion this package does not have. */
  async page(): Promise<RecordsResponse> {
    await (this as PromiseLike<undefined>);
    return this.#shown();
  }

  async then<A = undefined, B = never>(
    resolve?: ((value: undefined) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    try {
      if (this.#ran) {
        if (this.#threw !== undefined) {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- the original, not a copy of it
          throw this.#threw;
        }
      } else {
        this.#ran = true;
        try {
          for (const step of this.#steps) await step();
        } catch (error) {
          this.#threw = error;
          throw error;
        }
      }
      return await Promise.resolve(resolve?.(undefined) as A);
    } catch (error) {
      if (reject === undefined || reject === null) throw error;
      return await Promise.resolve(reject(error));
    }
  }
}
