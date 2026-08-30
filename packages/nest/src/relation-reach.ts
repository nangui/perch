/**
 * Getting to a relation manager, and to the value that narrows it.
 *
 * One sequence, because it is the authorization boundary rather than a query
 * builder: the parent is loaded and the reader authorised against it before the
 * relation is looked at, so a request naming a parent they may not see is
 * refused without learning that the relation exists. Listing, writing and
 * acting all go through here, and what differs between them is one argument.
 *
 * Copied three times it would drift, and the copy that drifted would be the one
 * that stopped narrowing.
 */
import { NotFoundException } from "@nestjs/common";
import type { DataAdapter, Id, Row } from "@perchjs/core";
import type { Permission } from "./authorization.js";
import { authorize } from "./authorization.js";
import { recordId } from "./record-id.js";
import type { RelationManager } from "./relation-manager.js";
import type { RelationScope } from "./relation-scope.js";
import { relationScope } from "./relation-scope.js";
import type { RegisteredResource } from "./resource-registry.js";

export interface ManagerReach {
  readonly data: DataAdapter;
  readonly parent: Row;
  readonly manager: RelationManager;
  readonly scope: RelationScope;
  /**
   * What the parent holds in the column the children point at.
   *
   * Read once, here, because every caller uses it for something that fails open
   * if it is missing: a clause comparing to nothing, a create writing nothing
   * into the owning column, a selection matching every row that also has
   * nothing there.
   */
  readonly owner: unknown;
}

export async function reachManager(request: {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly parentId: string;
  readonly relation: string;
  readonly user: unknown;
  /**
   * What the manager's own policy is asked.
   *
   * A function where the answer depends on what is being done — an action asks
   * about what that action is — and answering `undefined` refuses like a route
   * that is not there.
   */
  readonly needs: Permission | ((manager: RelationManager) => Permission | undefined);
}): Promise<ManagerReach> {
  const { data, resource, parentId, relation, user } = request;
  if (resource === undefined || data === null) throw new NotFoundException();

  const model = resource.metadata.model;
  const key = recordId(data, model, parentId);
  if (key === null) throw new NotFoundException();

  // The parent first, and the policy about it before anything else is read.
  // Seeing the parent is what reaching a manager costs; what may then be done
  // there is the manager's own policy to say.
  const parent = await data.findOne(model, key);
  if (parent === null) throw new NotFoundException();
  if ((await authorize(resource.instance.can, "view", user, parent)) !== "allowed") {
    throw new NotFoundException();
  }

  const manager = (resource.instance.relations?.() ?? []).find(
    (one) => one.state.relation === relation,
  );
  if (manager === undefined) throw new NotFoundException();

  // Its own, never the child resource's. The same model is managed differently
  // under different parents, so a policy written for the child's own page would
  // take effect somewhere its author never looked.
  const needs =
    typeof request.needs === "function" ? request.needs(manager) : request.needs;
  if (needs === undefined) throw new NotFoundException();
  if ((await authorize(manager.state.can, needs, user, parent)) !== "allowed") {
    throw new NotFoundException();
  }

  const scope = relationScope(data.ir(), model, relation);
  const owner = parent[scope.parentKey];
  // A parent with nothing in that column narrows nothing. Refused rather than
  // carried forward, because every use of it downstream fails open.
  if (owner === undefined || owner === null) throw new NotFoundException();

  return { data, parent, manager, scope, owner };
}

/**
 * The child a key names, but only if it is one of this parent's.
 *
 * The check that makes a key safe to accept: without it, reading or editing
 * somebody else's child is a matter of typing their id into the address. Here
 * rather than in one caller, because reading a form, taking its round trips and
 * writing it are three doors onto the same row.
 */
export async function childOf(
  data: DataAdapter,
  scope: RelationScope,
  owner: unknown,
  childId: string,
): Promise<{ readonly row: Row; readonly key: Id }> {
  const key = recordId(data, scope.model, childId);
  if (key === null) throw new NotFoundException();

  const row = await data.findOne(scope.model, key);
  if (row === null) throw new NotFoundException();
  // Reaching one child is what an edit or a row action does, and the boot
  // refuses both on a manager over a join — there is no column to narrow a
  // selection by. So this is a door rather than a case with an answer, and it
  // stays one until attaching and detaching give it something to guard.
  if (scope.kind !== "owned") throw new NotFoundException();
  if (row[scope.foreignKey] !== owner) throw new NotFoundException();
  // The key travels with the row, so a write reaches for a value that has been
  // through `recordId` rather than casting whatever the column held.
  return { row, key };
}
