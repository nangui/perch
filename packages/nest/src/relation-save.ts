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
import type { DataAdapter, Row, SchemaPayload, WriteTree } from "@perchjs/core";
import { dehydrate, resolveSchema, serialise } from "@perchjs/core";
import { admit } from "./admission.js";
import { commitUploads, dropReplaced, undoCommitted } from "./commit-uploads.js";
import { fileUrls } from "./file-urls.js";
import { readState } from "./form-body.js";
import type { SaveResponse } from "./panel-save.controller.js";
import { withOptions } from "./relationship-options.js";
import type { RelationScope } from "./relation-scope.js";
import { childOf, reachManager } from "./relation-reach.js";
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

export async function saveChild(request: ChildWrite): Promise<SaveResponse> {
  const { data, manager, scope, owner } = await reachManager({
    ...request,
    // Adding a child and changing one are separate permissions, and a manager
    // declaring `create` means it. Decided from the address, before the row is
    // read.
    needs: request.childId === undefined ? "create" : "edit",
  });

  // A manager with no form neither creates nor edits. Answered like a route
  // that is not there, because from outside that is what it is.
  const form = manager.state.form;
  if (form === undefined) throw new NotFoundException();

  const found =
    request.childId === undefined
      ? null
      : await childOf(data, scope, owner, request.childId);
  const record = found?.row ?? null;
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

  let saved: Row;
  try {
    saved = await data.transaction(async (tx) =>
      found === null
        ? tx.create(scope.model, owned(write, scope, owner))
        : tx.update(scope.model, found.key, owned(write, scope, owner)),
    );
  } catch (error) {
    await undoCommitted(committed, request.disks);
    throw error;
  }
  await dropReplaced(committed, request.disks);

  // The key alone, for the reason every other write answers with the key
  // alone: the row carries columns nothing on the client reads, and one of
  // them may be what a hook just hashed.
  const primaryKey = data.meta(scope.model).primaryKey.name;
  // Said by the server, because the wording is the server's — and said at all
  // because a create can land on a page the reader is not looking at. Without
  // it, a write that worked and a write that did nothing look the same.
  return {
    record: projectOne(saved, new Set([primaryKey])),
    notification: {
      title: `${manager.state.label ?? manager.state.relation} ${
        found === null ? "added" : "saved"
      }`,
      tone: "success",
    },
  };
}

/**
 * The write, with the column the address decided put back over it.
 *
 * Last, and unconditionally, so nothing between here and the database can
 * reassign a child to another parent — not a form that declared the column, and
 * not a step that rewrote the values on the way through.
 */
function owned(write: WriteTree, scope: RelationScope, owner: unknown): WriteTree {
  return {
    ...write,
    set: { ...write.set, [scope.foreignKey]: owner },
  };
}

/**
 * The form a manager opens, resolved against this reader.
 *
 * Asked for rather than shipped with the tab, for the reason an action's modal
 * is: a schema means nothing until it has been resolved against a principal,
 * and a tab is drawn for every reader who opens one.
 *
 * On an edit it is filled from the row — but only after the row has been
 * checked against the parent, so reading somebody else's child through this is
 * the same refusal writing one is.
 */
export async function childForm(request: {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly parentId: string;
  readonly relation: string;
  readonly childId?: string;
  readonly user: unknown;
  readonly disks: PanelDisks;
}): Promise<SchemaPayload> {
  const { data, manager, scope, owner } = await reachManager({
    ...request,
    needs: request.childId === undefined ? "create" : "edit",
  });

  const form = manager.state.form;
  if (form === undefined) throw new NotFoundException();

  const record =
    request.childId === undefined
      ? null
      : (await childOf(data, scope, owner, request.childId)).row;

  // Resolved, never admitted. Admission is the boundary client state crosses,
  // and it drops what a read-only or invisible field carries — which is right
  // for a browser and wrong for a row the server just read. Put through it, a
  // `.readOnly()` field came back empty and required.
  //
  // `serialise` still narrows the answer to the paths the tree makes visible,
  // so a column the form does not carry never reaches the browser.
  const tree = await resolveSchema(form, record ?? {}, {
    operation: record === null ? "create" : "edit",
    user: request.user,
    ...(record === null ? {} : { record }),
    ...withOptions(data, scope.model),
    ...fileUrls(request.disks),
  });

  return serialise(tree);
}
