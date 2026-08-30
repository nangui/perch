/**
 * The panel's entry point in the browser.
 *
 * This file is never imported. It is the entry of the second, self-contained
 * bundle `PanelModule` serves: React, ReactDOM, Radix and the renderer are
 * inlined here, because a browser cannot resolve a bare specifier and the
 * product promise is that nobody configures a bundler.
 *
 * Everything it needs comes off the mount element, so the bundle hardcodes no
 * path and the same file works under any `setGlobalPrefix`.
 */
import type { ReactNode } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { FormState, SchemaPayload } from "@perchjs/core";
import { Breadcrumb } from "./Breadcrumb.js";
import type { CreatedOption, SearchedOption, UploadedFile } from "./node-props.js";
import { PanelForm } from "./PanelForm.js";
import { PanelView } from "./PanelView.js";
import { keepFlash, takeFlash } from "./flash.js";
import type { NavigationGroup } from "./PanelNav.js";
import { PanelNav } from "./PanelNav.js";
import type { ActionAnswer, PageRequest, RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";
import type { ManagedRelation } from "./PanelRelations.js";
import { PanelRelations } from "./PanelRelations.js";
import { registerBuiltInColumns } from "./columns.js";
import { registerBuiltInComponents } from "./renderers.js";
import { registerComponent } from "./registry.js";
import type {
  SaveRequest,
  SaveResponse,
  Snapshot,
  StateRequest,
  StateResponse,
} from "./transport.js";
import "./styles.css";

/** The contract with the HTML shell. Changing it is a manifest version bump. */
const MOUNT_ID = "perch-panel";

export function mount(element: HTMLElement): void {
  const api = element.dataset["api"];
  const payload = element.dataset["payload"];
  const operation = element.dataset["operation"];
  if (api === undefined || payload === undefined || operation === undefined) {
    throw new Error(
      `#${MOUNT_ID} needs data-api, data-operation and data-payload. ` +
        `The shell rendered by PanelModule sets all three.`,
    );
  }
  const id = element.dataset["id"];
  const title = element.dataset["title"] ?? "";
  const listPath = element.dataset["listPath"];
  const listLabel = element.dataset["listLabel"];
  const navigation = element.dataset["navigation"];

  registerBuiltInComponents();
  registerBuiltInColumns();

  const menu = <PanelNav groups={groupsOf(navigation)} />;

  if (operation === "list") {
    // Read once, on the way in. Whatever was said on the page that sent the
    // reader here, said here instead.
    const flash = takeFlash();
    createRoot(element).render(
      <div className="perch-shell">
        {menu}
        <PanelList
          initial={JSON.parse(payload) as RecordsPage}
          title={title}
          {...(flash === undefined ? {} : { flash })}
          fetchPage={(request) => records(api, request)}
          runAction={(name, ids, data, key) => runAction(api, name, ids, data, key)}
          writeCell={(id, path, value) => writeCell(api, id, path, value)}
          actionForm={(name, ids) => actionForm(api, name, ids)}
          actionContent={(name, ids) => actionContent(api, name, ids)}
          actionState={(name) => (request) =>
            send(api, "create", undefined, request, name)
          }
          onPage={remember}
        />
      </div>,
    );
    return;
  }

  // The trail, the heading and the shell are the same on both: what differs is
  // whether the page can be changed.
  const framed = (body: ReactNode): ReactNode => (
    <div className="perch-shell">
      {menu}
      <div className="perch-shell__main">
        <Breadcrumb
          {...(listPath === undefined ? {} : { listPath })}
          {...(listLabel === undefined ? {} : { listLabel })}
          current={title}
        />
        {/* The list page names itself. A form page had only the trail that led
            to it, which says where you came from but not what you are on. */}
        <h1 className="perch-page__title">{title}</h1>
        {body}
      </div>
    </div>
  );

  // Read once and drawn once. No store to create, because there is no state to
  // keep and nothing to send back.
  if (operation === "view") {
    createRoot(element).render(
      framed(<PanelView payload={JSON.parse(payload) as SchemaPayload} />),
    );
    return;
  }

  // The relation managers, if this record has any. Under the form rather than
  // beside it: they are about the record the form edits, and there is nothing
  // to scope them by until it has been written.
  const managed = relationsOf(element.dataset["relations"]);
  const under = (relation: string): string =>
    `${api}/${encodeURIComponent(id ?? "")}/relations/${encodeURIComponent(relation)}`;

  createRoot(element).render(
    framed(
      <>
        <PanelForm
          initial={JSON.parse(payload) as SchemaPayload}
          send={(request) => send(api, operation, id, request)}
          save={(request) => save(api, operation, id, request)}
          onSaved={goWhereTheServerSays}
          renderFailure={renderFailure}
          searchOptions={(path, term, state) =>
            askOptions(api, operation, id, path, term, state)
          }
          uploadFile={(path, file, state) => sendFile(api, id, path, file, state)}
          optionForm={(path, data, state) =>
            askOptionForm(api, operation, id, path, data, state)
          }
          createOption={(path, data, state) =>
            makeOption(api, operation, id, path, data, state)
          }
        />
        {managed.length === 0 || id === undefined ? null : (
          <PanelRelations
            relations={managed}
            // The same four transports the list page uses, pointed at the
            // manager's own routes. That the base changes and nothing else is
            // what the addresses were shaped for.
            fetchPage={(relation, request) => records(under(relation), request)}
            runAction={(relation, name, ids, data, key) =>
              runAction(under(relation), name, ids, data, key)
            }
            actionForm={(relation, name, ids) => actionForm(under(relation), name, ids)}
            actionState={(relation, name) => (request) =>
              send(under(relation), "create", undefined, request, name)
            }
            // The manager's own form: opened, taken round trips, and written.
            // No action name, which is what tells the routes which schema.
            childForm={(relation, childId) => askChildForm(under(relation), childId)}
            childState={(relation, childId) => (request) =>
              send(
                under(relation),
                childId === undefined ? "create" : "edit",
                childId,
                request,
              )
            }
            uploadChildFile={(relation, childId, path, file, state) =>
              sendFile(under(relation), childId, path, file, state)
            }
            saveChild={(relation, childId, state) =>
              save(
                under(relation),
                childId === undefined ? "create" : "edit",
                childId,
                { state },
              )
            }
            detachChild={(relation, ids) => detach(under(relation), ids)}
          />
        )}
      </>,
    ),
  );
}

/**
 * The form a manager opens, resolved against this reader.
 *
 * Asked for rather than shipped with the tab, for the same reason an action's
 * modal is: a schema means nothing until it has been resolved, and the row it
 * is filled from is checked against the parent on the way.
 */
async function askChildForm(base: string, childId?: string): Promise<SchemaPayload> {
  const response = await fetch(`${base}/form`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(childId === undefined ? {} : { childId }),
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`/form answered ${String(response.status)}`);
  return (await response.json()) as SchemaPayload;
}

/** The managers the shell named, or none. A malformed attribute is none. */
function relationsOf(raw: string | undefined): readonly ManagedRelation[] {
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as readonly ManagedRelation[]) : [];
  } catch {
    return [];
  }
}

/**
 * A create leaves the page it was made on, and the server says where to. The
 * transport does not know about the browser, so the navigation happens here.
 */
function goWhereTheServerSays(response: SaveResponse): void {
  // Kept before the navigation, not after: `assign` does not come back.
  if (response.notification !== undefined) keepFlash(response.notification);
  if (response.redirect !== undefined) globalThis.location.assign(response.redirect);
}

/**
 * A create posts to the collection; an edit patches the row it names. The shell
 * says which, because only the server knows what the page was opened for.
 */
async function save(
  api: string,
  operation: string,
  id: string | undefined,
  request: SaveRequest,
): Promise<SaveResponse> {
  const editing = operation === "edit" && id !== undefined;
  const response = await fetch(editing ? `${api}/${encodeURIComponent(id)}` : api, {
    method: editing ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    credentials: "same-origin",
  });

  if (!response.ok) throw new Error(`save answered ${String(response.status)}`);
  return (await response.json()) as SaveResponse;
}

/**
 * Without this, `PanelForm` renders nothing on a failure and the form silently
 * stops answering, which is the opposite of what is asked. `role="alert"`
 * because the failure appears while focus is in the field the user is still
 * typing in.
 */
function renderFailure(_: Snapshot, retry: () => void): ReactNode {
  return (
    <div className="perch-notice" role="alert">
      <span>Could not reach the server. Your changes are still here.</span>
      <button type="button" className="perch-button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}

/**
 * The round trip carries what the page was opened for. The transport knows
 * about ordering, not about the protocol, so the operation is merged in here
 * rather than threaded through it.
 */
async function send(
  api: string,
  operation: string,
  id: string | undefined,
  request: StateRequest,
  action?: string,
): Promise<StateResponse> {
  const response = await fetch(`${api}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...request,
      operation,
      ...(id === undefined ? {} : { id }),
      // Names a modal's schema. Absent, the route resolves the resource's own
      // form, which is what every other caller of this wants.
      ...(action === undefined ? {} : { action }),
    }),
    credentials: "same-origin",
  });
  // A failure has to reach the user rather than resolve to nothing: PanelForm
  // renders whatever `renderFailure` is given, and cannot show what it is not
  // told.
  if (!response.ok) throw new Error(`/state answered ${String(response.status)}`);

  // The route answers with the tree itself; the client's envelope
  // has room for more than that, so the wrapping happens here rather than on
  // the wire.
  return { payload: (await response.json()) as SchemaPayload };
}

/**
 * What a renderer written outside this bundle reaches for.
 *
 * A component nobody here wrote arrives as a type string like any other, and
 * the registry has always been keyed by that string. What it had no way to do
 * was register: this file is a bundle an application does not import, so the
 * call has to be reachable without one — which is what a global is for, and the
 * only thing this bundle puts on `window`.
 *
 * `createElement` rides with it because a renderer with no bundler has no JSX,
 * and one that brought its own React would have two copies and no hooks.
 */
declare global {
  interface Window {
    perch?: PerchGlobal;
  }
}

/**
 * Versioned like the manifest and for the same reason.
 *
 * A plugin compiles against this object and nothing else, so renaming a key on
 * it breaks every plugin at once — silently, at run time, in somebody else's
 * deployment. The number is what a plugin checks before it trusts the rest, and
 * bumping it is what says the check should fail.
 */
export interface PerchGlobal {
  readonly version: number;
  readonly registerComponent: typeof registerComponent;
  readonly createElement: typeof createElement;
}

/** Bumped whenever a key here is renamed, removed, or changes meaning. */
export const PANEL_GLOBAL_VERSION = 1;

export const PERCH_GLOBAL: PerchGlobal = {
  version: PANEL_GLOBAL_VERSION,
  registerComponent,
  createElement,
};

window.perch = PERCH_GLOBAL;

/**
 * Mounted once every deferred script has run, not at the end of this one.
 *
 * A module script registering a renderer is deferred like this one and executes
 * after it, so mounting here drew the page before anything else could say what
 * it draws. `DOMContentLoaded` is the first moment they have all finished —
 * and it has already fired if this bundle was loaded some other way.
 */
function start(): void {
  const element = document.getElementById(MOUNT_ID);
  if (element !== null) mount(element);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

/**
 * Sends a file the reader chose, and answers with what was staged.
 *
 * Multipart, which is why this is not the state protocol: the form's state
 * rides along as one JSON field so the server can resolve the tree the reader
 * is actually looking at, and the bytes ride beside it rather than through it.
 *
 * A refusal carries the server's own words. It knows the limit and the types,
 * and "that file is 2000 bytes, and the limit is 1000" is worth more to
 * somebody choosing another file than anything this side could invent.
 */
async function sendFile(
  api: string,
  id: string | undefined,
  path: string,
  file: File,
  state: FormState,
): Promise<UploadedFile> {
  const form = new FormData();
  form.set("path", path);
  form.set("state", JSON.stringify(state));
  if (id !== undefined) form.set("id", id);
  form.set("file", file);

  const response = await fetch(`${api}/upload`, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });

  if (!response.ok) {
    const said: unknown = await response.json().catch(() => undefined);
    const message =
      typeof said === "object" && said !== null && "message" in said
        ? String(said.message)
        : `The upload answered ${String(response.status)}`;
    throw new Error(message);
  }

  return ((await response.json()) as { file: UploadedFile }).file;
}

/**
 * Asks what a searchable field may be set to.
 *
 * The state travels with the term because the server resolves the form before
 * it answers: whether the field is there, and whether the reader may use it,
 * are decisions it makes from the state rather than trusts the client about.
 *
 * A failure raises rather than resolving to nothing. An empty list is a real
 * answer — "nothing matched" — and returning one for a request that never
 * arrived would tell the reader their search worked.
 */
/**
 * Asks for the dialog a select opens to make an option, and sends it back.
 *
 * Two moments, one route. The schema is resolved against whatever the dialog
 * holds, so asking with nothing in it opens the dialog and asking with its
 * values in it is the round trip a dependent field inside it needs — the same
 * resolution both times, which is the point of not having two.
 *
 * The host form's state travels too, because which field this is, and whether
 * this reader may touch it, are decisions the server makes from that state
 * rather than trusts the client about.
 */
/**
 * Takes rows off a record, leaving them where they are.
 *
 * The parent is in the address and the rows are in the body, which is the
 * division every manager route makes: the record being edited is not the
 * request's to choose, and what is being taken off it is exactly the choice.
 */
async function detach(base: string, ids: readonly (string | number)[]): Promise<void> {
  const response = await fetch(`${base}/detach`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
    credentials: "same-origin",
  });
  // Raised rather than swallowed: a row still on screen after a detach that
  // failed is a page telling the reader the opposite of what happened.
  if (!response.ok) throw new Error(`/detach answered ${String(response.status)}`);
}

async function askOptionForm(
  api: string,
  operation: string,
  id: string | undefined,
  path: string,
  data: Record<string, unknown>,
  state: FormState,
): Promise<SchemaPayload> {
  const response = await fetch(`${api}/options/form`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      state,
      operation,
      path,
      data,
      ...(id === undefined ? {} : { id }),
    }),
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`/options/form answered ${String(response.status)}`);
  }
  return (await response.json()) as SchemaPayload;
}

/** The write, which answers with the option or with what stopped it. */
async function makeOption(
  api: string,
  operation: string,
  id: string | undefined,
  path: string,
  data: Record<string, unknown>,
  state: FormState,
): Promise<CreatedOption> {
  const response = await fetch(`${api}/options/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      state,
      operation,
      path,
      data,
      ...(id === undefined ? {} : { id }),
    }),
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`/options/create answered ${String(response.status)}`);
  }
  return (await response.json()) as CreatedOption;
}

async function askOptions(
  api: string,
  operation: string,
  id: string | undefined,
  path: string,
  term: string,
  state: FormState,
): Promise<readonly SearchedOption[]> {
  const response = await fetch(`${api}/options`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      state,
      operation,
      path,
      term,
      ...(id === undefined ? {} : { id }),
    }),
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`/options answered ${String(response.status)}`);

  return ((await response.json()) as { options: readonly SearchedOption[] }).options;
}

/**
 * Asks for a page, in an order and at a number.
 *
 * Both travel as query parameters — the sort as `path:direction`, which is the
 * shape `records-query.ts` reads. Both are checked there against what the
 * columns declared and against the paging depth, so a client that invents
 * either is refused rather than obeyed, and the answer says what it got.
 */
async function records(api: string, request: PageRequest): Promise<RecordsPage> {
  const query = new URLSearchParams();
  if (request.sort !== undefined) {
    query.set("sort", `${request.sort.path}:${request.sort.direction}`);
  }
  if (request.page !== undefined) query.set("page", String(request.page));
  if (request.perPage !== undefined) query.set("perPage", String(request.perPage));
  if (request.search !== undefined) query.set("search", request.search);
  for (const [name, value] of Object.entries(request.filters ?? {})) {
    query.set(`filter.${name}`, value);
  }

  const response = await fetch(`${api}/records?${query.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`/records answered ${String(response.status)}`);

  return (await response.json()) as RecordsPage;
}

/**
 * Flipping a switch in a table.
 *
 * One path and one value. Which columns may be written, by whom, and what the
 * value has to be are all the server's, which is why this sends so little and
 * reads the answer rather than assuming it.
 */
async function writeCell(
  api: string,
  id: string | number,
  path: string,
  value: unknown,
): Promise<{ value: unknown; notification?: ActionAnswer["notification"] }> {
  const response = await fetch(`${api}/${encodeURIComponent(String(id))}/cell`, {
    method: "PATCH",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ path, value }),
  });
  if (!response.ok) throw new Error("That did not work. Nothing was changed.");
  return (await response.json()) as {
    value: unknown;
    notification?: ActionAnswer["notification"];
  };
}

/**
 * Pressing a button.
 *
 * The name and the selection, and nothing else. What the action does, who may
 * do it and to which rows are all settled on the server, which is why this
 * sends so little.
 */
async function runAction(
  api: string,
  name: string,
  ids: readonly (string | number)[],
  data?: FormState,
  idempotencyKey?: string,
): Promise<ActionAnswer> {
  const response = await fetch(`${api}/actions/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      ids,
      ...(data === undefined ? {} : { data }),
      // Names the intent rather than the request, so a retry of the same
      // intent is recognised and a second press is not.
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    }),
  });
  if (!response.ok) {
    // Only the one status this route phrases on purpose: a selection past the
    // ceiling says something a reader can act on. Every other status carries a
    // reason phrase written for a protocol — a refusal reads "Not Found",
    // which tells somebody looking at a row that it is not there.
    if (response.status === 422) {
      const said = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (typeof said?.message === "string") throw new Error(said.message);
    }
    throw new Error("That did not work. Nothing was changed.");
  }
  return (await response.json()) as ActionAnswer;
}

/**
 * What a modal shows, resolved against this reader.
 *
 * Asked for on opening rather than shipped with the table: a schema means
 * nothing until it has been resolved, and the same refusals the run goes
 * through are asked here — learning you may not act before filling a form in
 * is the only kindness left.
 */
/**
 * What a view opened in place shows.
 *
 * Its own route rather than the form's with an argument: the two are different
 * questions of the server, and only one of them is about something that will
 * be carried out.
 */
async function actionContent(
  api: string,
  name: string,
  ids: readonly (string | number)[],
): Promise<SchemaPayload> {
  const response = await fetch(`${api}/actions/${encodeURIComponent(name)}/content`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error("That could not be shown.");
  return (await response.json()) as SchemaPayload;
}

async function actionForm(
  api: string,
  name: string,
  ids: readonly (string | number)[],
): Promise<SchemaPayload> {
  const response = await fetch(`${api}/actions/${encodeURIComponent(name)}/form`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error("That did not work. Nothing was changed.");
  return (await response.json()) as SchemaPayload;
}

/**
 * The address says what is on screen, so reloading it comes back to the same
 * place and sending it to somebody shows them the same thing.
 *
 * Written from the answer rather than from the request, for the reason the
 * controls are: the server caps the paging depth and drops a sort it never
 * declared, so an address built from what was asked can name a page that was
 * never served.
 *
 * Called by `PanelList` for the answer it accepted, never from the fetch: two
 * requests can be in flight, and the one that lands last is not always the one
 * the reader is on. Written from the fetch, an overtaken answer left the table
 * showing one page and the address naming another.
 *
 * `replaceState`, not `pushState`: turning a page would otherwise stack history
 * entries that Back walks through without redrawing anything, since nothing
 * here listens for `popstate`. An address that lies about the page under it is
 * worse than a Back button that leaves the list.
 *
 * Anything else already in the query is left alone — a search or a filter, once
 * either exists, is nobody's business here.
 */
function remember(page: RecordsPage): void {
  const query = new URLSearchParams(globalThis.location.search);

  if (page.search === undefined || page.search === "") query.delete("search");
  else query.set("search", page.search);

  // Every filter the address carries is replaced by what the answer applied:
  // one the server declined has to leave, or reloading would ask for it again.
  for (const key of [...query.keys()]) {
    if (key.startsWith("filter.")) query.delete(key);
  }
  for (const [name, value] of Object.entries(page.filters ?? {})) {
    query.set(`filter.${name}`, value);
  }

  if (page.sort === undefined) query.delete("sort");
  else query.set("sort", `${page.sort.path}:${page.sort.direction}`);

  // The first page is what an address with no page means, so it says nothing.
  if (page.page <= 1) query.delete("page");
  else query.set("page", String(page.page));

  const search = query.toString();
  globalThis.history.replaceState(
    null,
    "",
    `${globalThis.location.pathname}${search === "" ? "" : `?${search}`}`,
  );
}

/** A menu the shell did not send is no menu, not a broken one. */
function groupsOf(raw: string | undefined): readonly NavigationGroup[] {
  if (raw === undefined) return [];
  return JSON.parse(raw) as readonly NavigationGroup[];
}
