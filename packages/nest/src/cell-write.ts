/**
 * A write from a table.
 *
 * The thing this must not be is a second way into the row that skips the
 * policies. So it is not one. An inline edit is a form save of a single field —
 * the same schema, the same trust boundary, the same validation — and what
 * makes it small is that only one path is offered to it, not that less is asked
 * of it.
 *
 * What it does add is an allowlist of its own, one level above the form's: the
 * path must belong to a column the table declared writable. A form field is a
 * field on a page somebody opened; a cell is a control in a list of a hundred
 * rows, and offering one is a decision made column by column.
 */
import { NotFoundException } from "@nestjs/common";
import type { DataAdapter, NotificationState, Table } from "@perchjs/core";
import { dehydrate, WritableColumn } from "@perchjs/core";
import { updateRecord } from "./handle-record.js";
import { admit } from "./admission.js";
import { authorize } from "./authorization.js";
import { fileUrls } from "./file-urls.js";
import { recordId } from "./record-id.js";
import type { RegisteredResource } from "./resource-registry.js";
import type { PanelDisks } from "./storage.token.js";
import { withOptions } from "./relationship-options.js";

export interface CellWriteResponse {
  /** What the cell holds now, which after a refusal is what it held before. */
  readonly value: unknown;
  /** Only when something was refused: a table has nowhere to put an error. */
  readonly notification?: NotificationState;
}

export interface CellWrite {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly table: Table | undefined;
  readonly id: string;
  readonly path: unknown;
  readonly value: unknown;
  readonly user: unknown;
  readonly disks: PanelDisks;
  /** Reads the form the resource declares, which is where the rules live. */
  readonly formFor: (
    resource: RegisteredResource,
  ) => Parameters<typeof admit>[0]["schema"];
}

export async function writeCell(request: CellWrite): Promise<CellWriteResponse> {
  const { data, resource, table, user } = request;
  if (data === null || resource === undefined) throw new NotFoundException();

  // The column first, because it decides whether this path is a thing a table
  // may write at all — before a record is read, and before a policy is asked
  // about a row nobody may edit through here anyway.
  const column = writable(table, request.path);
  if (column === undefined) throw new NotFoundException();
  // A shape no control of this kind produces. Refused here rather than handed
  // to a form that would refuse it in silence, because silence is for a state
  // a page could have sent.
  if (!column.admits(request.value)) throw new NotFoundException();

  const model = resource.metadata.model;
  const key = recordId(data, model, request.id);
  if (key === null) throw new NotFoundException();
  const record = await data.findOne(model, key);
  if (record === null) throw new NotFoundException();

  if ((await authorize(resource.instance.can, "edit", user, record)) !== "allowed") {
    throw new NotFoundException();
  }

  const path = column.state.path;
  const schema = request.formFor(resource);
  const { accepted, tree } = await admit({
    schema,
    state: { [path]: request.value },
    operation: "edit",
    user,
    record,
    ...withOptions(data, model),
    ...fileUrls(request.disks),
  });

  // Stage 5 said no: an invisible field, a disabled one on this row, a value
  // the field would not hold. The cell goes back to what it showed — and it
  // says so, which is the one place this differs from the boundary's usual
  // silence. Silence is for a path a client typed; this control was drawn by
  // the server, and a switch that flips back for ever with nothing said is a
  // panel that looks broken to the one person who trusted it.
  if (!(path in accepted)) {
    return {
      value: record[path],
      notification: { title: "That cannot be changed here", tone: "warning" },
    };
  }

  const failed = tree.errors[path];
  if (failed !== undefined) {
    return {
      value: record[path],
      notification: { title: failed, tone: "danger" },
    };
  }

  // One key, and not because it was trimmed to one: the boundary accepted a
  // single path, so the tree carries a value for that field and for no other,
  // and a field with no value is not written. The machinery that would have
  // built the whole form builds this.
  const written = dehydrate(tree, { operation: "edit", user, record });
  // A field whose write is not a plain value of its own — a relation, a nested
  // tree — is not something a cell writes.
  if (!(path in written.set)) return { value: record[path] };

  const mutate = resource.instance.mutateFormDataBeforeSave?.bind(resource.instance);
  const set = (await mutate?.({ ...written.set })) ?? written.set;

  // The same write every other save goes through, so an application that
  // replaces persistence is not bypassed by a cell.
  const updated = await updateRecord(resource, data, key, record, { set });
  return { value: updated[path] };
}

/** The column at this path, if the table declared one a reader may write. */
function writable(table: Table | undefined, path: unknown): WritableColumn | undefined {
  if (typeof path !== "string") return undefined;
  return (table?.state.columns ?? []).find(
    (column): column is WritableColumn =>
      column instanceof WritableColumn && column.state.path === path,
  );
}
