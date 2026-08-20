/**
 * Writing one of a parent's children.
 *
 * One operation at a time, which is what separates this from a repeater: a
 * repeater writes every row with the parent in one transaction, and this writes
 * one child on its own.
 *
 * Two things the request never carries. Which parent the child belongs to — the
 * server fills that column from the address — and, on an edit, whether the
 * child it names is one of this parent's at all: a key is a number anybody can
 * type, so the row is read and checked rather than trusted.
 */
import { NotFoundException } from "@nestjs/common";
import type { DataAdapter, Row, Schema, WriteTree } from "@perchjs/core";
import { dehydrate, serialise } from "@perchjs/core";
import { admit } from "./admission.js";
import { authorize } from "./authorization.js";
import { commitUploads, dropReplaced, undoCommitted } from "./commit-uploads.js";
import { fileUrls } from "./file-urls.js";
import { readState } from "./form-body.js";
import type { SaveResponse } from "./panel-save.controller.js";
import { recordId } from "./record-id.js";
import { withOptions } from "./relationship-options.js";
import type { RelationScope } from "./relation-scope.js";
import { relationScope } from "./relation-scope.js";
import type { RegisteredResource } from "./resource-registry.js";
import { projectOne } from "./row-projection.js";
import type { PanelDisks } from "./storage.token.js";

export interface ChildWrite {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly parentId: string;
  readonly relation: string;
  /** Absent creates; present edits, and only if the child is this parent's. */
  readonly childId?: string;
  readonly body: unknown;
  readonly user: unknown;
  readonly disks: PanelDisks;
}

/** The parent, the form and the column, or a refusal that says nothing. */
async function reached(request: ChildWrite): Promise<{
  readonly data: DataAdapter;
  readonly parent: Row;
  readonly scope: RelationScope;
  readonly form: Schema;
}> {
  const { data, resource, parentId, relation, user } = request;
  if (resource === undefined || data === null) throw new NotFoundException();

  const model = resource.metadata.model;
  const key = recordId(data, model, parentId);
  if (key === null) throw new NotFoundException();

  // The parent, and the policy about it, before the relation is looked at.
  const parent = await data.findOne(model, key);
  if (parent === null) throw new NotFoundException();
  // Changing what hangs off a record is changing the record, so `edit` is what
  // is asked here where reading the list asked `view`.
  if ((await authorize(resource.instance.can, "edit", user, parent)) !== "allowed") {
    throw new NotFoundException();
  }

  const manager = (resource.instance.relations?.() ?? []).find(
    (one) => one.state.relation === relation,
  );
  if (manager === undefined) throw new NotFoundException();

  // The manager's own policy, never the child resource's. The same model is
  // managed differently under different parents.
  if ((await authorize(manager.state.can, "edit", user, parent)) !== "allowed") {
    throw new NotFoundException();
  }

  // A manager with no form neither creates nor edits. Answered like a route
  // that is not there, because from outside that is what it is.
  const form = manager.state.form;
  if (form === undefined) throw new NotFoundException();

  return { data, parent, scope: relationScope(data.ir(), model, relation), form };
}

/** The child a key names, but only if it is one of this parent's. */
async function childOf(
  data: DataAdapter,
  scope: RelationScope,
  parent: Row,
  childId: string,
): Promise<Row> {
  const key = recordId(data, scope.model, childId);
  if (key === null) throw new NotFoundException();

  const row = await data.findOne(scope.model, key);
  if (row === null) throw new NotFoundException();
  // The check that makes a key safe to accept. Without it, editing somebody
  // else's child is a matter of typing their id into the address.
  if (row[scope.foreignKey] !== parent[scope.parentKey]) throw new NotFoundException();
  return row;
}

export async function saveChild(request: ChildWrite): Promise<SaveResponse> {
  const { data, parent, form, scope } = await reached(request);
  const record =
    request.childId === undefined
      ? null
      : await childOf(data, scope, parent, request.childId);
  const operation = record === null ? "create" : "edit";

  const { tree } = await admit({
    schema: form,
    state: readState(request.body),
    operation,
    user: request.user,
    record,
    // Both read against the child's model, which is whose columns this form
    // declares. The parent's would offer a dropdown of the wrong table.
    ...withOptions(data, scope.model),
    ...fileUrls(request.disks),
  });

  // Before the write, not after: a form with errors touches nothing.
  if (Object.keys(tree.errors).length > 0) {
    return { errors: tree.errors, payload: serialise(tree) };
  }

  const written = dehydrate(tree, {
    operation,
    user: request.user,
    ...(record === null ? {} : { record }),
  });
  // Files first, the row last: a failure between them leaves a file nobody
  // points at rather than a row pointing at nothing.
  const { write, committed } = await commitUploads(
    form,
    written,
    record,
    request.disks,
  );

  const primaryKey = data.meta(scope.model).primaryKey.name;
  let saved: Row;
  try {
    saved = await data.transaction(async (tx) =>
      record === null
        ? tx.create(scope.model, owned(write, scope, parent))
        : tx.update(
            scope.model,
            record[primaryKey] as never,
            owned(write, scope, parent),
          ),
    );
  } catch (error) {
    await undoCommitted(committed, request.disks);
    throw error;
  }
  await dropReplaced(committed, request.disks);

  // The key alone, for the reason every other write answers with the key
  // alone: the row carries columns nothing on the client reads, and one of
  // them may be what a hook just hashed.
  return { record: projectOne(saved, new Set([primaryKey])) };
}

/**
 * The write, with the column the address decided put back over it.
 *
 * Last, and unconditionally, so nothing between here and the database can
 * reassign a child to another parent — not a form that declared the column, and
 * not a step that rewrote the values on the way through.
 */
function owned(write: WriteTree, scope: RelationScope, parent: Row): WriteTree {
  return {
    ...write,
    set: { ...write.set, [scope.foreignKey]: parent[scope.parentKey] },
  };
}
