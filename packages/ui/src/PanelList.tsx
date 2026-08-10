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
import { useState } from "react";
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
  readonly columns: ColumnTree;
  /** The order the server applied, which may not be the one that was asked. */
  readonly sort?: DataTableSort;
  readonly recordKey: string;
  /** Absent when the server would not vouch for the address. */
  readonly resourcePath?: string;
}

export interface PanelListProps {
  readonly initial: RecordsPage;
  readonly title: string;
  /** Asks the server for a page. Absent means the table cannot be reordered. */
  readonly fetchPage?: (sort: DataTableSort) => Promise<RecordsPage>;
}

export function PanelList({ initial, title, fetchPage }: PanelListProps): ReactNode {
  const [page, setPage] = useState(initial);
  const [failed, setFailed] = useState(false);

  /**
   * Read, never decided. The sort *indicator* belongs to the pure-UI zone, and
   * the order itself is canonical — so this comes from the answer. Setting it
   * optimistically would show "sorted by X" after the server had silently
   * refused X, which is the client inventing a state.
   */
  const sort = page.sort ?? page.columns.defaultSort;

  const reorder =
    fetchPage === undefined
      ? undefined
      : (next: DataTableSort) => {
          setFailed(false);
          fetchPage(next).then(setPage, () => {
            // The rows on screen are still the ones the server sent; saying so
            // is better than replacing them with an empty table.
            setFailed(true);
          });
        };

  return (
    <main className="perch-list">
      <div className="perch-list__header">
        <h1 className="perch-list__title">{title}</h1>
        {headerActions(page)}
      </div>
      {failed ? (
        <p className="perch-list__failure" role="alert">
          Could not reorder. Showing the previous order.
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
      <p className="perch-list__total" role="status">
        {page.total === 1 ? "1 record" : `${String(page.total)} records`}
      </p>
    </main>
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
      <a key={action.type} className="perch-button" href={`${path}/create`}>
        {action.label ?? "Create"}
      </a>
    ));

  return links.length === 0 ? null : <div className="perch-list__actions">{links}</div>;
}
