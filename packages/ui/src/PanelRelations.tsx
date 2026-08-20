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
import type { FormState, SchemaPayload } from "@perchjs/core";
import type { ActionAnswer, PageRequest, RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";
import type { StateRequest, StateResponse } from "./transport.js";
import { TabStrip } from "./Tabs.js";

export interface ManagedRelation {
  readonly relation: string;
  readonly label: string;
}

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
}

/** What a tab holds: nothing yet, a page, or why there is none. */
type Held = { readonly page: RecordsPage } | { readonly failed: string } | undefined;

export function PanelRelations({
  relations,
  fetchPage,
  runAction,
  actionForm,
  actionState,
}: PanelRelationsProps): ReactNode {
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState<Readonly<Record<string, Held>>>({});
  const open = relations[at];

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
      <TabStrip
        tabs={relations.map((one) => ({ id: panelId(one), label: one.label }))}
        at={at}
        choose={setAt}
      />
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
    return (
      <PanelList
        within
        initial={what.page}
        title={one.label}
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
