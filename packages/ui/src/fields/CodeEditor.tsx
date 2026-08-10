/**
 * `CodeEditor` — the fallback for a Json column until KeyValue lands in v0.2.
 *
 * A textarea overlaid on a numbered gutter, not a real editor. Deliberate: a
 * code-editor dependency must not be dragged into a bundle that has to stay
 * small, and a Json override field does not need folding or autocomplete.
 *
 * The rule the design states and this enforces: *"Nothing is sent while the
 * document is invalid."* A malformed patch would be rejected by the server
 * anyway; sending it just costs a round trip and shows the user an error they
 * already had locally.
 */
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { FieldStatus } from "../field-state.js";
import { statusAttributes } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";

export interface CodeDiagnostic {
  /**
   * 1-based, matching the gutter — and optional on purpose.
   *
   * V8 does not guarantee a position in its JSON error messages: some read
   * `at position 23 (line 3 column 12)`, others only quote the offending text.
   * When the line cannot be established, saying nothing beats pointing at line 1
   * and being wrong, which is what a naive parse of that message produces.
   */
  readonly line?: number;
  readonly message: string;
}

export interface CodeEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly status: FieldStatus;
  readonly binding: ControlBinding;
  /** Shown in the bar. A name, not a path — this is not a file. */
  readonly filename?: string;
  readonly diagnostic?: CodeDiagnostic;
  /** Rendered when the value is empty and read-only. */
  readonly emptyNote?: string;
}

export function CodeEditor({
  value,
  onChange,
  status,
  binding,
  filename,
  diagnostic,
  emptyNote,
}: CodeEditorProps): ReactNode {
  const readOnly = status.readOnly === true;
  const lines = useMemo(() => value.split("\n"), [value]);

  return (
    <div className="perch-code" {...statusAttributes(status)}>
      <div className="perch-code__bar">
        {filename === undefined ? null : <span>{filename}</span>}
        {diagnostic === undefined ? (
          readOnly ? (
            <span className="perch-code__status">Read only</span>
          ) : null
        ) : (
          <span className="perch-code__diagnostic">
            {diagnostic.line === undefined
              ? "1 error"
              : `1 error · line ${String(diagnostic.line)}`}
          </span>
        )}
      </div>

      {readOnly ? (
        value === "" && emptyNote !== undefined ? (
          <div style={{ padding: "14px 10px" }}>
            <div className="perch-code__text" style={{ paddingLeft: 0 }}>
              {emptyNote}
            </div>
          </div>
        ) : (
          lines.map((text, index) => (
            <CodeLine
              // Index is the identity here: a line *is* its position, and
              // renumbering on edit is the intended behaviour.
              key={index}
              n={index + 1}
              text={text}
              error={diagnostic?.line === index + 1}
            />
          ))
        )
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "34px 1fr" }}>
          <div aria-hidden="true">
            {lines.map((_, index) => (
              <div
                key={index}
                className="perch-code__gutter"
                data-error={diagnostic?.line === index + 1 ? "true" : "false"}
              >
                {index + 1}
              </div>
            ))}
          </div>
          <textarea
            {...binding}
            className="perch-code__text"
            style={{
              border: "none",
              background: "none",
              resize: "vertical",
              outline: "none",
              minHeight: `${String(Math.max(lines.length, 4) * 22)}px`,
              whiteSpace: "pre",
              overflowWrap: "normal",
            }}
            spellCheck={false}
            wrap="off"
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Best effort, in order of reliability: an explicit line, then a character
 * position, then nothing. Returning `undefined` is a real answer here.
 */
function lineFromMessage(message: string, source: string): number | undefined {
  const explicit = /\bline (\d+)/.exec(message);
  if (explicit?.[1] !== undefined) return Number(explicit[1]);

  const position = /\bposition (\d+)/.exec(message);
  if (position?.[1] !== undefined) {
    return source.slice(0, Number(position[1])).split("\n").length;
  }

  return undefined;
}

function CodeLine({
  n,
  text,
  error,
}: {
  readonly n: number;
  readonly text: string;
  readonly error: boolean;
}): ReactNode {
  return (
    <div className="perch-code__line" data-error={error ? "true" : "false"}>
      <div className="perch-code__gutter">{n}</div>
      <div className="perch-code__text">{text}</div>
    </div>
  );
}

/**
 * Whether the document may be sent. Exported so the caller enforces the design's
 * rule rather than reimplementing it, and so it is testable without React.
 */
export function parseJsonDocument(
  value: string,
): { readonly ok: true } | { readonly ok: false; readonly diagnostic: CodeDiagnostic } {
  if (value.trim() === "") return { ok: true };
  try {
    JSON.parse(value);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    const line = lineFromMessage(message, value);
    return {
      ok: false,
      diagnostic: { message, ...(line === undefined ? {} : { line }) },
    };
  }
}
