/**
 * A record's children, under the form that edits it.
 *
 * One tab per manager, and a tab's rows are fetched when it is opened rather
 * than shipped with the page: a record with six managers costs one page, not
 * seven. What comes back is a page of records like any other, so the table
 * inside a tab is the same one the list page draws — sorting, filtering,
 * paging and actions included.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ActionNode, FormState, Row, SchemaPayload } from "@perchjs/core";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { PanelForm } from "./PanelForm.js";
import type { ActionAnswer, PageRequest, RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";
import type { SaveResponse, StateRequest, StateResponse } from "./transport.js";
import { TabStrip } from "./Tabs.js";

export interface ManagedRelation {
  readonly relation: string;
  readonly label: string;
  /** Whether it declares a form. Without one the tab lists and acts only. */
  readonly writable?: true;
}

/** Which child a form is about: a new one, or the row a key names. */
type Editing = { readonly relation: string; readonly childId?: string };

export interface PanelRelationsProps {
  readonly relations: readonly ManagedRelation[];
  readonly fetchPage: (relation: string, request: PageRequest) => Promise<RecordsPage>;
  readonly runAction: (
    relation: string,
    name: string,
    ids: readonly (string | number)[],
    data?: FormState,
    idempotencyKey?: string,
  ) => Promise<ActionAnswer>;
  readonly actionForm: (
    relation: string,
    name: string,
    ids: readonly (string | number)[],
  ) => Promise<SchemaPayload>;
  readonly actionState: (
    relation: string,
    name: string,
  ) => (request: StateRequest) => Promise<StateResponse>;
  /** The manager's own form, resolved. Absent means no tab can be written to. */
  readonly childForm?: (relation: string, childId?: string) => Promise<SchemaPayload>;
  /** Its round trips, which a dependent field inside it needs. */
  readonly childState?: (
    relation: string,
    childId?: string,
  ) => (request: StateRequest) => Promise<StateResponse>;
  readonly saveChild?: (
    relation: string,
    childId: string | undefined,
    state: FormState,
  ) => Promise<SaveResponse>;
}

/** The action the tab adds to every row. Its own, carried out by this file. */
const EDIT: ActionNode = {
  type: "EditAction",
  name: "perch-edit-child",
  trigger: "run",
};

/** What a tab holds: nothing yet, a page, or why there is none. */
type Held = { readonly page: RecordsPage } | { readonly failed: string } | undefined;

export function PanelRelations({
  relations,
  fetchPage,
  runAction,
  actionForm,
  actionState,
  childForm,
  childState,
  saveChild,
}: PanelRelationsProps): ReactNode {
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState<Readonly<Record<string, Held>>>({});
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const [schema, setSchema] = useState<SchemaPayload | undefined>(undefined);
  const open = relations[at];

  /** Opens the form over the tab, once the server has resolved it. */
  function edit(relation: string, childId?: string): void {
    if (childForm === undefined) return;
    setSchema(undefined);
    setEditing({ relation, ...(childId === undefined ? {} : { childId }) });
    void childForm(relation, childId).then(
      (resolved) => {
        setSchema(resolved);
      },
      () => {
        setEditing(undefined);
      },
    );
  }

  /** After a write: the page is stale, so it is dropped and asked for again. */
  function written(relation: string): void {
    setEditing(undefined);
    setSchema(undefined);
    // Dropped rather than patched: what a write did to the page — which rows,
    // in what order, on which page of how many — is the server's to say.
    setHeld((was) =>
      Object.fromEntries(Object.entries(was).filter(([name]) => name !== relation)),
    );
  }

  useEffect(() => {
    if (open === undefined || held[open.relation] !== undefined) return;

    let live = true;
    void fetchPage(open.relation, {}).then(
      (page) => {
        // The tab may have been left before this landed. Kept anyway — it is
        // the answer for that tab, and dropping it means fetching it again.
        if (live) setHeld((was) => ({ ...was, [open.relation]: { page } }));
      },
      (error: unknown) => {
        if (!live) return;
        setHeld((was) => ({
          ...was,
          [open.relation]: {
            failed: error instanceof Error ? error.message : "Could not load these.",
          },
        }));
      },
    );
    return () => {
      live = false;
    };
  }, [open, held, fetchPage]);

  if (relations.length === 0 || open === undefined) return null;

  return (
    <div className="perch-relations">
      <div className="perch-relations__head">
        <TabStrip
          tabs={relations.map((one) => ({ id: panelId(one), label: one.label }))}
          at={at}
          choose={setAt}
        />
        {open.writable === true && childForm !== undefined ? (
          <button
            type="button"
            className="perch-button perch-button--primary"
            // "Add" on screen and the tab beside it for context. The label is
            // the manager's, which is a plural — "Add Tasks" adds one task.
            aria-label={`Add to ${open.label}`}
            onClick={() => {
              edit(open.relation);
            }}
          >
            Add
          </button>
        ) : null}
      </div>
      {relations.map((one, index) => (
        <div
          key={one.relation}
          id={panelId(one)}
          role="tabpanel"
          aria-labelledby={`${panelId(one)}-tab`}
          className="perch-relations__body"
          hidden={index !== at}
        >
          {/* Only the open one is built. A hidden tab that rendered its table
              would fetch nothing — it has no page — but it would still put a
              table's worth of controls in the tab order. */}
          {index === at ? body(one, held[one.relation]) : null}
        </div>
      ))}

      {/* Rendered only while something is being written, so the element is not
          in the page — nor in the accessibility tree — the rest of the time. */}
      {editing === undefined || saveChild === undefined ? null : (
        <ConfirmDialog
          open
          confirmation={{
            heading: editing.childId === undefined ? "Add" : "Edit",
            confirmLabel: "Save",
          }}
          busy={false}
          onConfirm={() => undefined}
          onCancel={() => {
            setEditing(undefined);
            setSchema(undefined);
          }}
        >
          {schema === undefined || childState === undefined ? (
            <p className="perch-modal__description" role="status">
              Loading…
            </p>
          ) : (
            // The page form, in a dialog. A dependent field, a validation
            // message and a file all work here because it is the same
            // component talking to the same cycle.
            <PanelForm
              key={`${editing.relation}/${editing.childId ?? "new"}`}
              initial={schema}
              send={childState(editing.relation, editing.childId)}
              submitLabel="Save"
              save={async ({ state }) => {
                const answer = await saveChild(
                  editing.relation,
                  editing.childId,
                  state,
                );
                if (answer.errors === undefined) {
                  written(editing.relation);
                  return {};
                }
                return {
                  errors: answer.errors,
                  ...(answer.payload === undefined ? {} : { payload: answer.payload }),
                };
              }}
            />
          )}
        </ConfirmDialog>
      )}
    </div>
  );

  function body(one: ManagedRelation, what: Held): ReactNode {
    if (what === undefined) {
      return (
        <p className="perch-relations__waiting" role="status">
          Loading…
        </p>
      );
    }
    if ("failed" in what) {
      return (
        <p className="perch-relations__failed" role="alert">
          {what.failed}
        </p>
      );
    }
    const writable = one.writable === true && childForm !== undefined;

    return (
      <PanelList
        within
        initial={what.page}
        title={one.label}
        {...(writable
          ? {
              rowActions: [EDIT],
              onRowAction: (_name: string, row: Row) => {
                const key = row[what.page.recordKey];
                if (typeof key !== "string" && typeof key !== "number") return;
                edit(one.relation, String(key));
              },
            }
          : {})}
        fetchPage={(request) => fetchPage(one.relation, request)}
        runAction={(name, ids, data, idempotencyKey) =>
          runAction(one.relation, name, ids, data, idempotencyKey)
        }
        actionForm={(name, ids) => actionForm(one.relation, name, ids)}
        actionState={(name) => actionState(one.relation, name)}
        // The page it turns to is this tab's, not the address's: a form page
        // is about the record, and its query string says nothing about which
        // page of which tab is showing.
        onPage={(page) => {
          setHeld((was) => ({ ...was, [one.relation]: { page } }));
        }}
      />
    );
  }
}

/** Namespaced, because a relation could be called the same as a form's tab. */
function panelId(one: ManagedRelation): string {
  return `perch-relation-${one.relation}`;
}
