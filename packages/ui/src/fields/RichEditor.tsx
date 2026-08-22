/**
 * `RichEditor` — the field, minus the editor.
 *
 * The editing surface is a dynamic import so ProseMirror lands in a chunk of
 * its own, fetched by the pages that have one on them and by no others. What
 * is left here is what has to be in the main bundle: the frame, and something
 * to show while the chunk is on its way.
 */
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import type { FieldStatus } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import type { RichDocument, Tool } from "./rich-document.js";

export interface RichEditorProps {
  readonly value: RichDocument | null;
  readonly onValueChange: (value: RichDocument | null) => void;
  readonly toolbar: readonly Tool[];
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  readonly label: string;
}

const Surface = lazy(async () => {
  const module = await import("./RichEditorSurface.js");
  return { default: module.RichEditorSurface };
});

export function RichEditor(props: RichEditorProps): ReactNode {
  return (
    <Suspense
      fallback={
        // The height a resting editor takes, so the page does not jump when the
        // chunk lands — the same promise the field shell makes about its own
        // help line.
        <div className="perch-rich perch-rich--waiting" aria-busy="true">
          <span className="perch-visually-hidden">Loading the editor</span>
        </div>
      }
    >
      <Surface {...props} />
    </Suspense>
  );
}
