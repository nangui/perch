/**
 * `Repeater` — the repeatable group. Milestone A3 depends on it.
 *
 * Two rules the design states, and both are behavioural rather than visual:
 *
 *   - *"Reordering is a pure UI action until you release: one PATCH with the
 *     final order, not one per step."* One move is one patch here, which is the
 *     same promise from the other end: there is no drag to accumulate.
 *   - *"New item — nothing is sent until a name and an email are filled."* An
 *     item that has never been valid is `pending`, styled differently, and
 *     excluded from the patch.
 *
 * Keyboard reordering is not an enhancement here. A drag handle that only
 * responds to a mouse makes the field unusable for part of the audience, and the
 * design lists the shortcuts as part of the component.
 *
 * Dragging with a pointer is not built, and no longer pretends to be. It was
 * drawn — a grip, and a row that marked itself as dragging while the button was
 * held — with nothing behind it: no drop, no reorder, the row back where it
 * started. An affordance that promises a gesture it does not perform is worse
 * than one that never offered it, because the reader concludes the panel is
 * broken rather than that the feature is absent.
 *
 * So the grip is what it always was underneath: the control that takes Alt with
 * the arrow keys, beside two buttons that do the same in one press.
 */
import type { KeyboardEvent, ReactNode } from "react";

export interface RepeaterItem {
  readonly id: string;
  /**
   * What this row is called, where the field said how to name one.
   *
   * Rows are otherwise told apart by their position, which changes the moment
   * anything is reordered — so a reader looking for the one they were editing
   * has to read every row to find it.
   */
  readonly label?: string;
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
          onClick={() => {
            if (!atMax) onAdd();
          }}
          aria-disabled={atMax}
          data-disabled={atMax ? "true" : "false"}
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
          >
            <div className="perch-repeater__row">
              <button
                type="button"
                className="perch-repeater__handle"
                aria-label={`Move item ${String(index + 1)}. Alt with the arrow keys.`}
                onKeyDown={(event) => {
                  onHandleKeyDown(event, item.id);
                }}
              >
                <span aria-hidden="true">⠿</span>
                <span className="perch-repeater__index">{index + 1}</span>
              </button>

              {item.label === undefined ? null : (
                <span className="perch-repeater__label">{item.label}</span>
              )}

              {children(item, index)}

              <div className="perch-repeater__actions">
                {/* Both directions: §2.5.7 wants a single-pointer alternative to
                    dragging, and "down" alone means moving four rows to raise
                    the fifth. */}
                <Direction
                  label={`Move item ${String(index + 1)} up`}
                  glyph="↑"
                  spent={index === 0}
                  onMove={() => {
                    move(item.id, -1);
                  }}
                />
                <Direction
                  label={`Move item ${String(index + 1)} down`}
                  glyph="↓"
                  spent={index === items.length - 1}
                  onMove={() => {
                    move(item.id, 1);
                  }}
                />
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

/**
 * One end of the reordering, `aria-disabled` rather than `disabled`.
 *
 * `disabled` takes an element out of the tab order and a browser drops the
 * focus it was holding to the body — so raising an item to the top with the
 * keyboard ended with the focus nowhere, in the one control whose whole purpose
 * is to be reachable without a mouse. It stays a real button, says it is
 * unavailable, and moves nothing when pressed anyway.
 *
 * `data-disabled` is what the stylesheet reads, the same pair `Select` and the
 * pagination use: `aria-disabled` changes nothing a reader can see.
 *
 * Pressing it anyway moves nothing, and there is no guard here for that:
 * `move` refuses a destination outside the list, so one would be a second
 * answer to a question already answered.
 */
function Direction({
  label,
  glyph,
  spent,
  onMove,
}: {
  readonly label: string;
  readonly glyph: string;
  readonly spent: boolean;
  readonly onMove: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="perch-button perch-button--icon"
      aria-label={label}
      aria-disabled={spent}
      data-disabled={spent ? "true" : "false"}
      onClick={onMove}
    >
      {glyph}
    </button>
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
