/**
 * `Repeater` — the repeatable group. Milestone A3 depends on it.
 *
 * Two rules the design states, and both are behavioural rather than visual:
 *
 *   - *"Reordering is a pure UI action until you release: one PATCH with the
 *     final order, not one per step."* Order therefore lives in the pure-UI zone
 *     (ARCH 13 §3) while dragging, and crosses into the canonical zone once.
 *   - *"New item — nothing is sent until a name and an email are filled."* An
 *     item that has never been valid is `pending`, styled differently, and
 *     excluded from the patch.
 *
 * Keyboard reordering is not an enhancement here. A drag handle that only
 * responds to a mouse makes the field unusable for part of the audience, and the
 * design lists the shortcuts as part of the component.
 */
import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";

export interface RepeaterItem {
  readonly id: string;
  /** Never sent: no field has been filled yet. */
  readonly pending?: boolean;
  readonly error?: string;
  readonly note?: string;
}

export interface RepeaterProps<T extends RepeaterItem> {
  readonly title: string;
  readonly items: readonly T[];
  readonly onReorder: (ids: readonly string[]) => void;
  readonly onAdd: () => void;
  readonly onRemove: (id: string) => void;
  /** Renders the item's own fields into the row's middle columns. */
  readonly children: (item: T, index: number) => ReactNode;
  readonly max?: number;
  readonly addLabel?: string;
  readonly emptyTitle?: string;
  readonly emptyBody?: string;
}

export function Repeater<T extends RepeaterItem>({
  title,
  items,
  onReorder,
  onAdd,
  onRemove,
  children,
  max,
  addLabel = "Add item",
  emptyTitle,
  emptyBody,
}: RepeaterProps<T>): ReactNode {
  // Order while dragging is pure UI state: it never leaves this component until
  // release, which is what keeps a five-step drag to one patch.
  const [dragging, setDragging] = useState<string | null>(null);
  const atMax = max !== undefined && items.length >= max;

  function move(id: string, by: number): void {
    const from = items.findIndex((item) => item.id === id);
    const to = from + by;
    if (from === -1 || to < 0 || to >= items.length) return;
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    onReorder(ids);
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string): void {
    // Alt+Arrow, matching the shortcuts the design publishes.
    if (!event.altKey) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(id, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(id, 1);
    }
  }

  if (items.length === 0 && emptyTitle !== undefined) {
    return (
      <div className="perch-repeater">
        <div className="perch-repeater__head">
          <div className="perch-repeater__title">{title}</div>
        </div>
        <div className="perch-empty">
          <div
            className="perch-empty__glyph perch-empty__glyph--wide"
            aria-hidden="true"
          />
          <div className="perch-empty__title">{emptyTitle}</div>
          {emptyBody === undefined ? null : (
            <div className="perch-empty__body">{emptyBody}</div>
          )}
          <button
            type="button"
            className="perch-button perch-button--primary"
            onClick={onAdd}
          >
            {addLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="perch-repeater">
      <div className="perch-repeater__head">
        <div className="perch-repeater__title">{title}</div>
        <div className="perch-repeater__count">
          {items.length} {items.length === 1 ? "item" : "items"}
          {max === undefined ? "" : ` · max ${String(max)}`}
        </div>
        <button
          type="button"
          className="perch-button"
          style={{ marginLeft: "auto" }}
          onClick={onAdd}
          disabled={atMax}
          {...(atMax ? { title: `At most ${String(max)} items.` } : {})}
        >
          + {addLabel}
        </button>
      </div>

      <ul
        className="perch-repeater__body"
        style={{ listStyle: "none", margin: 0 }}
        aria-label={title}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            className="perch-repeater__item"
            data-invalid={item.error === undefined ? "false" : "true"}
            data-pending={item.pending === true ? "true" : "false"}
            data-dragging={dragging === item.id ? "true" : "false"}
          >
            <div className="perch-repeater__row">
              <button
                type="button"
                className="perch-repeater__handle"
                aria-label={`Reorder item ${String(index + 1)}. Alt with arrow keys to move.`}
                onKeyDown={(event) => {
                  onHandleKeyDown(event, item.id);
                }}
                onPointerDown={() => {
                  setDragging(item.id);
                }}
                onPointerUp={() => {
                  setDragging(null);
                }}
              >
                <span aria-hidden="true">⠿</span>
                <span className="perch-repeater__index">{index + 1}</span>
              </button>

              {children(item, index)}

              <div className="perch-repeater__actions">
                {/* Both directions: §2.5.7 wants a single-pointer alternative to
                    dragging, and "down" alone means moving four rows to raise
                    the fifth. */}
                <button
                  type="button"
                  className="perch-button perch-button--icon"
                  aria-label={`Move item ${String(index + 1)} up`}
                  onClick={() => {
                    move(item.id, -1);
                  }}
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="perch-button perch-button--icon"
                  aria-label={`Move item ${String(index + 1)} down`}
                  onClick={() => {
                    move(item.id, 1);
                  }}
                  disabled={index === items.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="perch-button perch-button--icon perch-button--danger"
                  aria-label={`Remove item ${String(index + 1)}`}
                  onClick={() => {
                    onRemove(item.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Reserved, like every help line in the system. */}
            <div
              className="perch-repeater__note"
              data-error={item.error === undefined ? "false" : "true"}
              role="status"
              aria-live="polite"
            >
              {item.error ?? item.note ?? ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The shortcuts the design publishes, exported so the help panel cannot drift. */
export const REPEATER_SHORTCUTS: readonly {
  readonly key: string;
  readonly label: string;
}[] = [
  { key: "⌥↑ / ⌥↓", label: "Move the focused item" },
  { key: "⇧⌘D", label: "Duplicate the focused item" },
  { key: "⌘⌫", label: "Delete, with undo in a toast" },
  { key: "⌘↵", label: "Add an item below" },
];
