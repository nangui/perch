/**
 * A parent's children, listed.
 *
 * The scope is the server's: a body or a query string naming a different parent
 * would be a page of somebody else's rows, and nothing about the children
 * themselves would look wrong.
 */
import { NotFoundException } from "@nestjs/common";
import type { DataAdapter, Ir } from "@perchjs/core";
import { authorize } from "./authorization.js";
import type { RawQuery } from "./records-query.js";
import type { RelationManager } from "./relation-manager.js";
import { relationScope } from "./relation-scope.js";
import type { RecordsResponse } from "./records.js";
import { listOf } from "./records.js";
import { reachManager } from "./relation-reach.js";
import type { RegisteredResource } from "./resource-registry.js";
import type { PanelDisks } from "./storage.token.js";

export async function listChildren(options: {
  readonly data: DataAdapter | null;
  readonly resource: RegisteredResource | undefined;
  readonly parentId: string;
  readonly relation: string;
  readonly raw: RawQuery;
  readonly user: unknown;
  /**
   * What a column of uploads here resolves its keys through — the same disks
   * the resource's own table is listed with. Without them a manager's image
   * column draws an empty cell in every row, and the boot check that reads
   * these tables would have said the disk was fine.
   */
  readonly disks?: PanelDisks;
  /**
   * Which side of a join to list: what this parent holds, or what it could.
   *
   * Only a joined relation has two sides to ask about. `apart` is what a picker
   * offers, and it is asked of the database rather than worked out by reading
   * everything and subtracting — a table of fifty thousand rows fetched to show
   * twenty-five is the same mistake as filtering options in a browser.
   *
   * It is also a different permission. Seeing what is already joined comes with
   * seeing the parent; seeing what could be joined is only any use to somebody
   * who may join it, so it is `attach` that is asked.
   */
  readonly holding?: "joined" | "apart";
}): Promise<RecordsResponse> {
  const apart = options.holding === "apart";
  const { data, manager, parent, scope, owner } = await reachManager({
    ...options,
    needs: apart ? "attach" : "view",
  });

  // A relation with a column of its own has one side: its rows are its
  // parent's, and what is not there is every row in the table. Refused rather
  // than answered, because the answer would be a list nothing could be done
  // with — attaching is not a verb such a manager has.
  if (apart && scope.kind !== "joined") throw new NotFoundException();

  return await listOf({
    data,
    ...(options.disks === undefined ? {} : { disks: options.disks }),
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
    // A join has no such column, so it narrows by the relation back instead.
    ...(scope.kind === "owned"
      ? { scope: { path: scope.foreignKey, operator: "equals", value: owner } }
      : {
          joinedTo: {
            relation: scope.back,
            key: scope.parentKey,
            value: owner as string | number,
            holding: apart ? ("apart" as const) : ("joined" as const),
          },
        }),
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
  shape?: { readonly ir: Ir; readonly model: string },
): readonly ManagedRelation[] {
  return managers.map((manager) => ({
    relation: manager.state.relation,
    label: manager.state.label ?? manager.state.relation,
    // A manager with no form neither creates nor edits, so the tab offers
    // neither. Said here rather than discovered by a route answering 404.
    ...(manager.state.form === undefined ? {} : { writable: true as const }),
    // And one over a join has different verbs rather than fewer: its rows are
    // attached and detached. The tab draws those instead of an edit, so it has
    // to be told which kind of relation it is looking at.
    ...(joins(shape, manager.state.relation) ? { joined: true as const } : {}),
  }));
}

/** Whether the relation is one no column narrows, or nothing that can be known. */
function joins(
  shape: { readonly ir: Ir; readonly model: string } | undefined,
  relation: string,
): boolean {
  if (shape === undefined) return false;
  try {
    return relationScope(shape.ir, shape.model, relation).kind === "joined";
  } catch {
    // A scope that cannot be worked out stops the boot, so reaching this means
    // there is no adapter to ask. A tab that lists is the safe answer.
    return false;
  }
}

export interface ManagedRelation {
  readonly relation: string;
  readonly label: string;
  /** Whether it declares a form. Absent means the tab only lists and acts. */
  readonly writable?: true;
  /**
   * Whether its rows are joined rather than owned.
   *
   * They are attached and detached, never created and deleted — so the tab
   * offers those instead, and offers no edit at all: there is no column on such
   * a row that belongs to this parent to change.
   */
  readonly joined?: true;
}
