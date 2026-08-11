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
import type { SchemaPayload } from "@perchjs/core";
import { Breadcrumb } from "./Breadcrumb.js";
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

  const response = await fetch(`${api}/records?${query.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`/records answered ${String(response.status)}`);
  return (await response.json()) as RecordsPage;
}

/** A menu the shell did not send is no menu, not a broken one. */
function groupsOf(raw: string | undefined): readonly NavigationGroup[] {
  if (raw === undefined) return [];
  return JSON.parse(raw) as readonly NavigationGroup[];
}
