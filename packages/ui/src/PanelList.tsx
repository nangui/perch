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
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "./marks.js";
import { IconMark } from "./icons.js";
import { ColumnMenu, hiddenAtFirst } from "./ColumnMenu.js";
import { remember, remembered } from "./remembered.js";
import type {
  ActionNode,
  ModalWidth,
  ColumnNode,
  ColumnTree,
  FormState,
  Row,
  SchemaPayload,
} from "@perchjs/core";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { PanelForm } from "./PanelForm.js";
import { PanelView } from "./PanelView.js";
import { SchemaRenderer } from "./SchemaRenderer.js";
import type { StateRequest, StateResponse } from "./transport.js";
import { DataTable, defaultLabel } from "./DataTable.js";
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
  /** Which of the rows above are marked deleted, by key. */
  readonly deleted?: readonly (string | number)[];
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
  /** The table's caption, and its heading unless it is drawn `within` a page. */
  readonly title: string;
  /**
   * Drawn inside another page rather than as one.
   *
   * A relation manager's table is a tab under a form: it is not the page's
   * landmark and it is named by its tab, so it gets neither.
   */
  readonly within?: boolean;
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
  /**
   * Something said on the page that sent the reader here.
   *
   * Shown where an action's own answer is shown, and cleared by the same
   * things: it is about the rows that were there when it was written.
   */
  readonly flash?: ActionAnswer["notification"];
  /**
   * Carries out an action. Absent means the table draws none that would need
   * carrying out, which is how a page renders with no host behind it.
   */
  readonly runAction?: (
    name: string,
    ids: readonly (string | number)[],
    data?: FormState,
    idempotencyKey?: string,
  ) => Promise<ActionAnswer>;
  /**
   * Writes one cell, and answers with what it holds now.
   *
   * Absent means the table draws no cell controls: nobody would carry them out.
   * The answer is the server's reading of the value, not an echo — a write it
   * refused comes back as what the row held before, and the cell goes back to
   * showing that.
   */
  readonly writeCell?: (
    id: string | number,
    path: string,
    value: unknown,
  ) => Promise<{ value: unknown; notification?: ActionAnswer["notification"] }>;
  /**
   * Asks for a modal's resolved schema, and for its round trips afterwards.
   * Absent means an action that collects something cannot be opened.
   */
  readonly actionForm?: (
    name: string,
    ids: readonly (string | number)[],
  ) => Promise<SchemaPayload>;
  /**
   * What a view opened in place shows: the record's infolist, resolved against
   * this reader. Asked for rather than held, for the reason a modal's form is —
   * what a record reads like is the server's to decide every time.
   */
  readonly actionContent?: (
    name: string,
    ids: readonly (string | number)[],
  ) => Promise<SchemaPayload>;
  readonly actionState?: (
    name: string,
  ) => (request: StateRequest) => Promise<StateResponse>;
  /**
   * Offered on every row, after the ones the table declared, and carried out by
   * the host rather than by a request from here.
   *
   * For what a page can do that the rows themselves cannot say: editing a
   * relation manager's child opens a form over the tab, and a child has no page
   * of its own for a link to lead to.
   */
  readonly rowActions?: readonly ActionNode[];
  readonly onRowAction?: (name: string, row: Row) => void;
}

/** What the server answered. Counts, and whatever the action wanted to say. */
export interface ActionAnswer {
  readonly processed: number;
  readonly refused: number;
  readonly notification?: {
    readonly title: string;
    readonly body?: string;
    readonly tone: "success" | "warning" | "danger" | "info";
  };
  /** A modal's form the server would not accept, with the tree they belong to. */
  readonly errors?: Readonly<Record<string, string>>;
  readonly payload?: SchemaPayload;
}

/** An action waiting on the reader's answer, and the row it was pressed on. */
interface Pending {
  readonly action: ActionNode;
  readonly ids: readonly (string | number)[];
  /** The resolved schema, once the server has answered with it. */
  readonly schema?: SchemaPayload;
  /** What a view opened in place is showing, once it has arrived. */
  readonly content?: SchemaPayload;
}

export function PanelList({
  initial,
  title,
  within,
  rowActions,
  onRowAction,
  fetchPage,
  onPage,
  flash,
  runAction,
  writeCell,
  actionForm,
  actionContent,
  actionState,
}: PanelListProps): ReactNode {
  const [page, setPage] = useState(initial);
  // Which columns the reader has taken off. Seeded from what the table
  // declared and its own from then on: a page turning is not a reason to put
  // back a column somebody removed.
  // What this reader arranged last time wins over what the table declared —
  // `hiddenByDefault` is where a column starts for somebody who has never said
  // otherwise, not a thing to reapply over their choice.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => {
    const kept = remembered(initial.resourcePath).hidden;
    return kept === undefined ? hiddenAtFirst(initial.columns.columns) : new Set(kept);
  });
  const [failed, setFailed] = useState(false);
  // Asked for once, on arrival. The server sent the page it defaults to, and a
  // reader who chose another size last time should not have to choose it again
  // — but only where they did choose, and only where this list can ask.
  const asked = useRef(false);

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
    asEntered(initial),
  );
  const [reconciled, setReconciled] = useState(stamp(initial));
  if (stamp(page) !== reconciled) {
    setReconciled(stamp(page));
    setTyped(page.search ?? "");
    setEntered(asEntered(page));
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
      : (request: PageRequest, keepNotice = false, rescue = false) => {
          const sequence = (latest.current += 1);
          setFailed(false);
          // A reader who sorts or turns a page has moved on: a notice still
          // reading "Done" would describe rows that are no longer on screen.
          // The refresh an action asks for keeps it, because it is what the
          // notice is about.
          if (!keepNotice) setSaid(undefined);
          // Whether the reader navigated or an action just changed the rows,
          // what was ticked is about the page that was there before.
          forgetPicked();
          fetchPage(request).then(
            (answer) => {
              if (sequence !== latest.current) return;
              // An action can empty the page it was run on — delete everything
              // on page 3 of 3 and page 3 stops existing. Asking for it again
              // answers with nothing, and the reader is left looking at an
              // empty table that says there are records.
              if (rescue && answer.rows.length === 0 && answer.page > 1) {
                const last = Math.max(1, Math.ceil(answer.total / answer.perPage));
                if (last < answer.page) {
                  ask?.({ ...request, page: last }, true);
                  return;
                }
              }
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

  useEffect(() => {
    if (asked.current || ask === undefined) return;
    asked.current = true;
    const size = remembered(initial.resourcePath).perPage;
    if (size === undefined || size === initial.perPage) return;
    ask({ ...(sort === undefined ? {} : { sort }), page: 1, perPage: size });
    // Arrival only. Naming the transport here would ask again every time the
    // list redrew, which is a request per keystroke in the search box.
  }, []);

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

  /**
   * The action the reader is being asked about, and what it would touch.
   *
   * An action that declared no confirmation never lands here — it runs on the
   * press. One that did stays here until they answer, and `busy` holds the
   * dialog while the request is in flight so a second press cannot start a
   * second one.
   */
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /**
   * The same fact as `busy`, readable in the same tick it is set.
   *
   * Two clicks land before React has re-rendered anything, so both handlers
   * read the state as it was and both start a request. A ref is what the second
   * one can see the first in.
   */
  const running = useRef(false);
  /**
   * Names what the reader asked for, not the request that carries it.
   *
   * Made when the intent is formed and kept while it is being attempted, so a
   * retry of the same press is recognised on the server and a fresh press is
   * not. Cleared once something has actually happened.
   */
  const intent = useRef<string | undefined>(undefined);

  /**
   * The rows the reader has ticked, by key as text.
   *
   * Text because a key is a number or a string depending on the model, and a
   * `Set` would hold `1` and `"1"` apart. What goes back to the server is what
   * the row carried, looked up again at that point.
   */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  /**
   * The cells waiting on an answer, by row and path.
   *
   * Per cell rather than per table: a reader flipping three switches in a row
   * should not be stopped by the first one, and a table that greys out entirely
   * on every write reads as broken.
   */
  const [writing, setWriting] = useState<ReadonlyMap<string, unknown>>(new Map());

  const keyOf = (row: Row): string | number | undefined => {
    const key = row[page.recordKey];
    return typeof key === "string" || typeof key === "number" ? key : undefined;
  };

  /** One cell, named by the row it is in and the path it holds. */
  const cellKey = (row: Row, column: ColumnNode): string =>
    `${String(keyOf(row))}:${column.path}`;

  /**
   * Writes one cell and puts the server's answer back into the row.
   *
   * The row rather than the page: refetching after every switch would lose the
   * reader's place and re-sort the page under them, and what changed is one
   * value the server has just told us.
   */
  async function write(row: Row, column: ColumnNode, value: unknown): Promise<void> {
    const id = keyOf(row);
    if (writeCell === undefined || id === undefined) return;

    const at = cellKey(row, column);
    // What was asked for, kept only until the answer lands. A control that does
    // not move when it is pressed reads as one that did not hear, and the
    // server still decides: what comes back replaces this, refusal included.
    setWriting((was) => new Map([...was, [at, value]]));
    try {
      const answer = await writeCell(id, column.path, value);
      setPage((was) => ({
        ...was,
        rows: was.rows.map((one) =>
          keyOf(one) === id ? { ...one, [column.path]: answer.value } : one,
        ),
      }));
      if (answer.notification !== undefined) setSaid(answer.notification);
    } catch {
      // The row is not touched, so the cell goes back to what the server last
      // said it held — which is the truth until something says otherwise.
      setSaid({ title: "That could not be saved", tone: "danger" });
    } finally {
      setWriting((was) => {
        const next = new Map(was);
        next.delete(at);
        return next;
      });
    }
  }

  // A selection describes rows on a page. Once the page is not that one, the
  // ticks belong to rows the reader can no longer see.
  const forgetPicked = (): void => {
    setPicked((was) => (was.size === 0 ? was : new Set()));
  };

  const bulk = page.columns.bulkActions;
  const chosen = page.rows.map(keyOf).filter((key) => key !== undefined);
  const selected = chosen.filter((key) => picked.has(String(key)));
  const [said, setSaid] = useState<ActionAnswer["notification"] | undefined>(flash);

  /**
   * Opens what an action collects with, or runs it where it collects nothing.
   *
   * The schema is asked for rather than held: it is resolved against this
   * reader, and what it looks like is the server's to decide every time.
   */
  async function open(
    action: ActionNode,
    ids: readonly (string | number)[],
  ): Promise<void> {
    // Nothing is carried out and nothing is asked: the content is fetched and
    // drawn, and the way out is the way out of any dialog.
    if (action.trigger === "show") {
      if (actionContent === undefined) return;
      setPending({ action, ids });
      setBusy(true);
      try {
        setPending({ action, ids, content: await actionContent(action.name, ids) });
      } catch (error) {
        setSaid({
          title: error instanceof Error ? error.message : "That did not work.",
          tone: "danger",
        });
        setPending(undefined);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (action.hasForm !== true) {
      if (action.confirmation !== undefined) {
        setPending({ action, ids });
        return;
      }
      await carry(action, ids);
      return;
    }
    // Both, or neither. A modal that renders and fails on every keystroke reads
    // as the panel being broken rather than as the action being unavailable.
    if (actionForm === undefined || actionState === undefined) return;

    setPending({ action, ids });
    setBusy(true);
    try {
      setPending({ action, ids, schema: await actionForm(action.name, ids) });
    } catch (error) {
      setSaid({
        title: error instanceof Error ? error.message : "That did not work.",
        tone: "danger",
      });
      setPending(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function carry(
    action: ActionNode,
    ids: readonly (string | number)[],
    data?: FormState,
  ): Promise<ActionAnswer | undefined> {
    if (runAction === undefined || running.current) return undefined;
    running.current = true;
    intent.current ??= newIntent();
    setBusy(true);
    try {
      const answer = await runAction(action.name, ids, data, intent.current);
      // A form the server would not accept: the dialog stays, with the tree it
      // sent back so the errors land on their fields.
      if (answer.errors !== undefined && Object.keys(answer.errors).length > 0) {
        // Nothing was carried out, so the next attempt is a fresh intent
        // rather than a replay of one the server would recognise.
        intent.current = undefined;
        return answer;
      }
      setSaid(
        answer.notification ?? {
          title: describeOutcome(answer),
          tone: answer.processed === 0 ? "warning" : "success",
        },
      );
      intent.current = undefined;
      setPending(undefined);
      // The rows are what the action just changed, so what is on screen is out
      // of date the moment it returns.
      refresh();
      return answer;
    } catch (error) {
      setSaid({
        title: error instanceof Error ? error.message : "That did not work.",
        tone: "danger",
      });
      setPending(undefined);
      return undefined;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  /** The page that is on screen, asked for again. Keeps what was just said. */
  function refresh(): void {
    ask?.(
      {
        ...(sort === undefined ? {} : { sort }),
        ...(page.search === undefined ? {} : { search: page.search }),
        ...(page.filters === undefined ? {} : { filters: page.filters }),
        page: page.page,
        perPage: page.perPage,
      },
      true,
      true,
    );
  }

  function pressBulk(action: ActionNode): void {
    if (selected.length === 0) return;
    void open(action, selected);
  }

  function press(action: ActionNode, row: Row): void {
    // The host's own, which no request from here carries out.
    if ((rowActions ?? []).some((one) => one.name === action.name)) {
      onRowAction?.(action.name, row);
      return;
    }
    const key = row[page.recordKey];
    if (typeof key !== "string" && typeof key !== "number") return;
    void open(action, [key]);
  }

  // A tab under a form is not a landmark and does not name itself — the tab
  // does, and a second `<h1>` under the page's own would say the record is
  // called after its relation.
  const Frame = within === true ? "section" : "main";

  return (
    <Frame className="perch-list">
      <div className="perch-list__header">
        {within === true ? null : <h1 className="perch-list__title">{title}</h1>}
        <div className="perch-list__tools">
          <ColumnMenu
            columns={page.columns.columns}
            hidden={hidden}
            onToggle={(path) => {
              setHidden((was) => {
                const next = new Set(was);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                remember(page.resourcePath, { hidden: [...next] });
                return next;
              });
            }}
          />
          {headerActions(page)}
        </div>
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
      {/* A wide table scrolls inside its own box; the page never scrolls
          sideways under it. */}
      {bulk.length === 0 || runAction === undefined || selected.length === 0 ? null : (
        <div className="perch-list__bulk" role="group" aria-label="Selected rows">
          <p className="perch-list__bulk-count" role="status">
            {selected.length} selected
          </p>
          {bulk.map((action) =>
            // A group here has no menu to sit in, so it becomes one. A row's
            // actions are already behind a control and a group folds into a
            // section there; these are laid out flat, and folding several of
            // them under one button is the whole point of asking.
            action.trigger === "group" ? (
              <details key={action.name} className="perch-list__bulk-group">
                <summary className="perch-button">
                  <IconMark name={action.icon} className="perch-list__bulk-icon" />
                  {action.label ?? action.name}
                </summary>
                <div
                  className="perch-list__bulk-menu"
                  role="group"
                  aria-label={action.label ?? action.name}
                >
                  {(action.children ?? []).map((one) => (
                    <button
                      key={one.name}
                      type="button"
                      className={`perch-table__action${one.danger === true ? " perch-table__action--danger" : ""}`}
                      disabled={busy}
                      onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        pressBulk(one);
                      }}
                    >
                      {one.label ?? defaultLabel(one)}
                    </button>
                  ))}
                </div>
              </details>
            ) : (
              <button
                key={action.name}
                type="button"
                className={`perch-button${action.danger === true ? " perch-button--danger" : ""}`}
                disabled={busy}
                onClick={() => {
                  pressBulk(action);
                }}
              >
                {action.label ?? defaultLabel(action)}
              </button>
            ),
          )}
        </div>
      )}
      {said === undefined ? null : (
        // One live region for what an action answered, kept apart from the
        // paging one below: they change for different reasons, and a reader
        // hearing both at once hears neither.
        <p className={`perch-notice perch-notice--${said.tone}`} role="status">
          <strong>{said.title}</strong>
          {said.body === undefined ? null : <span>{said.body}</span>}
        </p>
      )}
      <div className="perch-list__table">
        <DataTable
          // What the reader kept. A column taken off is not fetched any
          // differently — the server sent it and its values were read — it is
          // simply not drawn.
          columns={{
            ...page.columns,
            columns: page.columns.columns.filter((one) => !hidden.has(one.path)),
          }}
          rows={page.rows}
          caption={title}
          {...(page.columns.empty === undefined
            ? {}
            : { empty: <EmptyState {...page.columns.empty} page={page} /> })}
          rowHref={(action, row) => href(page, action, row)}
          rowActions={(row) => [...offered(page, row), ...(rowActions ?? [])]}
          {...(sort === undefined ? {} : { sort })}
          {...(reorder === undefined ? {} : { onSort: reorder })}
          {...(runAction === undefined && onRowAction === undefined
            ? {}
            : { onAction: press, actionsBusy: busy })}
          {...(writeCell === undefined
            ? {}
            : {
                onCellWrite: (row: Row, column: ColumnNode, value: unknown) => {
                  void write(row, column, value);
                },
                cellPending: (row: Row, column: ColumnNode) =>
                  writing.has(cellKey(row, column)),
                cellAsked: (row: Row, column: ColumnNode) =>
                  writing.get(cellKey(row, column)),
              })}
          {...(bulk.length === 0 || runAction === undefined
            ? {}
            : {
                selection: {
                  keyOf,
                  picked,
                  onPick: (key: string, on: boolean) => {
                    setPicked((was) => {
                      const next = new Set(was);
                      if (on) next.add(key);
                      else next.delete(key);
                      return next;
                    });
                  },
                  onPickAll: (on: boolean) => {
                    setPicked(on ? new Set(chosen.map(String)) : new Set());
                  },
                },
              })}
        />
      </div>

      {/* Rendered only while something is pending, so the element is not in the
          page — and not in the accessibility tree — the rest of the time. */}
      {pending === undefined ? null : pending.action.trigger === "show" ? (
        // Something to read. No footer, because there is nothing to agree to —
        // the way out is the corner, the backdrop or Escape, and a click on the
        // backdrop is taken because a panel that only shows something has
        // nothing to throw away.
        <ConfirmDialog
          open
          confirmation={{
            heading: pending.action.label ?? defaultLabel(pending.action),
          }}
          busy={busy}
          dismissable
          {...modalOf(pending.action)}
          onCancel={() => {
            setPending(undefined);
          }}
        >
          {pending.content === undefined ? (
            <p className="perch-modal__description" role="status">
              Loading…
            </p>
          ) : (
            <PanelView payload={pending.content} />
          )}
        </ConfirmDialog>
      ) : pending.action.hasForm !== true ? (
        // A question, which the dialog's own buttons answer.
        <ConfirmDialog
          open
          confirmation={pending.action.confirmation ?? {}}
          danger={pending.action.danger === true}
          busy={busy}
          {...modalOf(pending.action)}
          onConfirm={() => {
            void carry(pending.action, pending.ids);
          }}
          onCancel={() => {
            setPending(undefined);
          }}
        />
      ) : (
        // A form, which submits itself. Told apart here rather than by a
        // `children` that is sometimes nothing: the two take different
        // callers, and the dialog's own type says so.
        <ConfirmDialog
          open
          confirmation={pending.action.confirmation ?? {}}
          danger={pending.action.danger === true}
          busy={busy}
          {...modalOf(pending.action)}
          onCancel={() => {
            setPending(undefined);
          }}
        >
          {pending.schema === undefined || actionState === undefined ? (
            <p className="perch-modal__description" role="status">
              Loading…
            </p>
          ) : (
            // The page form, in a dialog. Everything it already does — a
            // dependent field, a validation message, a file — works here
            // because it is the same component talking to the same cycle.
            <PanelForm
              key={pending.action.name}
              initial={pending.schema}
              send={actionState(pending.action.name)}
              submitLabel={pending.action.confirmation?.confirmLabel ?? "Confirm"}
              save={async ({ state }) => {
                const answer = await carry(pending.action, pending.ids, state);
                return answer?.errors === undefined
                  ? {}
                  : {
                      errors: answer.errors,
                      ...(answer.payload === undefined
                        ? {}
                        : { payload: answer.payload }),
                    };
              }}
            />
          )}
        </ConfirmDialog>
      )}
      <div className="perch-list__foot">
        {pagination(page, turn)}
        {ask === undefined ? null : (
          <label className="perch-list__size">
            Rows per page
            <span className="perch-picker">
              <select
                value={String(page.perPage)}
                onChange={(event) => {
                  // Back to the first page. Page 5 of twenty-five rows is not
                  // page 5 of a hundred, and keeping the number would land the
                  // reader somewhere they did not choose — the same rule sorting
                  // and searching already follow.
                  const size = Number(event.target.value);
                  remember(page.resourcePath, { perPage: size });
                  ask({
                    ...(sort === undefined ? {} : { sort }),
                    page: 1,
                    perPage: size,
                  });
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={String(size)}>
                    {size}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </span>
          </label>
        )}
      </div>
      {/*
        The one live region on this page: it is what changes when a page is
        turned, and a second would make the two talk over each other.
      */}
      <p className="perch-list__total" role="status">
        {status(page)}
      </p>
    </Frame>
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
        <label className="perch-list__narrow">
          <span className="perch-list__narrow-name">Search</span>
          <input
            className="perch-control"
            type="search"
            name="search"
            value={state.typed}
            onChange={(event) => {
              state.setTyped(event.target.value);
            }}
          />
        </label>
      ) : null}
      {filters.map((filter) => {
        // `key` is passed on the element, never through the spread: React 19
        // warns about that and — the part that matters — does not use it, so a
        // list of controls would reconcile by position and hand a reader's
        // focus and half-typed value to a different filter when one is added.
        // The name is on a `<label>` around the control rather than on the
        // control itself: an `aria-label` names it for a screen reader and
        // leaves a row of boxes all reading "Any" for everybody else.
        const named = filter.label ?? filter.name;
        const shared = {
          className: "perch-control",
          name: filter.name,
          value: state.entered[filter.name] ?? "",
          onChange: (event: { target: { value: string } }) => {
            state.setEntered({ ...state.entered, [filter.name]: event.target.value });
          },
        };

        if (filter.type === "TextFilter") {
          return (
            <label key={filter.name} className="perch-list__narrow">
              <span className="perch-list__narrow-name">{named}</span>
              <input {...shared} type="text" />
            </label>
          );
        }
        // A choice with nothing to choose from is a control that can only be
        // put back where it started. The trashed filter is drawn the same way:
        // three states, one of which is the empty one, and nothing about it is
        // the client's to know beyond that.
        if (
          (filter.type === "SelectFilter" ||
            filter.type === "TrashedFilter" ||
            filter.type === "TernaryFilter") &&
          (filter.options?.length ?? 0) > 0
        ) {
          return (
            <label key={filter.name} className="perch-list__narrow">
              <span className="perch-list__narrow-name">{named}</span>
              <span className="perch-picker">
                <select {...shared}>
                  {/* An empty choice, or the control cannot be put back. */}
                  <option value="">Any</option>
                  {filter.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown />
              </span>
            </label>
          );
        }
        // Two ends of one value. They travel as `from..to` in a single
        // parameter, so a narrowed page stays one link a reader can send —
        // and either end may be left empty, which is what "since" and "until"
        // are. Both empty is the control put back, and an empty value is what
        // the bar drops rather than sends.
        //
        // Neither end bounds the other. `min` and `max` between them read as
        // help and are not: a reader who picks the far end first makes both
        // boxes invalid, and the bar is one form — so the browser refuses to
        // submit it and the search box and every other filter stop working
        // with it. The server already answers a range whose ends cross, with
        // the empty table that range describes.
        // A filter that carries its own form. The tree came resolved, so the
        // same renderers that draw a form draw this — a `Select` inside one
        // has its options because the server worked them out, not because the
        // bar knows anything about options.
        //
        // Its values travel one parameter per field, `filter.<name>.<path>`,
        // which is why they are kept under a dotted key here: the transport
        // puts `filter.` in front of whatever it is given.
        if (filter.type === "SchemaFilter") {
          // No tree means the server did not resolve one — nothing to draw, and
          // guessing a form from a name is not a thing a client may do.
          if (filter.schema === undefined) return null;

          const own: Record<string, unknown> = { ...filter.state };
          for (const [key, value] of Object.entries(state.entered)) {
            if (key.startsWith(`${filter.name}.`)) {
              own[key.slice(filter.name.length + 1)] = value;
            }
          }

          return (
            <fieldset key={filter.name} className="perch-list__form">
              <legend className="perch-list__narrow-name">{named}</legend>
              <SchemaRenderer
                payload={{ schema: filter.schema, state: own, errors: {} }}
                onChange={(path, value) => {
                  // Text, because a link carries text. What it means is the
                  // field's to say, on the server, where it already has to be
                  // said for a value that was forged. A value that could not be
                  // written in a link is left alone rather than sent as
                  // `[object Object]` — and the boot refuses a field that holds
                  // one, so this is the second half of a rule, not a guess.
                  const written = writable(value);
                  if (written === undefined) return;
                  state.setEntered({
                    ...state.entered,
                    [`${filter.name}.${path}`]: written,
                  });
                }}
              />
            </fieldset>
          );
        }

        const range = RANGES[filter.type];
        if (range !== undefined) {
          // Split and shown as they are. Tidying here instead — dropping a half
          // that is not yet a value — erases what a reader is halfway through
          // typing: `1.` is not a number yet and `-` is not yet anything, so a
          // decimal and a negative could not be entered at all. What the server
          // would not read is dropped once, where the answer arrives.
          const held = state.entered[filter.name] ?? "";
          // Cut at the last separator, the same way the server does: `1.` and
          // an empty far end join into `1...`, and cutting at the front takes
          // the reader's decimal point for the separator.
          const at = held.lastIndexOf("..");
          const from = at === -1 ? "" : held.slice(0, at);
          const to = at === -1 ? "" : held.slice(at + 2);
          const set = (start: string, end: string): void => {
            state.setEntered({
              ...state.entered,
              [filter.name]: start === "" && end === "" ? "" : `${start}..${end}`,
            });
          };

          return (
            <fieldset key={filter.name} className="perch-list__range">
              {/* A group with a name, because two boxes under one word is what
                  it is. Each box is named again for a screen reader, which
                  reads them one at a time and would otherwise meet two dates
                  with nothing to tell them apart. */}
              <legend className="perch-list__narrow-name">{named}</legend>
              <label className="perch-list__range-end">
                <span className="perch-visually-hidden">{named} from</span>
                <input
                  className="perch-control"
                  {...range.box}
                  value={from}
                  onChange={(event) => {
                    set(event.target.value, to);
                  }}
                />
              </label>
              <span className="perch-list__range-to" aria-hidden="true">
                –
              </span>
              <label className="perch-list__range-end">
                <span className="perch-visually-hidden">{named} to</span>
                <input
                  className="perch-control"
                  {...range.box}
                  value={to}
                  onChange={(event) => {
                    set(from, event.target.value);
                  }}
                />
              </label>
            </fieldset>
          );
        }
        // A type the renderer has no meaning for is skipped, not guessed at.
        return null;
      })}
      <button type="submit" className="perch-button">
        Apply
      </button>
    </form>
  );
}

/**
 * What the boxes start from, once an answer has arrived.
 *
 * The server says which filters it applied and with what, and a range it could
 * only half read comes back with the half it dropped left out. This does the
 * same for anything the box itself will not show, so the control never claims
 * a narrowing that never happened — and it happens here, once, rather than on
 * every render: the same tidying applied while a reader types erases `1.` on
 * the way to `1.5`.
 */
function asEntered(page: RecordsPage): Readonly<Record<string, string>> {
  const applied = page.filters ?? {};
  const shapes = new Map(
    page.columns.filters.map((filter) => [filter.name, RANGES[filter.type]?.holds]),
  );

  return Object.fromEntries(
    Object.entries(applied).map(([name, value]) => {
      const holds = shapes.get(name);
      if (holds === undefined) return [name, value];

      const at = value.lastIndexOf("..");
      if (at === -1) return [name, ""];
      const half = (part: string): string =>
        holds.test(part.trim()) ? part.trim() : "";
      return [name, `${half(value.slice(0, at))}..${half(value.slice(at + 2))}`];
    }),
  );
}

/** A field's value as a link can carry it, or nothing where it cannot. */
function writable(value: unknown): string | undefined {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : undefined;
}

/**
 * The filters drawn as two boxes, and what each box takes.
 *
 * A number is a text box with a numeric keypad rather than `type="number"`,
 * which is the decision a text field already made here: spinners, silent
 * locale parsing and a scroll-wheel trap. It also keeps the bar submitting —
 * a number input holds `1e` as an empty value it calls bad input, which makes
 * it `:invalid`, and one invalid box in this form stops every filter in it.
 *
 * `holds` is what a box will show. An end the server dropped has to leave the
 * box empty rather than sit in it, or the control claims a narrowing that was
 * never applied.
 */
const RANGES: Readonly<
  Record<
    string,
    {
      readonly holds: RegExp;
      readonly box: Readonly<Record<string, string>>;
    }
  >
> = {
  DateRangeFilter: { holds: /^\d{4}-\d{2}-\d{2}$/, box: { type: "date" } },
  NumberRangeFilter: {
    holds: /^-?\d+(?:\.\d+)?$/,
    box: { type: "text", inputMode: "decimal" },
  },
};

/**
 * What the table says when it has nothing to show.
 *
 * The plainest words it has are the fallback, and they are the right fallback:
 * "Nothing to show" is true and short. This is for the tables where the reason
 * matters — nothing yet, nothing matching, nothing this reader may see — which
 * is the difference between an empty page and a page that looks broken.
 */
function EmptyState({
  heading,
  description,
  icon,
  actions,
  page,
}: {
  readonly heading?: string;
  readonly description?: string;
  readonly icon?: string;
  readonly actions?: readonly string[];
  readonly page: RecordsPage;
}): ReactNode {
  return (
    <>
      {/* Decoration beside the words, never instead of them: hidden from a
          screen reader, which already has the sentence. */}
      <IconMark name={icon} className="perch-table__empty-icon" />
      {heading === undefined ? null : (
        <p className="perch-table__empty-heading">{heading}</p>
      )}
      {description === undefined ? null : <p>{description}</p>}
      {/* The header's own actions, offered again where the reader is looking.
          Named rather than declared here, so nothing is authorised twice: what
          is drawn is what the header was already going to draw for them, and a
          reader who may not create gets no button because a table asked for
          one. */}
      {headerActions(page, actions)}
    </>
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
/**
 * What a reader may set the page size to.
 *
 * A short list rather than a number they type: the point is to see more or less
 * at once, and a box accepting 7 or 4000 offers a choice nobody wants and a
 * query somebody's database does not.
 */
const PAGE_SIZES = [10, 25, 50, 100] as const;

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
 * The actions this row can be given.
 *
 * A restore belongs on a marked row and a delete on a live one. Offered on the
 * other, each is a button a reader presses to no effect: the port answers that
 * nothing moved, and the page comes back looking the same.
 *
 * By type rather than by a flag on the wire, because these two are the panel's
 * own and their meaning is not the author's to change. An action nobody here
 * has heard of is offered on every row.
 */
function offered(page: RecordsPage, row: Row): readonly ActionNode[] {
  const key = row[page.recordKey];
  const marked =
    (key === undefined ? false : page.deleted?.some((one) => one === key)) === true;

  // The server says which rows each action means anything on. This used to be
  // a list of two kept here, which is a list that goes wrong on the third
  // action to need it — and being wrong means drawing a button that the route
  // refuses when it is pressed.
  const suits = (action: ActionNode): boolean => {
    if (action.actsOn === "marked") return marked;
    if (action.actsOn === "live") return !marked;
    return true;
  };

  return page.columns.actions.flatMap((action) => {
    // A group has no `actsOn` of its own — it is not the thing that acts. So
    // the question goes to what it holds, or grouping an action would be a way
    // of getting it drawn on a row the route refuses it for.
    if (action.trigger !== "group") return suits(action) ? [action] : [];

    // A group left holding nothing is dropped where it is drawn rather than
    // here: the menu already turns away one whose items all render to nothing,
    // and two guards for one rule is one that stops being read.
    return [{ ...action, children: (action.children ?? []).filter(suits) }];
  });
}

/**
 * How the action asked its modal to open.
 *
 * Spread rather than passed one by one, so an action that said nothing about
 * either sends nothing at all and the dialog keeps the width its content
 * implies.
 */
function modalOf(action: ActionNode): { width?: ModalWidth; slideOver?: boolean } {
  return {
    ...(action.modalWidth === undefined ? {} : { width: action.modalWidth }),
    ...(action.slideOver === true ? { slideOver: true } : {}),
  };
}

/** Which page of a row an action leads to, as a path suffix. */
const SUFFIX: Readonly<Record<string, string>> = { edit: "/edit", view: "" };

/**
 * The address of one row's page, for the action asking.
 *
 * Built from what the server sent — the key's name, the path its pages live
 * under, and which page this action leads to — rather than from a convention.
 * A model keyed on `uuid` is addressed by `uuid`, and a panel behind a prefix
 * keeps it.
 *
 * A link whose page this does not know gets no address, so it draws nothing
 * rather than a link that goes somewhere wrong.
 */
function href(page: RecordsPage, action: ActionNode, row: Row): string | undefined {
  if (page.resourcePath === undefined || action.page === undefined) return undefined;
  const suffix = SUFFIX[action.page];
  if (suffix === undefined) return undefined;
  const key = row[page.recordKey];
  if (typeof key !== "string" && typeof key !== "number") return undefined;
  return `${page.resourcePath}/${encodeURIComponent(String(key))}${suffix}`;
}

/**
 * What the table offers as a whole. `CreateAction` is a link to the create page
 * (navigation), and an action the renderer has no meaning for is skipped rather
 * than drawn — the same rule the row actions follow.
 */
function headerActions(page: RecordsPage, only?: readonly string[]): ReactNode {
  const path = page.resourcePath;
  if (path === undefined) return null;
  // Nothing asked for is nothing drawn, which is what an empty state that
  // named no action means. The header itself passes nothing and gets them all.
  if (only !== undefined && only.length === 0) return null;

  // Built before it is wrapped: a table whose only header action is one the
  // renderer skips would otherwise leave an empty element in the header.
  const links = page.columns.headerActions
    .filter((action) => only === undefined || only.includes(action.name))
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

/**
 * What to say when the action itself said nothing.
 *
 * Both counts, because either alone would mislead: "3 records" hides that two
 * were turned down, and "2 refused" hides that three went through. Never why
 * they were refused — the server does not say, and inventing a reason here
 * would be worse than the silence.
 *
 * Nothing done and nothing refused is its own answer. It used to fall into the
 * first branch and read `Done: 0 records.`, which is a success notice for
 * something that did not happen — restoring a row that was never deleted, or
 * one that moved between the tick and the press.
 */
function describeOutcome(answer: { processed: number; refused: number }): string {
  const done = `${String(answer.processed)} ${plural(answer.processed, "record")}`;
  const refused = `${String(answer.refused)} ${plural(answer.refused, "record")}`;

  if (answer.processed === 0 && answer.refused === 0) return "Nothing changed.";
  if (answer.refused === 0) return `Done: ${done}.`;
  if (answer.processed === 0) return `Nothing changed: ${refused} could not be.`;
  return `Done: ${done}. ${String(answer.refused)} could not be.`;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/**
 * A name for one thing the reader asked for.
 *
 * `randomUUID` where the platform has it — every browser this panel targets
 * does, over HTTPS or localhost — and something unique enough where it does
 * not. It names an intent within one minute on one server; it is not a secret
 * and nothing is decided by it.
 */
function newIntent(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return (
    crypto?.randomUUID?.() ??
    `${String(Date.now())}-${Math.random().toString(36).slice(2)}`
  );
}
