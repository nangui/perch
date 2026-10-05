/**
 * One PostgreSQL schema per suite that writes to the integration database.
 *
 * Three suites share one database and vitest runs files in parallel, so they
 * were interleaving: a suite that counts rows, or pages through them one at a
 * time, reads a table another is writing into. Measured at three failures in
 * six runs of the three together, in three different places — a paging check
 * that found a row missing, a transaction rollback whose count had moved, and
 * a contract complaint about a total.
 *
 * Isolated by schema rather than by serialising the whole suite, which was
 * measured at three times the wall clock for everything: 48 seconds against
 * 144. Prisma qualifies every table with a schema name, so this is the lever
 * the adapter offers rather than a search path, which it ignores.
 *
 * Named here and nowhere else. The push that creates them reads this file, and
 * so does each suite, because a name written twice is a name that drifts into
 * a suite whose tables do not exist.
 */
export const SCHEMAS = {
  /** `database.test.ts`: the adapter's translations against a real database. */
  queries: "it_queries",
  /** `data-contract.test.ts`: the port's contract against the shipped adapter. */
  contract: "it_contract",
  /** `panel-database.test.ts`: the panel's routes over a real database. */
  panel: "it_panel",
} as const;

/** The connection URL a suite or a push uses for one of them. */
export function urlFor(schema: string, url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}schema=${schema}`;
}
