/**
 * The list page: a table, and the round trip that reorders it.
 *
 * The server is authoritative here as it is on a form. Clicking a header does
 * not sort the rows in the browser — it asks `/records` for the page in that
 * order and replaces what came back. Sorting on the client would be a second
 * implementation of the ordering, and the one the client cannot see past the
 * page it holds.
 */
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { ColumnTree, Row } from "@perchjs/core";
import { DataTable } from "./DataTable.js";
import type { DataTableSort } from "./DataTable.js";

/**
 * What `/records` answers with. Structurally `RecordsResponse`, named from the
 * types core exports rather than restated — a copy of `ColumnTree` here would
 * drift from the one the server serialises.
 */
export interface RecordsPage {
  readonly rows: readonly Row[];
  readonly total: number;
  /** The page the server served, and its size. Read, never assumed. */
  readonly page: number;
  readonly perPage: number;
  readonly columns: ColumnTree;
  /** The order the server applied, which may not be the one that was asked. */
  readonly sort?: DataTableSort;
  /** The term the server searched for, which may not be the one that was asked. */
  readonly search?: string;
  /** The filters the server applied, by name. Never one it declined. */
  readonly filters?: Readonly<Record<string, string>>;
  readonly recordKey: string;
  /** Absent when the server would not vouch for the address. */
  readonly resourcePath?: string;
}

/** What the table asks for. Everything absent means "as it was". */
export interface PageRequest {
  readonly sort?: DataTableSort;
  readonly page?: number;
  readonly perPage?: number;
  readonly search?: string;
  readonly filters?: Readonly<Record<string, string>>;
}

export interface PanelListProps {
  readonly initial: RecordsPage;
  readonly title: string;
  /**
   * Asks the server for a page. Absent means the table cannot be reordered and
   * cannot be turned — it is whatever the shell embedded.
   */
  readonly fetchPage?: (request: PageRequest) => Promise<RecordsPage>;
  /**
   * The page that is now on screen. Called for the answer this accepted and no
   * other, so a caller writing it somewhere — an address, say — inherits the
   * ordering rule rather than needing its own.
   */
  readonly onPage?: (page: RecordsPage) => void;
}

export function PanelList({
  initial,
  title,
  fetchPage,
  onPage,
}: PanelListProps): ReactNode {
  const [page, setPage] = useState(initial);
  const [failed, setFailed] = useState(false);

  /**
   * What is in the search box, and which answer it was last reconciled with.
   *
   * The box has to be typed into, so it holds what was typed; but the term the
   * server applied is not always that one — it is capped, and a table that
   * declares no searchable column drops it — so the box follows the answer
   * whenever a new one names a different term.
   *
   * Adjusted during render rather than in an effect, and certainly not by
   * changing the field's `key`: remounting an element takes the focus with it,
   * and the reader had just used the one control they were pointed at.
   */
  const [typed, setTyped] = useState(initial.search ?? "");
  const [entered, setEntered] = useState<Readonly<Record<string, string>>>(
    initial.filters ?? {},
  );
  const [reconciled, setReconciled] = useState(stamp(initial));
  if (stamp(page) !== reconciled) {
    setReconciled(stamp(page));
    setTyped(page.search ?? "");
    setEntered(page.filters ?? {});
  }

  /**
   * Read, never decided. The sort *indicator* belongs to the pure-UI zone, and
   * the order itself is canonical — so this comes from the answer. Setting it
   * optimistically would show "sorted by X" after the server had silently
   * refused X, which is the client inventing a state.
   */
  const sort = page.sort ?? page.columns.defaultSort;

  /**
   * The request the table is waiting on. Anything older that arrives after it
   * is dropped.
   *
   * Turning a page is two clicks away from a race: Next then Previous puts two
   * requests in flight, and whichever the network hands back last wins — which
   * can be the one the reader has already moved on from. The form transport
   * numbers its requests for the same reason; this is the same rule with one
   * counter instead of a queue.
   */
  const latest = useRef(0);

  const ask =
    fetchPage === undefined
      ? undefined
      : (request: PageRequest) => {
          const sequence = (latest.current += 1);
          setFailed(false);
          fetchPage(request).then(
            (answer) => {
              if (sequence !== latest.current) return;
              setPage(answer);
              onPage?.(answer);
            },
            () => {
              // The rows on screen are still the ones the server sent; saying so
              // is better than replacing them with an empty table.
              if (sequence === latest.current) setFailed(true);
            },
          );
        };

  // Reordering starts over. Page 5 of one order is not page 5 of another, and
  // keeping the number would land the reader somewhere they did not choose.
  const reorder =
    ask === undefined
      ? undefined
      : (next: DataTableSort) => {
          ask({ sort: next, page: 1 });
        };
  // `perPage` travels with the turn: an address may carry one and the server
  // honours it, so a request that leaves it out gets the default back and the
  // table changes size under the reader.
  // A new term starts over, for the reason a new order does: page 5 of one
  // result set is not page 5 of another.
  const find =
    ask === undefined
      ? undefined
      : (term: string, filters: Readonly<Record<string, string>>) => {
          ask({
            ...(sort === undefined ? {} : { sort }),
            ...(term === "" ? {} : { search: term }),
            ...(Object.keys(filters).length === 0 ? {} : { filters }),
            page: 1,
            perPage: page.perPage,
          });
        };
  const turn =
    ask === undefined
      ? undefined
      : (to: number) => {
          ask({
            ...(sort === undefined ? {} : { sort }),
            ...(page.search === undefined ? {} : { search: page.search }),
            ...(page.filters === undefined ? {} : { filters: page.filters }),
            page: to,
            perPage: page.perPage,
          });
        };

  return (
    <main className="perch-list">
      <div className="perch-list__header">
        <h1 className="perch-list__title">{title}</h1>
        {headerActions(page)}
      </div>
      {narrowing(page, find, { typed, setTyped, entered, setEntered })}
      {failed ? (
        // One sentence for both round trips this page makes. "Could not
        // reorder" was the only one when reordering was the only one, and it
        // read as a lie the first time a page failed to turn.
        <p className="perch-list__failure" role="alert">
          Could not reach the server. Showing what was already here.
        </p>
      ) : null}
      <DataTable
        columns={page.columns}
        rows={page.rows}
        caption={title}
        rowHref={(row) => href(page, row)}
        {...(sort === undefined ? {} : { sort })}
        {...(reorder === undefined ? {} : { onSort: reorder })}
      />
      {pagination(page, turn)}
      {/*
        The one live region on this page: it is what changes when a page is
        turned, and a second would make the two talk over each other.
      */}
      <p className="perch-list__total" role="status">
        {status(page)}
      </p>
    </main>
  );
}

/**
 * The search box, when a search reaches anything and something can answer it.
 *
 * A form rather than a box that asks on every keystroke: a round trip per
 * letter is what the design warns about for filters, and the same arithmetic
 * applies here. Enter submits, which is what a `role="search"` form does
 * without being told.
 *
 * What it holds is what was typed; what an answer names is what it becomes.
 * The two differ because the term is capped and can be dropped entirely, and
 * the reconciliation happens on the component rather than by remounting the
 * field, which would take the focus with it.
 */
interface Narrowing {
  readonly typed: string;
  readonly setTyped: (term: string) => void;
  readonly entered: Readonly<Record<string, string>>;
  readonly setEntered: (values: Readonly<Record<string, string>>) => void;
}

function narrowing(
  page: RecordsPage,
  find: ((term: string, filters: Readonly<Record<string, string>>) => void) | undefined,
  state: Narrowing,
): ReactNode {
  const searchable = page.columns.searchable === true;
  const filters = page.columns.filters;
  if (find === undefined || (!searchable && filters.length === 0)) return null;

  return (
    <form
      className="perch-list__search"
      // A landmark, so it is reachable without reading the page, and named,
      // because an unnamed one is announced as "search" among however many
      // others a panel grows. `search` covers filtering too: what the role
      // describes is a facility for narrowing to what a reader is after, not a
      // text box. The name is the region's, not any control's — reusing
      // "Search" here made the box and the form round it answer to one name.
      role="search"
      aria-label="Narrow the list"
      onSubmit={(event) => {
        event.preventDefault();
        find(state.typed.trim(), trimmed(state.entered));
      }}
    >
      {searchable ? (
        <input
          className="perch-control"
          type="search"
          name="search"
          aria-label="Search"
          value={state.typed}
          onChange={(event) => {
            state.setTyped(event.target.value);
          }}
        />
      ) : null}
      {filters.map((filter) =>
        filter.type === "TextFilter" ? (
          <input
            key={filter.name}
            className="perch-control"
            type="text"
            name={filter.name}
            aria-label={filter.label ?? filter.name}
            value={state.entered[filter.name] ?? ""}
            onChange={(event) => {
              state.setEntered({ ...state.entered, [filter.name]: event.target.value });
            }}
          />
        ) : null,
      )}
      <button type="submit" className="perch-button">
        Apply
      </button>
    </form>
  );
}

/** A blank control is one nobody used, and says nothing. */
function trimmed(
  entered: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(entered)
      .map(([name, value]) => [name, value.trim()] as const)
      .filter(([, value]) => value !== ""),
  );
}

/**
 * What the answer says about the narrowing, as one comparable value.
 *
 * The controls follow the answer, and an answer differs when its term or any of
 * its filters do. Comparing the pair rather than the term alone is what stops a
 * filter the server declined from staying in the box.
 */
function stamp(page: RecordsPage): string {
  return JSON.stringify([page.search ?? "", page.filters ?? {}]);
}

/** How many pages the server's answer implies. */
function pageCount(page: RecordsPage): number {
  return Math.max(Math.ceil(page.total / Math.max(page.perPage, 1)), 1);
}

/**
 * The count, and which page of it is on screen.
 *
 * One sentence rather than two elements, because it is the page's only live
 * region — the rows change under a screen reader without announcing themselves,
 * so this is what says a turn happened.
 */
function status(page: RecordsPage): string {
  const records = page.total === 1 ? "1 record" : `${String(page.total)} records`;
  const pages = pageCount(page);
  if (pages === 1) return records;
  return `Page ${String(page.page)} of ${String(pages)}, ${records}`;
}

/**
 * Previous and next, and nothing when there is one page.
 *
 * The page shown is the server's answer, not what was clicked. Advancing a
 * counter locally would show page 4 after the server had served page 3 — the
 * same rule the sort indicator follows, for the same reason.
 */
function pagination(
  page: RecordsPage,
  turn: ((to: number) => void) | undefined,
): ReactNode {
  const pages = pageCount(page);
  if (turn === undefined || pages === 1) return null;

  return (
    <nav className="perch-pagination" aria-label="Pagination">
      <PageButton
        label="Previous"
        to={page.page - 1}
        spent={page.page <= 1}
        turn={turn}
      />
      <PageButton
        label="Next"
        to={page.page + 1}
        spent={page.page >= pages}
        turn={turn}
      />
    </nav>
  );
}

/**
 * `aria-disabled`, never `disabled`.
 *
 * `disabled` takes the element out of the tab order, and a browser drops the
 * focus it was holding to the body — so pressing Next to the last page leaves a
 * keyboard reader nowhere, with the next Tab starting again from the top of the
 * document. The control stays a real button, says it is unavailable, and does
 * nothing when pressed anyway.
 *
 * The alternative is to keep `disabled` and move the focus by hand, which means
 * choosing somewhere to send it and moving it under a reader who did not ask.
 *
 * `data-disabled` alongside it is the stylesheet's hook, the one
 * `statusAttributes` sets on every field: `aria-disabled` changes nothing a
 * reader can see, so without it a control with nowhere to go looks exactly as
 * pressable as one that works. `Select` pairs them the same way.
 */
function PageButton({
  label,
  to,
  spent,
  turn,
}: {
  readonly label: string;
  readonly to: number;
  readonly spent: boolean;
  readonly turn: (to: number) => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="perch-button"
      aria-disabled={spent}
      data-disabled={spent ? "true" : "false"}
      onClick={() => {
        if (!spent) turn(to);
      }}
    >
      {label}
    </button>
  );
}

/**
 * The address of one row's edit page.
 *
 * Built from what the server sent — the key's name and the path its pages live
 * under — rather than from a convention. A model keyed on `uuid` is addressed
 * by `uuid`, and a panel behind a prefix keeps it.
 */
function href(page: RecordsPage, row: Row): string | undefined {
  if (page.resourcePath === undefined) return undefined;
  const key = row[page.recordKey];
  if (typeof key !== "string" && typeof key !== "number") return undefined;
  return `${page.resourcePath}/${encodeURIComponent(String(key))}/edit`;
}

/**
 * What the table offers as a whole. `CreateAction` is a link to the create page
 * (navigation), and an action the renderer has no meaning for is skipped rather
 * than drawn — the same rule the row actions follow.
 */
function headerActions(page: RecordsPage): ReactNode {
  const path = page.resourcePath;
  if (path === undefined) return null;

  // Built before it is wrapped: a table whose only header action is one the
  // renderer skips would otherwise leave an empty element in the header.
  const links = page.columns.headerActions
    .filter((action) => action.type === "CreateAction")
    .map((action) => (
      <a
        key={action.type}
        className="perch-button perch-button--primary"
        href={`${path}/create`}
      >
        {action.label ?? "Create"}
      </a>
    ));

  return links.length === 0 ? null : <div className="perch-list__actions">{links}</div>;
}
