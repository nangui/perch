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
import { PanelForm } from "./PanelForm.js";
import { registerBuiltInComponents } from "./renderers.js";
import type { Snapshot, StateRequest, StateResponse } from "./transport.js";
import "./styles.css";

/** The contract with the HTML shell. Changing it is a manifest version bump. */
const MOUNT_ID = "perch-panel";

export function mount(element: HTMLElement): void {
  const api = element.dataset["api"];
  const payload = element.dataset["payload"];
  if (api === undefined || payload === undefined) {
    throw new Error(
      `#${MOUNT_ID} needs data-api and data-payload. The shell rendered by PanelModule sets both.`,
    );
  }

  registerBuiltInComponents();
  createRoot(element).render(
    <PanelForm
      initial={JSON.parse(payload) as SchemaPayload}
      send={(request) => send(api, request)}
      renderFailure={renderFailure}
    />,
  );
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

async function send(api: string, request: StateRequest): Promise<StateResponse> {
  const response = await fetch(`${api}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    credentials: "same-origin",
  });
  // A failure has to reach the user rather than resolve to nothing: PanelForm
  // renders whatever `renderFailure` is given, and cannot show what it is
  // not told (ARCH 13 §5).
  if (!response.ok) throw new Error(`/state answered ${String(response.status)}`);
  return (await response.json()) as StateResponse;
}

const element = document.getElementById(MOUNT_ID);
if (element !== null) mount(element);
