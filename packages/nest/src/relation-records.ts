/**
 * A parent's children, listed.
 *
 * The scope is the server's: a body or a query string naming a different parent
 * would be a page of somebody else's rows, and nothing about the children
 * themselves would look wrong.
 */
import type { DataAdapter } from "@perchjs/core";
import { authorize } from "./authorization.js";
import type { RawQuery } from "./records-query.js";
import type { RelationManager } from "./relation-manager.js";
import type { RecordsResponse } from "./records.js";
import { listOf } from "./records.js";
import { reachManager } from "./relation-reach.js";
import type { RegisteredResource } from "./resource-registry.js";

export async function listChildren(options: {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly parentId: string;
  readonly relation: string;
  readonly raw: RawQuery;
  readonly user: unknown;
}): Promise<RecordsResponse> {
  const { data, manager, parent, scope, owner } = await reachManager({
    ...options,
    needs: "view",
  });

  return await listOf({
    data,
    model: scope.model,
    table: manager.state.table,
    raw: options.raw,
    // The manager's own policy, never the child resource's — the same rule
    // every other permission here follows.
    mayReadDeleted:
      (await authorize(manager.state.can, "viewDeleted", options.user, parent)) ===
      "allowed",
    // Read off the parent rather than off the address: the column a relation
    // points at is not always the primary key, and the row is already in hand.
    scope: { path: scope.foreignKey, operator: "equals", value: owner },
  });
}

/**
 * What the parent's page draws a tab for, and nothing about their contents.
 *
 * Names and labels only: the rows behind a tab are fetched when it is opened,
 * so a record with six managers costs one page rather than seven.
 */
export function managedRelations(
  managers: readonly RelationManager[],
): readonly ManagedRelation[] {
  return managers.map((manager) => ({
    relation: manager.state.relation,
    label: manager.state.label ?? manager.state.relation,
    // A manager with no form neither creates nor edits, so the tab offers
    // neither. Said here rather than discovered by a route answering 404.
    ...(manager.state.form === undefined ? {} : { writable: true as const }),
  }));
}

export interface ManagedRelation {
  readonly relation: string;
  readonly label: string;
  /** Whether it declares a form. Absent means the tab only lists and acts. */
  readonly writable?: true;
}
