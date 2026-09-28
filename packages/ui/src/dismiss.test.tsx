/**
 * @vitest-environment jsdom
 *
 * A menu closes when the reader turns away from it.
 *
 * Both menus in the panel are native `details` elements, which do not close on
 * their own: nothing in HTML says one should notice a click elsewhere. Opened
 * from a table, that shows as three menus standing over the rows below them,
 * which is what a reader reported.
 *
 * Driven through the components rather than the hook, because what was wrong
 * was not the hook: it is where it is called, and a call placed after an early
 * return is a call the next render skips.
 */
import { useRef } from "react";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDismiss } from "./dismiss.js";

afterEach(cleanup);

/** One menu, of the shape both of the panel's own have. */
function Menu({ name }: { readonly name: string }): ReactNode {
  const shell = useRef<HTMLDetailsElement | null>(null);
  useDismiss(shell);

  return (
    <details ref={shell} data-testid={name}>
      <summary>{name}</summary>
      <div>
        <button type="button">{`${name} action`}</button>
      </div>
    </details>
  );
}

const menu = (name: string): HTMLDetailsElement => screen.getByTestId(name);

const opened = (name: string): HTMLDetailsElement => {
  const one = menu(name);
  one.open = true;
  return one;
};

describe("a menu left open", () => {
  it("closes when the pointer goes down somewhere else", () => {
    render(
      <div>
        <Menu name="first" />
        <p>elsewhere</p>
      </div>,
    );
    expect(opened("first").open).toBe(true);

    fireEvent.pointerDown(screen.getByText("elsewhere"));

    expect(menu("first").open).toBe(false);
  });

  it("stays open when the pointer goes down inside it", () => {
    // Choosing something in the menu is not turning away from it, and the
    // choice's own handler is what acts.
    render(<Menu name="first" />);
    opened("first");

    fireEvent.pointerDown(screen.getByText("first action"));

    expect(menu("first").open).toBe(true);
  });

  it("closes on Escape, and gives the button back the focus", () => {
    render(<Menu name="first" />);
    opened("first");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu("first").open).toBe(false);
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("is left alone by any other key", () => {
    render(<Menu name="first" />);
    opened("first");

    fireEvent.keyDown(document, { key: "a" });

    expect(menu("first").open).toBe(true);
  });
});

describe("a table with a menu on every row", () => {
  it("has one open at a time, the second closing the first", () => {
    // The shape of the report: three rows, three menus, all of them open. It
    // falls out of the rule above rather than needing one of its own, a click
    // on another row's button being a click outside this one.
    render(
      <div>
        <Menu name="first" />
        <Menu name="second" />
        <Menu name="third" />
      </div>,
    );
    opened("first");
    opened("second");

    fireEvent.pointerDown(screen.getByText("third"));

    expect(menu("first").open).toBe(false);
    expect(menu("second").open).toBe(false);
  });
});
