/**
 * The View page: a resolved tree, drawn once.
 *
 * No store, no client, no round trip and no submit — an infolist has no state
 * to send back, so there is nothing here for any of them to carry. What looks
 * like a missing feature is the decision: the moment this page depends on
 * something the reader does, it is a form.
 */
import type { ReactNode } from "react";
import type { SchemaPayload } from "@perchjs/core";
import { SchemaRenderer } from "./SchemaRenderer.js";

export interface PanelViewProps {
  readonly payload: SchemaPayload;
}

/** Nothing on this page changes anything, and an entry never asks to. */
function unchanged(): void {
  /* deliberately empty */
}

export function PanelView({ payload }: PanelViewProps): ReactNode {
  return (
    <div className="perch-view">
      <SchemaRenderer payload={payload} onChange={unchanged} />
    </div>
  );
}
