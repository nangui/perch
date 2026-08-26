/**
 * The question asked before something irreversible happens.
 *
 * Built on the platform's own `<dialog>`, opened with `showModal()`. That is
 * what gives the focus trap, the Escape key, the inert background and the
 * painting above everything else without a portal — four things that are hard
 * to get right by hand and easy to get subtly wrong.
 *
 * What it asks is the server's wording, not this file's. A confirmation the
 * action declared carries its own heading and labels; the defaults here are for
 * an action that asked to confirm without saying what to say.
 */
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import type { ModalWidth } from "@perchjs/core";

export interface Confirmation {
  readonly heading?: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

interface DialogBase {
  readonly open: boolean;
  readonly confirmation: Confirmation;
  /** Drawn as destructive, and the confirm button with it. */
  readonly danger?: boolean;
  /** Held while the request is in flight, so it cannot be pressed twice. */
  readonly busy?: boolean;
  /**
   * How wide it opens. Absent takes what the content asks for: a sentence for
   * a question, and enough for a form that its fields are not as narrow as
   * their placeholders.
   */
  readonly width?: ModalWidth;
  /**
   * Opens against the side of the window rather than in the middle of it.
   *
   * The same dialog either way. `showModal()` still gives the focus trap, the
   * Escape key and the inert background; what changes is where it comes from
   * and how tall it is.
   */
  readonly slideOver?: boolean;
  /**
   * Whether a click on the backdrop closes it.
   *
   * A form's does not: the click is as likely a miss as a decision, and what it
   * would throw away is the reader's. A panel that only shows something has
   * nothing to throw away, so it takes the easiest way out there is.
   *
   * Defaults to whether there is anything to lose, which is the same question
   * asked once.
   */
  readonly dismissable?: boolean;
  readonly onCancel: () => void;
}

/**
 * Either a question or a form, and the two take different callers.
 *
 * A union rather than two optional props: a question with nothing to answer it
 * would draw a confirm button that does nothing, and a form with a second
 * confirm beside its own submit would be two ways to do one thing. Neither
 * compiles.
 */
export type ConfirmDialogProps = DialogBase &
  (
    | { readonly children: ReactNode; readonly onConfirm?: never }
    | { readonly children?: undefined; readonly onConfirm: () => void }
  );

export function ConfirmDialog({
  open,
  confirmation,
  children,
  danger = false,
  busy = false,
  width,
  slideOver = false,
  dismissable,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    // `showModal` rather than the `open` attribute: the attribute shows the
    // element without any of what makes it modal.
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="perch-modal"
      data-danger={danger}
      // A question and a form want different widths, and the dialog is the only
      // thing that knows which it is holding.
      data-form={children !== undefined}
      // A declared width wins over the one the content implies, and a
      // slide-over is measured across rather than down.
      {...(width === undefined ? {} : { "data-width": width })}
      data-slide-over={slideOver}
      // Escape closes it whatever this thinks, so the state has to be told
      // rather than left believing the dialog is still open.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      // The backdrop is part of the element, so a click outside the panel lands
      // here. Anywhere inside stops at the panel below.
      //
      // A question can be dismissed this way; a form somebody has filled in
      // cannot. The click is as likely to be a miss as a decision, and what it
      // would throw away is theirs. Escape still closes either — that one is
      // unambiguous, and a keyboard needs a way out.
      onClick={() => {
        if (!busy && (dismissable ?? children === undefined)) onCancel();
      }}
    >
      <div
        className="perch-modal__panel"
        role="document"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="perch-modal__bar">
          <h2 className="perch-modal__heading">
            {confirmation.heading ?? "Are you sure?"}
          </h2>
          {/* The pointer's way out, and only where there is none otherwise: a
              question has its own Cancel, and a second control by the same
              name would be two ways to do one thing. A dialog holding a form
              has neither — it ignores a click on the backdrop on purpose, so
              Escape was the only way to leave it. */}
          {children === undefined ? null : (
            <button
              type="button"
              className="perch-modal__close"
              aria-label="Close"
              disabled={busy}
              onClick={onCancel}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        {confirmation.description === undefined ? null : (
          <p className="perch-modal__description">{confirmation.description}</p>
        )}
        {children}
        {children !== undefined ? null : (
          <div className="perch-modal__actions">
            <button
              type="button"
              className="perch-button"
              onClick={onCancel}
              disabled={busy}
            >
              {confirmation.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              className={`perch-button ${danger ? "perch-button--danger" : "perch-button--primary"}`}
              onClick={() => {
                onConfirm?.();
              }}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Working…" : (confirmation.confirmLabel ?? "Confirm")}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
