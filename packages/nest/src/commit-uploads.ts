/**
 * Moving staged files into place, in the order a failure is survivable in.
 *
 * A file goes up when it is chosen and lands in a staging prefix. The save is
 * what makes it permanent, and the row is written *after* — so a failure leaves
 * a file nobody points at rather than a row pointing at nothing. The first is
 * invisible and findable; the second is a broken thumbnail a reader meets with
 * no way to tell whether the file was lost or never sent.
 *
 * There is no transaction across the two, and this file does not pretend there
 * is. What it does is make the ordinary failures leave nothing behind: a write
 * that throws takes its committed files with it, and a replaced attachment is
 * removed once the new one is safely a row.
 *
 * It walks the whole write, not the columns. A `FileUpload` in a repeater row
 * is written through the relation, and reading only the columns left its key in
 * the staging prefix — where the sweep deletes it, some hours after the row
 * that points at it was saved. A row can also be deleted, which a column
 * cannot, and its attachment goes with it.
 */
import type { Component, Id, RelationWrite, Row, WriteTree } from "@perchjs/core";
import { DEFAULT_ROW_KEY, Field, FileUpload, Repeater } from "@perchjs/core";
import type { PanelDisks } from "./storage.token.js";

export interface Committed {
  /** Final keys written this save, to undo if the row never lands. */
  readonly fresh: readonly { disk: string; key: string }[];
  /** Old keys the save let go of, to drop once the row has landed. */
  readonly replaced: readonly { disk: string; key: string }[];
}

interface Moves {
  readonly fresh: { disk: string; key: string }[];
  readonly replaced: { disk: string; key: string }[];
}

const NOTHING: Committed = { fresh: [], replaced: [] };

/**
 * Moves what this save is keeping, and rewrites the write to its final keys.
 *
 * Returns a new write rather than mutating the one it was given: a save that is
 * refused further along should not have quietly changed what it was handed.
 */
export async function commitUploads(
  form: Component,
  write: WriteTree,
  record: Row | null,
  disks: PanelDisks,
): Promise<{ write: WriteTree; committed: Committed }> {
  if (!everything(form).some((node) => node instanceof FileUpload)) {
    return { write, committed: NOTHING };
  }

  const moves: Moves = { fresh: [], replaced: [] };
  const out = await level(form, write, record ?? undefined, disks, moves);
  return { write: out, committed: moves };
}

/** One row's worth: its own columns, then the relations its repeaters write. */
async function level(
  schema: Component,
  write: WriteTree,
  record: Row | undefined,
  disks: PanelDisks,
  moves: Moves,
): Promise<WriteTree> {
  const set: Record<string, unknown> = { ...write.set };

  for (const upload of uploadsOf(schema)) {
    const path = upload.name;
    if (!(path in set)) continue;

    const disk = disks[upload.state.disk];
    if (disk === undefined) continue;

    const chosen = set[path];
    const before = record?.[path];
    const held = typeof before === "string" && before !== "" ? before : undefined;

    // Unchanged means nothing to move: the value is already a final key from a
    // save that happened before this one.
    if (typeof chosen !== "string" || chosen === "" || chosen === before) {
      if (held !== undefined && chosen !== before) {
        moves.replaced.push({ disk: upload.state.disk, key: held });
      }
      continue;
    }

    const key = await disk.commit(chosen, upload.state.directory);
    set[path] = key;
    moves.fresh.push({ disk: upload.state.disk, key });
    if (held !== undefined) moves.replaced.push({ disk: upload.state.disk, key: held });
  }

  const relations: Record<string, RelationWrite> = { ...write.relations };
  for (const repeater of repeatersOf(schema)) {
    const name = repeater.state.relationship ?? repeater.name;
    const relation = relations[name];
    if (relation === undefined) continue;
    relations[name] = await rows(
      repeater,
      relation,
      loaded(record, repeater),
      disks,
      moves,
    );
  }

  return {
    ...write,
    set,
    ...(write.relations === undefined ? {} : { relations }),
  };
}

/** Every row this write creates, edits or drops, each judged against its own. */
async function rows(
  repeater: Repeater,
  relation: RelationWrite,
  held: ReadonlyMap<string, Row>,
  disks: PanelDisks,
  moves: Moves,
): Promise<RelationWrite> {
  const created: WriteTree[] = [];
  for (const row of relation.create ?? []) {
    created.push(await level(repeater, row, undefined, disks, moves));
  }

  const updated: { id: Id; data: WriteTree }[] = [];
  for (const { id, data } of relation.update ?? []) {
    const was = held.get(String(id));
    updated.push({ id, data: await level(repeater, data, was, disks, moves) });
  }

  for (const id of relation.delete ?? []) {
    const row = held.get(String(id));
    if (row !== undefined) drop(repeater, row, moves);
  }

  return {
    ...relation,
    ...(relation.create === undefined ? {} : { create: created }),
    ...(relation.update === undefined ? {} : { update: updated }),
  };
}

/**
 * Everything a row that is going away was pointing at.
 *
 * As deep as the record was loaded, and no deeper: a grandchild the panel never
 * read is a row this cannot name, and guessing its key would delete a file on a
 * hunch. Those are the sweep's, which is what the sweep is for.
 */
function drop(schema: Component, row: Row, moves: Moves): void {
  for (const upload of uploadsOf(schema)) {
    const key = row[upload.name];
    if (typeof key === "string" && key !== "") {
      moves.replaced.push({ disk: upload.state.disk, key });
    }
  }
  for (const repeater of repeatersOf(schema)) {
    const nested = row[repeater.state.relationship ?? repeater.name];
    if (!Array.isArray(nested)) continue;
    for (const child of nested) {
      if (typeof child === "object" && child !== null)
        drop(repeater, child as Row, moves);
    }
  }
}

/** The rows a record carried, by the key an update addresses them with. */
function loaded(record: Row | undefined, repeater: Repeater): ReadonlyMap<string, Row> {
  const held = record?.[repeater.state.relationship ?? repeater.name];
  if (!Array.isArray(held)) return new Map();

  const key = repeater.state.rowKey ?? DEFAULT_ROW_KEY;
  const out = new Map<string, Row>();
  for (const row of held) {
    if (typeof row !== "object" || row === null) continue;
    const id = (row as Row)[key];
    if (typeof id === "string" || typeof id === "number")
      out.set(String(id), row as Row);
  }
  return out;
}

/** After the row landed: the attachments it no longer points at. */
export async function dropReplaced(
  committed: Committed,
  disks: PanelDisks,
): Promise<void> {
  await remove(committed.replaced, disks);
}

/**
 * After the row did not land: the files this save had already moved.
 *
 * Best effort by construction — if this throws too, the original failure is the
 * one worth reporting, and what is left is a staged file the sweep collects.
 */
export async function undoCommitted(
  committed: Committed,
  disks: PanelDisks,
): Promise<void> {
  try {
    await remove(committed.fresh, disks);
  } catch {
    // Swallowed on purpose: see above.
  }
}

async function remove(
  entries: readonly { disk: string; key: string }[],
  disks: PanelDisks,
): Promise<void> {
  const byDisk = new Map<string, string[]>();
  for (const { disk, key } of entries) {
    byDisk.set(disk, [...(byDisk.get(disk) ?? []), key]);
  }
  await Promise.all(
    [...byDisk].map(async ([name, keys]) => {
      await disks[name]?.remove(keys);
    }),
  );
}

/**
 * The components at one level. A layout is transparent — its fields belong to
 * whatever it sits in — and a repeater is where this level stops: its children
 * are addressed inside its own rows, not here.
 */
function atLevel(component: Component): readonly Component[] {
  return component.children.flatMap((child) =>
    child instanceof Repeater ? [child] : [child, ...atLevel(child)],
  );
}

function uploadsOf(component: Component): readonly FileUpload[] {
  return atLevel(component).filter(
    (node): node is FileUpload => node instanceof FileUpload,
  );
}

function repeatersOf(component: Component): readonly Repeater[] {
  return atLevel(component).filter(
    (node): node is Repeater => node instanceof Repeater,
  );
}

/** Every field anywhere, for the one question that does not care about levels. */
function everything(component: Component): readonly Component[] {
  return [
    ...(component instanceof Field ? [component] : []),
    ...component.children.flatMap(everything),
  ];
}
