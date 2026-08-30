/**
 * The row that is not in the list yet, made without leaving the form.
 *
 * A reader filling in a person and finding their team missing has two bad ways
 * out otherwise: abandon what they have typed to go and create it, or pick the
 * wrong one. This is the third, and it is deliberately the same machinery as
 * every other form — `PanelForm` in a dialog, talking to the same cycle, so a
 * dependent field, a validation message and a file all work in here because
 * nothing about them is special-cased.
 *
 * The schema is fetched when the dialog opens rather than carried by the page.
 * A form serialised into every page that might open one is a form resolved for
 * a reader who never asked, and resolved at a moment that has passed.
 */
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SchemaPayload } from "@perchjs/core";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { PanelForm } from "../PanelForm.js";
import type { CreatedOption } from "../node-props.js";
import type { StateRequest, StateResponse } from "../transport.js";

export interface CreateOptionProps {
  /** What the button is for: the field's own label, in a sentence. */
  readonly label: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly askForm: () => Promise<SchemaPayload>;
  readonly resolve: (request: StateRequest) => Promise<StateResponse>;
  readonly submit: (data: Record<string, unknown>) => Promise<CreatedOption>;
}

export function CreateOption({
  label,
  open,
  onClose,
  askForm,
  resolve,
  submit,
}: CreateOptionProps): ReactNode {
  const [schema, setSchema] = useState<SchemaPayload | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  // Held rather than depended on. Every capability reaching this component is
  // an arrow rebuilt on each render, so an effect that named `askForm` would
  // run again every time the page behind the dialog redrew — a live field
  // elsewhere, a patch coming back — and ask for the same schema each time.
  // Opening is the event; the identity of the function that answers is not.
  const ask = useRef(askForm);
  ask.current = askForm;

  useEffect(() => {
    if (!open) {
      // Dropped on the way out, so opening it a second time asks again rather
      // than drawing what the form looked like the first time.
      setSchema(undefined);
      setFailure(undefined);
      return;
    }

    let live = true;
    ask.current().then(
      (payload) => {
        if (live) setSchema(payload);
      },
      (error: unknown) => {
        // Said rather than swallowed: a dialog that opens on nothing forever
        // looks like a slow network, and this reader would wait for it.
        if (live) setFailure(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      live = false;
    };
  }, [open]);

  if (!open) return null;

  // Rendered against the body rather than where it sits in the tree. What it
  // holds is a form, and where it sits is inside one — a create or an edit page
  // is itself a form. Nested, the submit button does nothing at all: the click
  // reaches no handler, and asking the form to submit itself navigates the page
  // instead. A dialog already paints in the top layer, so nothing about how it
  // looks depends on where it lives.
  return createPortal(
    // The portal moves it out of the page's form in the DOM, and this stops it
    // travelling back up the React tree — where a portal's events still bubble.
    // Without it the dialog's own submit reaches the page's form as well, and
    // the page saves itself, empty, behind the dialog.
    <div
      onSubmit={(event) => {
        event.stopPropagation();
      }}
    >
      <ConfirmDialog
        open
        confirmation={{ heading: `New ${label.toLowerCase()}`, confirmLabel: "Create" }}
        onCancel={onClose}
      >
        {failure !== undefined ? (
          <p className="perch-modal__description" role="alert">
            {failure}
          </p>
        ) : schema === undefined ? (
          <p className="perch-modal__description" role="status">
            Loading…
          </p>
        ) : (
          <PanelForm
            initial={schema}
            send={resolve}
            submitLabel="Create"
            save={async ({ state }) => {
              const answer = await submit(state);
              if (answer.option === undefined) {
                return { errors: answer.errors, payload: answer.payload };
              }
              // Nothing to select here. The answer carried the whole form
              // back, resolved with the new row already chosen in it, and the
              // host applied it before this resolved. Shutting is all that is
              // left to do.
              onClose();
              return {};
            }}
          />
        )}
      </ConfirmDialog>
    </div>,
    document.body,
  );
}
