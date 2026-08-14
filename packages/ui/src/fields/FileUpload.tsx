/**
 * `FileUpload` — one file, sent when it is chosen.
 *
 * The reader picks, the bytes go up, and what stays in the form is the key the
 * server issued (ADR 0016). So the control has three states rather than two:
 * empty, sending, and holding a file the server has already taken. The middle
 * one is the reason this is not an `<input type=file>` with a label on it.
 *
 * The input is real and kept in the accessibility tree — the platform owns the
 * file dialog, and nothing here reimplements it — with the visible affordance
 * drawn over it.
 *
 * `accept` and a size check here are courtesies. Both are gone the moment
 * somebody posts to the route directly, which is why the route keeps them too
 * and why a refusal from it is shown rather than assumed impossible.
 */
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import type { UploadedFile } from "../node-props.js";
import type { FieldStatus } from "../field-state.js";
import { isLocked, statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import { StatusMark } from "./TextInput.js";

export interface FileUploadProps {
  /** The key the server issued, or empty. */
  readonly value: string;
  readonly onValueChange: (key: string) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** Sends it. Absent means the host cannot, and the control says so. */
  readonly upload?: ((file: File) => Promise<UploadedFile>) | undefined;
  /** Passed to the dialog as a courtesy. The route is what enforces it. */
  readonly accept?: string;
  readonly maxSize?: number;
  /**
   * Where the stored file can be fetched, when there is one to look at.
   *
   * A key is not an address: the adapter decides what a key resolves to, and
   * only it can say. Absent means no preview rather than a broken image, which
   * is the more honest of the two.
   */
  readonly previewUrl?: string;
}

export function FileUpload({
  value,
  onValueChange,
  status,
  binding,
  upload,
  accept,
  maxSize,
  previewUrl,
}: FileUploadProps): ReactNode {
  const noteId = useId();
  const [sending, setSending] = useState(false);
  // What the server took, and only while the field still holds it. The server
  // is authoritative: a round trip that comes back with another value — or
  // none — has to be believed over what this remembers, or the note names a
  // file while the Remove button beside it says there is nothing to remove.
  const [held, setHeld] = useState<UploadedFile | undefined>(undefined);
  // A picture of the file just chosen, made from the file itself.
  //
  // The server resolves an address only for what the row holds, and it is right
  // not to go further: the key on a form is this page's to set, and asking the
  // server to mint an address for it would be asking it to vouch for wherever
  // it was pointed. For a file chosen a moment ago there is nothing to ask —
  // the bytes are here.
  const [chosen, setChosen] = useState<{ url: string; key: string } | undefined>(
    undefined,
  );
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  const locked = isLocked(status) || upload === undefined;

  const picture =
    value === ""
      ? undefined
      : chosen !== undefined && chosen.key === value
        ? chosen.url
        : previewUrl;

  async function choose(file: File): Promise<void> {
    if (upload === undefined) return;
    setRefused(undefined);
    setSending(true);
    try {
      const staged = await upload(file);
      setHeld(staged);
      setChosen((was) => {
        if (was !== undefined) URL.revokeObjectURL(was.url);
        return file.type.startsWith("image/")
          ? { url: URL.createObjectURL(file), key: staged.key }
          : undefined;
      });
      onValueChange(staged.key);
    } catch (error) {
      // Shown rather than swallowed: the reader chose this file and has to be
      // able to choose another. The route's own message is the useful one —
      // too big, wrong sort — and it is the server's to phrase.
      setRefused(
        error instanceof Error ? error.message : "That file was not accepted.",
      );
    } finally {
      setSending(false);
    }
  }

  function clear(): void {
    setHeld(undefined);
    setChosen((was) => {
      // Handed back rather than left to the page's lifetime: an object URL
      // pins the whole file in memory until it is revoked.
      if (was !== undefined) URL.revokeObjectURL(was.url);
      return undefined;
    });
    setRefused(undefined);
    onValueChange("");
    // The input keeps the last filename otherwise, and choosing the same file
    // again would fire no change event at all.
    if (input.current !== null) input.current.value = "";
  }

  return (
    <div className="perch-upload" {...statusAttributes(status)}>
      {/* Whichever of the two is about the file the field is holding right now:
          the local one while it is a fresh choice, the server's once the row has
          it. Keyed on the value so neither outlives what it is a picture of. */}
      {picture === undefined ? null : (
        <img
          className="perch-upload__preview"
          src={picture}
          alt=""
          // Decorative: the file's name is already read out below, and a second
          // reading of it adds nothing to somebody who cannot see the picture.
          aria-hidden="true"
        />
      )}

      <div className="perch-upload__control">
        <input
          ref={input}
          type="file"
          className="perch-upload__input"
          id={binding.id}
          disabled={locked || sending}
          aria-describedby={`${binding["aria-describedby"]} ${noteId}`}
          aria-invalid={binding["aria-invalid"]}
          aria-required={binding["aria-required"]}
          {...(accept === undefined ? {} : { accept })}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void choose(file);
          }}
        />
        <StatusMark status={status} />
      </div>

      {/* One line, always present, so nothing below the field moves as it goes
          from empty to sending to held. */}
      <p className="perch-upload__note" id={noteId} role="status">
        {refused !== undefined
          ? refused
          : sending
            ? "Sending…"
            : held !== undefined && held.key === value
              ? `${held.name} · ${describeSize(held.size)}`
              : value !== ""
                ? "A file is attached"
                : upload === undefined
                  ? "Uploading is not available here"
                  : describeLimit(maxSize)}
      </p>

      {value === "" ? null : (
        <button
          type="button"
          className="perch-button"
          onClick={clear}
          disabled={locked}
        >
          Remove
        </button>
      )}
    </div>
  );
}

/** Round numbers a reader recognises, not the exact byte count. */
function describeSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${String(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`;
}

function describeLimit(maxSize: number | undefined): string {
  return maxSize === undefined ? "" : `Up to ${describeSize(maxSize)}`;
}
