/**
 * @vitest-environment jsdom
 *
 * Dragging a row with a pointer.
 *
 * The rule the design states is behavioural, so it is what this asserts:
 * *"reordering is a pure UI action until you release: one PATCH with the final
 * order, not one per step."* A row dragged past four others is one call.
 *
 * jsdom measures nothing — every box is zero — so the rows are given real
 * boxes here. Without them `rowAt` cannot tell one row from another, which is
 * exactly what it refuses to guess at.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Repeater, rowAt } from "./Repeater.js";

afterEach(cleanup);

const ROW_HEIGHT = 40;

/** Stacks the rows at 40 px each, in the order they are on screen. */
function measure(): void {
  const rows = [...document.querySelectorAll<HTMLElement>(".perch-repeater__item")];
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => ({
      top: index * ROW_HEIGHT,
      bottom: (index + 1) * ROW_HEIGHT,
      height: ROW_HEIGHT,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: index * ROW_HEIGHT,
      toJSON: () => ({}),
    });
  });
}

function draw(onReorder = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <Repeater
      title="Sections"
      items={[{ id: "a" }, { id: "b" }, { id: "c" }]}
      onReorder={onReorder}
      onAdd={vi.fn()}
      onRemove={vi.fn()}
    >
      {(item) => <span data-row={item.id}>{item.id}</span>}
    </Repeater>,
  );
  measure();
  return onReorder;
}

const grip = (index: number): HTMLElement =>
  document.querySelectorAll<HTMLElement>(".perch-repeater__handle")[
    index
  ] as HTMLElement;

/** Only what the row renders, not the grip and the number beside it. */
const order = (): string[] =>
  [...document.querySelectorAll("[data-row]")].map(
    (el) => el.getAttribute("data-row") ?? "",
  );

/** Where each row has been moved to, which is how a drag shows itself now. */
const shifts = (): string[] =>
  [...document.querySelectorAll<HTMLElement>(".perch-repeater__item")].map(
    (row) => row.style.transform,
  );

/** jsdom has no pointer capture; the component asks for it on every drag. */
function capturable(element: HTMLElement): HTMLElement {
  element.setPointerCapture = () => undefined;
  element.releasePointerCapture = () => undefined;
  return element;
}

describe("dragging a row", () => {
  it("moves it while the pointer is down, without telling anybody yet", () => {
    // The nodes stay where they are and move by transform: a reordered node
    // has no "before" to travel from, so nothing could animate it.
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });

    expect(order()).toEqual(["a", "b", "c"]);
    expect(shifts()).toEqual([
      `translateY(${String(ROW_HEIGHT * 2)}px)`,
      `translateY(${String(-ROW_HEIGHT)}px)`,
      `translateY(${String(-ROW_HEIGHT)}px)`,
    ]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("follows the pointer with the row it is holding", () => {
    draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 34 });

    expect(shifts()[0]).toBe("translateY(24px)");
  });

  it("steps the rows it has passed aside by exactly one row", () => {
    draw();
    const handle = capturable(grip(2));

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });

    expect(shifts()[0]).toBe(`translateY(${String(ROW_HEIGHT)}px)`);
    expect(shifts()[1]).toBe(`translateY(${String(ROW_HEIGHT)}px)`);
  });

  it("tells the host once, on release, with where it ended up", () => {
    // Past two rows in one gesture. One call, not two.
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT + 5 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("says nothing at all where the row landed where it started", () => {
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 8 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("puts every row back where it was once the gesture ends", () => {
    // The host owns the order. What the drag showed was a proposal, and the
    // rows return to their untransformed places to wait for the answer.
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(order()).toEqual(["a", "b", "c"]);
    expect(shifts()).toEqual(["", "", ""]);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("marks the row in flight, and only that one", () => {
    draw();
    const handle = capturable(grip(1));

    fireEvent.pointerDown(handle, { pointerId: 1 });

    const flying = [...document.querySelectorAll(".perch-repeater__item")].map((row) =>
      row.getAttribute("data-dragging"),
    );
    expect(flying).toEqual(["false", "true", "false"]);
  });

  it("gives up cleanly when the gesture is cancelled", () => {
    // A cancelled gesture is not a reorder: the rows go back and nobody is
    // told, because the reader never released anywhere.
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();
    expect(shifts()).toEqual(["", "", ""]);
  });
});

describe("which row a pointer is over", () => {
  const ids = ["0", "1", "2"];
  const boxes = [
    { top: 0, height: ROW_HEIGHT },
    { top: 40, height: ROW_HEIGHT },
    { top: 80, height: ROW_HEIGHT },
  ];

  it("is the row whose middle the pointer has not passed", () => {
    expect(rowAt(boxes, ids, 5)).toBe(0);
    expect(rowAt(boxes, ids, 19)).toBe(0);
    expect(rowAt(boxes, ids, 21)).toBe(1);
  });

  it("is the last row once the pointer is past all of them", () => {
    expect(rowAt(boxes, ids, 500)).toBe(2);
  });

  it("is nothing where there are no rows to be over", () => {
    expect(rowAt([], [], 10)).toBeUndefined();
  });

  it("ignores a row with no height, rather than letting it catch the pointer", () => {
    // A row that occupies nothing still reports a position, and a position
    // below the pointer would match before any row the reader can see.
    const withEmpty = [
      { top: 0, height: 40 },
      { top: 100, height: 0 },
      { top: 40, height: 40 },
    ];

    expect(rowAt(withEmpty, ["0", "gone", "1"], 45)).toBe(2);
  });
});
