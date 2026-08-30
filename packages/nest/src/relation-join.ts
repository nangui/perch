/**
 * Joining a row to a parent, and unjoining it.
 *
 * The two verbs a many-to-many has, and the only two: its join table belongs to
 * neither model, so there is no column for a create to fill and nothing for a
 * delete to remove. A row exists on its own and is joined here, or it is not.
 *
 * What makes this a boundary rather than a convenience is the same thing that
 * makes a manager's reads one: the parent is in the address and never in the
 * body, so a request cannot name somebody else's parent and join rows to it.
 * The rows being joined *are* in the body — they have to be, they are the
 * choice — and every one of them is checked to exist before anything is
 * written, so a caller cannot learn which keys are real by watching what fails.
 */
import { NotFoundException } from "@nestjs/common";
import type { DataAdapter, Id } from "@perchjs/core";
import { recordId } from "./record-id.js";
import { reachManager } from "./relation-reach.js";
import type { RegisteredResource } from "./resource-registry.js";

/** As many rows as a reader could plausibly have ticked, and not more. */
const MAX_JOINED = 500;

export interface JoinRequest {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly parentId: string;
  readonly relation: string;
  readonly body: unknown;
  readonly user: unknown;
}

export interface JoinResponse {
  /**
   * How many rows the request named and this accepted.
   *
   * Not how many joins changed: both verbs are idempotent, so attaching what
   * is already attached does nothing and says the same as attaching what is
   * not. Counting real changes would mean asking the database what it found,
   * which `connect` and `disconnect` do not report — and a number that is
   * sometimes a count of work and sometimes a count of requests is worse than
   * one that is honestly always the second.
   */
  readonly named: number;
}

export async function attachChildren(request: JoinRequest): Promise<JoinResponse> {
  return await join(request, "attach");
}

export async function detachChildren(request: JoinRequest): Promise<JoinResponse> {
  return await join(request, "detach");
}

async function join(
  request: JoinRequest,
  verb: "attach" | "detach",
): Promise<JoinResponse> {
  const { data, scope } = await reachManager({ ...request, needs: verb });
  const parentModel = request.resource?.metadata.model;
  if (parentModel === undefined) throw new NotFoundException();

  // Only a joined relation has these verbs. An owned one has a column, and a
  // row is put under a parent by writing it — the boot says as much, so this is
  // a door rather than a case with an answer.
  if (scope.kind !== "joined") throw new NotFoundException();

  const named = readIds(request.body);
  if (named.length === 0) return { named: 0 };

  // Every key turned into one the adapter will accept, and every row read
  // before anything is written. A key that is not a row is refused the same way
  // a forbidden one is: a caller must not be able to map the table by watching
  // which of its guesses succeed.
  //
  // In one query, not one per key. A verb given fifty rows is a verb somebody
  // will give five hundred, and a check written a row at a time turns one
  // request into five hundred round trips to the database.
  const keys: Id[] = [];
  for (const one of named) {
    const key = recordId(data, scope.model, one);
    if (key === null) throw new NotFoundException();
    keys.push(key);
  }

  const primaryKey = data.meta(scope.model).primaryKey.name;
  const found = await data.findMany({
    model: scope.model,
    clauses: [{ path: primaryKey, operator: "in", value: keys }],
    take: keys.length,
  });
  // Counted rather than compared one by one: the query asked for exactly these
  // keys, so anything missing is a key that is not a row.
  const real = new Set(found.rows.map((row) => String(row[primaryKey])));
  if (keys.some((key) => !real.has(String(key)))) throw new NotFoundException();

  const owner = recordId(data, parentModel, request.parentId);
  if (owner === null) throw new NotFoundException();

  // Named by the relation the manager declares, which is the parent's own —
  // the adapter joins from this side, where the relation has a name.
  if (verb === "attach") {
    await data.attach(parentModel, owner, request.relation, keys);
  } else {
    await data.detach(parentModel, owner, request.relation, keys);
  }

  return { named: keys.length };
}

/** The rows a request names, or nothing it could act on. */
function readIds(body: unknown): readonly string[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new NotFoundException();
  }
  const { ids } = body as Record<string, unknown>;
  if (!Array.isArray(ids)) throw new NotFoundException();
  // A cap, for the same reason a search term has one. Nothing a reader ticks
  // reaches this many, so a list that does is a request built by hand — and
  // one `in` clause of a hundred thousand keys is a page of database time
  // somebody else is waiting for.
  if (ids.length > MAX_JOINED) throw new NotFoundException();

  return ids.map((one) => {
    if (typeof one === "string") return one;
    if (typeof one === "number") return String(one);
    throw new NotFoundException();
  });
}
