/**
 * A parent's children, listed.
 *
 * The order here is the security: the parent is loaded and the reader is
 * authorised against it *before* the relation is looked at, so a request naming
 * a parent they may not see is refused without telling them the relation exists.
 *
 * Then the scope, which the server derives and the request never carries. A
 * body or a query string naming a different parent would be a page of somebody
 * else's rows, and nothing about the children themselves would look wrong.
 */
import { NotFoundException } from "@nestjs/common";
import type { DataAdapter } from "@perchjs/core";
import { authorize } from "./authorization.js";
import type { RawQuery } from "./records-query.js";
import { recordId } from "./record-id.js";
import type { RecordsResponse } from "./records.js";
import { listOf } from "./records.js";
import { relationScope } from "./relation-scope.js";
import type { RegisteredResource } from "./resource-registry.js";

export async function listChildren(options: {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly parentId: string;
  readonly relation: string;
  readonly raw: RawQuery;
  readonly user: unknown;
}): Promise<RecordsResponse> {
  const { data, resource, parentId, relation, raw, user } = options;
  if (resource === undefined || data === null) throw new NotFoundException();

  const model = resource.metadata.model;
  const key = recordId(data, model, parentId);
  if (key === null) throw new NotFoundException();

  // The parent first, and the policy about it before anything else is read: a
  // reader who may not see the record may not learn what hangs off it.
  const parent = await data.findOne(model, key);
  if (parent === null) throw new NotFoundException();
  if ((await authorize(resource.instance.can, "view", user, parent)) !== "allowed") {
    throw new NotFoundException();
  }

  const manager = (resource.instance.relations?.() ?? []).find(
    (one) => one.state.relation === relation,
  );
  if (manager === undefined) throw new NotFoundException();

  // The manager's own policy, never the child resource's. The same model is
  // managed differently under different parents.
  if ((await authorize(manager.state.can, "view", user, parent)) !== "allowed") {
    throw new NotFoundException();
  }

  const scope = relationScope(data.ir(), model, relation);
  return await listOf({
    data,
    model: scope.model,
    table: manager.state.table,
    raw,
    // Read off the parent rather than off the address: the column a relation
    // points at is not always the primary key, and the row is already in hand.
    scope: {
      path: scope.foreignKey,
      operator: "equals",
      value: parent[scope.parentKey],
    },
  });
}
