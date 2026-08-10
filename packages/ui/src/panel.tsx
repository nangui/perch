/**
 * The panel's entry point in the browser — ADR 0009.
 *
 * This file is never imported. It is the entry of the second, self-contained
 * bundle `PanelModule` serves: React, ReactDOM, Radix and the renderer are
 * inlined here, because a browser cannot resolve a bare specifier and the
 * product promise is that nobody configures a bundler (ARCH 13 §8).
 *
 * Everything it needs comes off the mount element, so the bundle hardcodes no
 * path and the same file works under any `setGlobalPrefix` (PRD 04 §4).
 */
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { SchemaPayload } from "@perchjs/core";
import { Breadcrumb } from "./Breadcrumb.js";
import { PanelForm } from "./PanelForm.js";
import type { RecordsPage } from "./PanelList.js";
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

  registerBuiltInComponents();
  registerBuiltInColumns();

  if (operation === "list") {
    createRoot(element).render(
      <PanelList
        initial={JSON.parse(payload) as RecordsPage}
        title={title}
        fetchPage={(sort) => records(api, sort)}
      />,
    );
    return;
  }

  createRoot(element).render(
    <>
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
    </>,
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
 * stops answering — ARCH 13 §5 asks for the opposite. `role="alert"` because
 * the failure appears while focus is in the field the user is still typing in.
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
  // renders whatever `renderFailure` is given, and cannot show what it is
  // not told (ARCH 13 §5).
  if (!response.ok) throw new Error(`/state answered ${String(response.status)}`);

  // The route answers with the tree itself (ADR 0010); the client's envelope
  // has room for more than that, so the wrapping happens here rather than on
  // the wire.
  return { payload: (await response.json()) as SchemaPayload };
}

const element = document.getElementById(MOUNT_ID);
if (element !== null) mount(element);

/**
 * Asks for a page in a given order.
 *
 * The sort travels as `path:direction`, which is the shape `records-query.ts`
 * reads — and it is checked there against what the columns declared, so a
 * client that invents one is refused rather than obeyed.
 *
 * No page number, because there is nothing to turn one with: `.paginated()`
 * from PRD 07 §3 is not built, so the table is always the server's first page.
 * Sending one from here would be a control nobody can reach.
 */
async function records(api: string, sort: { path: string; direction: string }) {
  const url = `${api}/records?sort=${encodeURIComponent(`${sort.path}:${sort.direction}`)}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`/records answered ${String(response.status)}`);
  return (await response.json()) as RecordsPage;
}
