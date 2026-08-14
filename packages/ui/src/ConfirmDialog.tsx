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

export interface Confirmation {
  readonly heading?: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly confirmation: Confirmation;
  /**
   * A form the reader fills instead of a yes-or-no.
   *
   * When present it owns the dialog's buttons — a form submits itself, and a
   * second confirm button beside it would be two ways to do one thing.
   */
  readonly children?: ReactNode;
  /** Drawn as destructive, and the confirm button with it. */
  readonly danger?: boolean;
  /** Held while the request is in flight, so it cannot be pressed twice. */
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  confirmation,
  children,
  danger = false,
  busy = false,
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
        if (!busy && children === undefined) onCancel();
      }}
    >
      <div
        className="perch-modal__panel"
        role="document"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <h2 className="perch-modal__heading">
          {confirmation.heading ?? "Are you sure?"}
        </h2>
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
              onClick={onConfirm}
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
