/**
 * How many times the panel went to the data source.
 *
 * The N+1 guardrail the documentation asks for, and the only one of these
 * helpers that does not go through a route: a query count is not a thing a
 * browser can see, so it is taken where the queries are made.
 *
 * The adapter is wrapped in place rather than replaced in the container. The
 * panel is handed its adapter by class, so there is no second token to inject
 * the original through — and the instance this touches was built by this test
 * application and lives exactly as long as it does. Nothing in the shipped
 * framework knows any of this happened.
 *
 * `ir` and `meta` are not counted. They are metadata, read from what the
 * generator wrote at build time, and counting them would put a number in front
 * of a reader that has nothing to do with the database.
 */
import type { DataAdapter } from "@perchjs/core";

/** Everything on the port that reaches the data source. */
const QUERIES = [
  "findMany",
  "findOne",
  "create",
  "update",
  "delete",
  "forceDelete",
  "restore",
  "attach",
  "detach",
] as const;

export interface Counter {
  /** How many have been made since the last reset. */
  readonly count: () => number;
  readonly reset: () => void;
}

export function countQueries(adapter: DataAdapter | null): Counter {
  let made = 0;
  if (adapter === null) {
    // A panel with no adapter makes no queries, and saying zero is true.
    return { count: () => made, reset: () => (made = 0) };
  }

  const held = adapter as unknown as Record<string, unknown>;
  for (const name of QUERIES) {
    const original = held[name];
    if (typeof original !== "function") continue;
    const call = original as (...args: unknown[]) => unknown;
    held[name] = function counted(this: unknown, ...args: unknown[]): unknown {
      made += 1;
      return call.apply(this, args);
    };
  }

  return {
    count: () => made,
    reset: () => {
      made = 0;
    },
  };
}
