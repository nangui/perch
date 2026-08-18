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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/** jsdom has no pointer capture; the component asks for it on every drag. */
function capturable(element: HTMLElement): HTMLElement {
  element.setPointerCapture = () => undefined;
  element.releasePointerCapture = () => undefined;
  return element;
}

describe("dragging a row", () => {
  it("moves it while the pointer is down, without telling anybody yet", () => {
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });

    expect(order()).toEqual(["b", "c", "a"]);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("tells the host once, on release, with where it ended up", () => {
    // Past two rows in one gesture. One call, not two.
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT + 5 });
    measure();
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("says nothing at all where the row landed where it started", () => {
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 5 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("puts the rows back where the host says once it has spoken", () => {
    // The host owns the order. What the drag showed was a proposal.
    const onReorder = draw();
    const handle = capturable(grip(0));

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    // The props never changed, so the given order is what shows again.
    expect(order()).toEqual(["a", "b", "c"]);
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

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: ROW_HEIGHT * 2 + 5 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(onReorder).not.toHaveBeenCalled();

    expect(order()).toEqual(["a", "b", "c"]);
    expect(screen.queryByText("a")).toBeTruthy();
  });
});

describe("which row a pointer is over", () => {
  const boxed = (tops: readonly number[]): ReadonlyMap<string, HTMLElement> =>
    new Map(
      tops.map((top, index) => [
        String(index),
        {
          getBoundingClientRect: () => ({ top, height: ROW_HEIGHT }) as DOMRect,
        } as HTMLElement,
      ]),
    );

  const ids = ["0", "1", "2"];
  const rows = boxed([0, 40, 80]);

  it("is the row whose middle the pointer has not passed", () => {
    expect(rowAt(rows, ids, 5)).toBe(0);
    expect(rowAt(rows, ids, 19)).toBe(0);
    expect(rowAt(rows, ids, 21)).toBe(1);
  });

  it("is the last row once the pointer is past all of them", () => {
    expect(rowAt(rows, ids, 500)).toBe(2);
  });

  it("is nothing where there are no rows to be over", () => {
    expect(rowAt(new Map(), [], 10)).toBeUndefined();
  });

  it("ignores a row with no height, rather than letting it catch the pointer", () => {
    // A row that occupies nothing still reports a position, and a position
    // below the pointer would match before any row the reader can see. The
    // pointer here is over the second visible row; the empty one sits under it.
    const box = (top: number, height: number) =>
      ({ getBoundingClientRect: () => ({ top, height }) as DOMRect }) as HTMLElement;
    const withEmpty = new Map([
      ["0", box(0, 40)],
      ["gone", box(100, 0)],
      ["1", box(40, 40)],
    ]);

    expect(rowAt(withEmpty, ["0", "gone", "1"], 45)).toBe(2);
  });
});
