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
import type { UploadedFile } from "./node-props.js";
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

/** What a tab holds: nothing yet, a page, or why there is none. */
type Held = { readonly page: RecordsPage } | { readonly failed: string } | undefined;

/** What the dialog holds: nothing yet, the form, or why there is none. */
type Asked =
  { readonly schema: SchemaPayload } | { readonly failed: string } | undefined;

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
  /** Stages a file for a field the manager's own form declares. */
  readonly uploadChildFile?: (
    relation: string,
    childId: string | undefined,
    path: string,
    file: File,
    state: FormState,
  ) => Promise<UploadedFile>;
}

/** The action the tab adds to every row. Its own, carried out by this file. */
const EDIT: ActionNode = {
  type: "EditAction",
  name: "perch-edit-child",
  trigger: "run",
};

export function PanelRelations({
  relations,
  fetchPage,
  runAction,
  actionForm,
  actionState,
  childForm,
  childState,
  saveChild,
  uploadChildFile,
}: PanelRelationsProps): ReactNode {
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState<Readonly<Record<string, Held>>>({});
  const [editing, setEditing] = useState<Editing | undefined>(undefined);
  const [asked, setAsked] = useState<Asked>(undefined);
  // Held while a write is in flight, so nothing dismisses the dialog out from
  // under a refusal that has not arrived yet.
  const [saving, setSaving] = useState(false);
  // What each tab was last showing — its order, its filters, the page it was
  // on. A write invalidates the rows, not what the reader was looking at.
  const [shown, setShown] = useState<Readonly<Record<string, PageRequest>>>({});
  // What the last write said, shown where an action's answer is shown. A
  // create can sort onto a page the reader is not on, so the row appearing is
  // not something they can be left to notice.
  const [said, setSaid] = useState<ActionAnswer["notification"] | undefined>(undefined);
  const open = relations[at];

  /** Opens the form over the tab, once the server has resolved it. */
  function edit(relation: string, childId?: string): void {
    if (childForm === undefined) return;
    setAsked(undefined);
    setEditing({ relation, ...(childId === undefined ? {} : { childId }) });
    void childForm(relation, childId).then(
      (schema) => {
        setAsked({ schema });
      },
      (error: unknown) => {
        // Said rather than swallowed. Closing the dialog silently leaves a
        // reader who pressed a button with no idea whether anything happened.
        setAsked({
          failed: error instanceof Error ? error.message : "Could not open that.",
        });
      },
    );
  }

  function shut(): void {
    setEditing(undefined);
    setAsked(undefined);
  }

  /** After a write: the page is stale, so it is dropped and asked for again. */
  function written(relation: string, notification: SaveResponse["notification"]): void {
    shut();
    setSaid(notification);
    // What the reader was looking at, kept — read off the answer that is being
    // dropped rather than off any request, because the server caps the paging
    // depth and drops a sort it never declared.
    const at = held[relation];
    if (at !== undefined && "page" in at) {
      setShown((was) => ({ ...was, [relation]: asking(at.page) }));
    }
    // Dropped rather than patched: what a write did to the page — which rows,
    // in what order, on which page of how many — is the server's to say.
    setHeld((was) =>
      Object.fromEntries(Object.entries(was).filter(([name]) => name !== relation)),
    );
  }

  useEffect(() => {
    if (open === undefined || held[open.relation] !== undefined) return;

    let live = true;
    void fetchPage(open.relation, shown[open.relation] ?? {}).then(
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
  }, [open, held, shown, fetchPage]);

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
          confirmation={{ heading: editing.childId === undefined ? "Add" : "Edit" }}
          // Escape and the backdrop are held off while a write is in flight:
          // a refusal that arrives after the dialog has gone has nowhere to be
          // shown, and the reader is told nothing.
          busy={saving}
          onCancel={shut}
        >
          {asked === undefined || childState === undefined ? (
            <p className="perch-modal__description" role="status">
              Loading…
            </p>
          ) : "failed" in asked ? (
            <p className="perch-modal__description" role="alert">
              {asked.failed}
            </p>
          ) : (
            // The page form, in a dialog. A dependent field, a validation
            // message and a file all work here because it is the same
            // component talking to the same cycle.
            <PanelForm
              key={`${editing.relation}/${editing.childId ?? "new"}`}
              initial={asked.schema}
              send={childState(editing.relation, editing.childId)}
              submitLabel="Save"
              {...(uploadChildFile === undefined
                ? {}
                : {
                    uploadFile: (path: string, file: File, state: FormState) =>
                      uploadChildFile(
                        editing.relation,
                        editing.childId,
                        path,
                        file,
                        state,
                      ),
                  })}
              save={async ({ state }) => {
                setSaving(true);
                try {
                  const answer = await saveChild(
                    editing.relation,
                    editing.childId,
                    state,
                  );
                  if (answer.errors === undefined) {
                    written(editing.relation, answer.notification);
                    return {};
                  }
                  return {
                    errors: answer.errors,
                    ...(answer.payload === undefined
                      ? {}
                      : { payload: answer.payload }),
                  };
                } finally {
                  setSaving(false);
                }
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
        {...(said === undefined ? {} : { flash: said })}
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

/**
 * The page that is on screen, as the request that would ask for it again.
 *
 * A write invalidates the rows and nothing else. Asked for from scratch, a
 * reader who edited a row on the third page of a filtered tab came back to the
 * first page of an unfiltered one.
 */
function asking(page: RecordsPage): PageRequest {
  return {
    ...(page.sort === undefined ? {} : { sort: page.sort }),
    page: page.page,
    perPage: page.perPage,
    ...(page.search === undefined ? {} : { search: page.search }),
    ...(page.filters === undefined ? {} : { filters: page.filters }),
  };
}

/** Namespaced, because a relation could be called the same as a form's tab. */
function panelId(one: ManagedRelation): string {
  return `perch-relation-${one.relation}`;
}
