/**
 * The panel's entry point in the browser — ADR 0009.
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
import { createRoot } from "react-dom/client";
import type { FormState, SchemaPayload } from "@perchjs/core";
import { Breadcrumb } from "./Breadcrumb.js";
import type { SearchedOption, UploadedFile } from "./node-props.js";
import { PanelForm } from "./PanelForm.js";
import type { NavigationGroup } from "./PanelNav.js";
import { PanelNav } from "./PanelNav.js";
import type { PageRequest, RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";
import { registerBuiltInColumns } from "./columns.js";
import { registerBuiltInComponents } from "./renderers.js";
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
    createRoot(element).render(
      <div className="perch-shell">
        {menu}
        <PanelList
          initial={JSON.parse(payload) as RecordsPage}
          title={title}
          fetchPage={(request) => records(api, request)}
          onPage={remember}
        />
      </div>,
    );
    return;
  }

  createRoot(element).render(
    <div className="perch-shell">
      {menu}
      <div className="perch-shell__main">
        <Breadcrumb
          {...(listPath === undefined ? {} : { listPath })}
          {...(listLabel === undefined ? {} : { listLabel })}
          current={title}
        />
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
        />
      </div>
    </div>,
  );
}

/**
 * A create leaves the page it was made on, and the server says where to. The
 * transport does not know about the browser, so the navigation happens here.
 */
function goWhereTheServerSays(response: SaveResponse): void {
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
): Promise<StateResponse> {
  const response = await fetch(`${api}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...request,
      operation,
      ...(id === undefined ? {} : { id }),
    }),
    credentials: "same-origin",
  });
  // A failure has to reach the user rather than resolve to nothing: PanelForm
  // renders whatever `renderFailure` is given, and cannot show what it is not
  // told.
  if (!response.ok) throw new Error(`/state answered ${String(response.status)}`);

  // The route answers with the tree itself (ADR 0010); the client's envelope
  // has room for more than that, so the wrapping happens here rather than on
  // the wire.
  return { payload: (await response.json()) as SchemaPayload };
}

const element = document.getElementById(MOUNT_ID);
if (element !== null) mount(element);

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
