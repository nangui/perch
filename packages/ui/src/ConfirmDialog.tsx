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
      // Escape closes it whatever this thinks, so the state has to be told
      // rather than left believing the dialog is still open.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      // The backdrop is part of the element, so a click outside the panel lands
      // here. Anywhere inside stops at the panel below.
      onClick={() => {
        if (!busy) onCancel();
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
      </div>
    </dialog>
  );
}
