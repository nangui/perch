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
import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useRef, useState } from "react";

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

  /**
   * The gesture, while it is happening.
   *
   * The rows stay where they are in the document and move by transform, so
   * every step is something CSS can animate — reordering the nodes themselves
   * would be a jump no transition can smooth, because a moved node has no
   * "before" to travel from.
   *
   * `boxes` is measured once, at the start. Transforms are part of what
   * `getBoundingClientRect` reports, so measuring again mid-gesture would feed
   * the drag its own displacement.
   */
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  function startDrag(id: string, event: ReactPointerEvent<HTMLButtonElement>): void {
    // The pointer is captured so the gesture survives leaving the handle, which
    // it does immediately: the row moves out from under the finger.
    event.currentTarget.setPointerCapture(event.pointerId);
    const order = items.map((item) => item.id);
    setDrag({
      id,
      order,
      from: order.indexOf(id),
      at: order.indexOf(id),
      grabbedAt: event.clientY,
      y: event.clientY,
      boxes: measureRows(rows.current, order),
    });
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (drag === null) return;
    const over = rowAt(drag.boxes, drag.order, event.clientY);
    setDrag({ ...drag, y: event.clientY, at: over ?? drag.at });
  }

  function endDrag(): void {
    if (drag === null) return;
    // Only where it landed somewhere else. A press that moved nothing is a
    // press, and it should cost no round trip.
    if (drag.at !== drag.from) onReorder(reordered(drag));
    setDrag(null);
  }

  /**
   * A gesture that was taken away rather than finished.
   *
   * The browser cancels a pointer for reasons that have nothing to do with the
   * reader — a system gesture, a call arriving, the page losing the pointer —
   * and none of them is a decision to move a row. So the rows go back and
   * nobody is told, which is what "cancel" means.
   */
  function cancelDrag(): void {
    setDrag(null);
  }

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
            ref={(element) => {
              if (element === null) rows.current.delete(item.id);
              else rows.current.set(item.id, element);
            }}
            className="perch-repeater__item"
            data-invalid={item.error === undefined ? "false" : "true"}
            data-pending={item.pending === true ? "true" : "false"}
            data-dragging={drag?.id === item.id ? "true" : "false"}
            style={shift(drag, index)}
          >
            <div className="perch-repeater__row">
              <button
                type="button"
                className="perch-repeater__handle"
                aria-label={`Move item ${String(index + 1)}. Alt with the arrow keys.`}
                onKeyDown={(event) => {
                  onHandleKeyDown(event, item.id);
                }}
                onPointerDown={(event) => {
                  startDrag(item.id, event);
                }}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
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

/**
 * One gesture: which row, where it started, where it is now.
 *
 * `at` is the index it would land on if released this instant. `y` is the
 * pointer, which the dragged row follows so it stays under the finger.
 */
interface Drag {
  readonly id: string;
  readonly order: readonly string[];
  readonly from: number;
  readonly at: number;
  readonly grabbedAt: number;
  readonly y: number;
  readonly boxes: readonly Box[];
}

export interface Box {
  readonly top: number;
  readonly height: number;
}

/** Where the rows are before anything has moved. Measured once, at the start. */
function measureRows(
  elements: ReadonlyMap<string, HTMLElement>,
  order: readonly string[],
): readonly Box[] {
  return order.map((id) => {
    const box = elements.get(id)?.getBoundingClientRect();
    return { top: box?.top ?? 0, height: box?.height ?? 0 };
  });
}

/** The order a release would produce, without producing it. */
export function reordered(drag: {
  readonly order: readonly string[];
  readonly from: number;
  readonly at: number;
}): readonly string[] {
  const order = [...drag.order];
  const [moved] = order.splice(drag.from, 1);
  if (moved === undefined) return drag.order;
  order.splice(drag.at, 0, moved);
  return order;
}

/**
 * Where a row sits while a gesture is happening.
 *
 * The dragged one follows the pointer. Every row between where it came from
 * and where it is now steps aside by one row's height — the direction depends
 * on which way it is travelling, and everything else stays put.
 */
export function shift(
  drag: Drag | null,
  index: number,
): { transform?: string } | undefined {
  if (drag === null) return undefined;

  if (index === drag.from) {
    return { transform: `translateY(${String(drag.y - drag.grabbedAt)}px)` };
  }

  const height = drag.boxes[drag.from]?.height ?? 0;
  if (drag.at > drag.from && index > drag.from && index <= drag.at) {
    return { transform: `translateY(${String(-height)}px)` };
  }
  if (drag.at < drag.from && index < drag.from && index >= drag.at) {
    return { transform: `translateY(${String(height)}px)` };
  }
  return { transform: "translateY(0px)" };
}

/**
 * Which row the pointer is over, by the middles of the rows.
 *
 * Middles rather than edges: a row gives way once the pointer passes the centre
 * of its neighbour, which is what makes a drag feel like it pushes rows aside
 * rather than snapping between gaps.
 */
export function rowAt(
  boxes: readonly Box[],
  order: readonly string[],
  y: number,
): number | undefined {
  for (const [index] of order.entries()) {
    const box = boxes[index];
    if (box === undefined) continue;
    // A row that occupies nothing still reports a position, and one below the
    // pointer would match before any row the reader can see.
    if (box.height === 0) continue;
    if (y < box.top + box.height / 2) return index;
  }
  return order.length === 0 ? undefined : order.length - 1;
}
