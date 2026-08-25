/**
 * @vitest-environment jsdom
 *
 * How a modal opens, and what stays true however it does.
 *
 * The width and the side are the declaration's, and they are the only things
 * that change. What `showModal()` gives — the focus trap, the Escape key, the
 * inert background — belongs to the element and not to the shape it is drawn
 * in, which is the whole reason a slide-over is this dialog with an attribute
 * on it rather than a second component that would have to be given all four
 * again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog.js";

beforeEach(cleanup);

// jsdom knows the element but not the two methods that make it modal.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

const ask = (over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const { container } = render(
    <ConfirmDialog
      open
      confirmation={{ heading: "Sure?" }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...(over as Record<string, unknown>)}
    />,
  );
  return { dialog: container.querySelector("dialog"), onCancel, onConfirm };
};

describe("a width", () => {
  it("is the one the action asked for", () => {
    expect(ask({ width: "3xl" }).dialog?.getAttribute("data-width")).toBe("3xl");
  });

  it("is absent where nothing asked, so the content decides", () => {
    // A sentence for a question, and enough for a form that its fields are not
    // as narrow as their placeholders.
    expect(ask().dialog?.hasAttribute("data-width")).toBe(false);
  });

  it("does not change what the dialog is holding", () => {
    // The form/question distinction is still drawn, because it is what the
    // width falls back to and what decides whether a click outside dismisses.
    expect(ask({ width: "lg" }).dialog?.getAttribute("data-form")).toBe("false");
  });
});

describe("opening against the side", () => {
  it("says so on the element, and not by being a different one", () => {
    expect(ask({ slideOver: true }).dialog?.getAttribute("data-slide-over")).toBe(
      "true",
    );
  });

  it("is still the dialog it was", () => {
    // `showModal()` is what gives the focus trap, the Escape key and the inert
    // background. A slide-over that reached for a `div` would have to be given
    // all four again, and would get some of them subtly wrong.
    expect(ask({ slideOver: true }).dialog?.open).toBe(true);
  });

  it("still leaves on Escape", () => {
    const { dialog, onCancel } = ask({ slideOver: true });
    fireEvent(dialog as HTMLDialogElement, new Event("cancel", { cancelable: true }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("still refuses to leave while a request is in flight", () => {
    const { dialog, onCancel } = ask({ slideOver: true, busy: true });
    fireEvent(dialog as HTMLDialogElement, new Event("cancel", { cancelable: true }));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("is off where nothing asked for it", () => {
    expect(ask().dialog?.getAttribute("data-slide-over")).toBe("false");
  });
});

describe("what a question does either way", () => {
  it("closes on a click outside it", () => {
    const { dialog, onCancel } = ask({ width: "screen", slideOver: true });
    fireEvent.click(dialog as HTMLDialogElement);

    expect(onCancel).toHaveBeenCalled();
  });

  it("keeps its own words", () => {
    ask({ width: "7xl", slideOver: true, confirmation: { heading: "Delete it?" } });

    expect(screen.getByText("Delete it?")).toBeTruthy();
  });
});
