/**
 * Moving staged files into place, in the order ADR 0016 decided.
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
 */
import type { Component, FormState, Row } from "@perchjs/core";
import { Field, FileUpload } from "@perchjs/core";
import type { PanelDisks } from "./storage.token.js";

export interface Committed {
  /** Final keys written this save, to undo if the row never lands. */
  readonly fresh: readonly { disk: string; key: string }[];
  /** Old keys the save replaced, to drop once the row has landed. */
  readonly replaced: readonly { disk: string; key: string }[];
}

const NOTHING: Committed = { fresh: [], replaced: [] };

/**
 * Moves what this save is keeping, and rewrites the values to their final keys.
 *
 * Returns the values to write rather than mutating them: a save that is refused
 * further along should not have quietly changed what it was given.
 */
export async function commitUploads(
  form: Component,
  values: FormState,
  record: Row | null,
  disks: PanelDisks,
): Promise<{ values: FormState; committed: Committed }> {
  const uploads = flatten(form).filter(
    (component): component is FileUpload => component instanceof FileUpload,
  );
  if (uploads.length === 0) return { values, committed: NOTHING };

  const out: Record<string, unknown> = { ...values };
  const fresh: { disk: string; key: string }[] = [];
  const replaced: { disk: string; key: string }[] = [];

  for (const upload of uploads) {
    const path = upload.name;
    if (!(path in out)) continue;

    const chosen = out[path];
    const before = record?.[path];
    const disk = disks[upload.state.disk];
    if (disk === undefined) continue;

    // Unchanged means nothing to move: the value is already a final key from a
    // save that happened before this one.
    if (typeof chosen !== "string" || chosen === "" || chosen === before) {
      if (typeof before === "string" && before !== "" && chosen !== before) {
        replaced.push({ disk: upload.state.disk, key: before });
      }
      continue;
    }

    const key = await disk.commit(chosen, upload.state.directory);
    out[path] = key;
    fresh.push({ disk: upload.state.disk, key });
    if (typeof before === "string" && before !== "") {
      replaced.push({ disk: upload.state.disk, key: before });
    }
  }

  return { values: out, committed: { fresh, replaced } };
}

/** After the row landed: the attachment it no longer points at. */
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
 * one worth reporting, and what is left is the residue ADR 0016 names.
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

function flatten(component: Component): readonly Component[] {
  return [
    ...(component instanceof Field ? [component] : []),
    ...component.children.flatMap(flatten),
  ];
}
