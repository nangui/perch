/**
 * @vitest-environment jsdom
 *
 * Rows of two boxes, and what leaves them.
 *
 * The field refuses a blank key, a repeated one and a value that is not a list
 * of pairs. Most of what is tested here is what the table does before any of
 * that can be reached — a row nobody has typed into yet is not a mistake, and a
 * reader should not be told it is one.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyValue } from "./KeyValue.js";

afterEach(cleanup);

const binding = {
  id: "meta",
  "aria-describedby": "meta-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const draw = (
  over: Partial<Parameters<typeof KeyValue>[0]> = {},
): {
  onValueChange: ReturnType<typeof vi.fn>;
  container: HTMLElement;
} => {
  const onValueChange = vi.fn();
  const { container } = render(
    <KeyValue
      value={[]}
      onValueChange={onValueChange}
      status={{ lifecycle: "rest" }}
      binding={binding}
      label="Metadata"
      {...over}
    />,
  );
  return { onValueChange, container };
};

describe("the rows on screen", () => {
  it("names each box by its column and its row", () => {
    // A page of boxes called "Key" is a list of identical controls to anybody
    // not reading it by eye.
    draw({
      value: [
        ["colour", "green"],
        ["size", "large"],
      ],
    });

    expect(screen.getByLabelText("Key 1")).toHaveProperty("value", "colour");
    expect(screen.getByLabelText("Value 2")).toHaveProperty("value", "large");
  });

  it("uses the names the field was given", () => {
    draw({
      value: [["colour", "green"]],
      keyLabel: "Setting",
      valueLabel: "Reading",
    });

    expect(screen.getByLabelText("Setting 1")).toBeTruthy();
    expect(screen.getByLabelText("Reading 1")).toBeTruthy();
  });

  it("draws no table at all where there are no rows", () => {
    const { container } = draw();

    expect(container.querySelector(".perch-kv__rows")).toBeNull();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });
});

describe("typing into a row", () => {
  it("changes only the box that was typed into", () => {
    const { onValueChange } = draw({
      value: [
        ["colour", "green"],
        ["size", "large"],
      ],
    });

    fireEvent.change(screen.getByLabelText("Value 1"), { target: { value: "blue" } });

    expect(onValueChange).toHaveBeenCalledWith([
      ["colour", "blue"],
      ["size", "large"],
    ]);
  });

  it("keeps the rows in the order they are shown", () => {
    // The order is the whole reason the form holds pairs rather than an
    // object, so editing a key must not move its row.
    const { onValueChange } = draw({
      value: [
        ["colour", "green"],
        ["size", "large"],
      ],
    });

    fireEvent.change(screen.getByLabelText("Key 1"), { target: { value: "colours" } });

    expect(onValueChange).toHaveBeenCalledWith([
      ["colours", "green"],
      ["size", "large"],
    ]);
  });
});

describe("a row nobody has filled in", () => {
  it("appears when it is asked for", () => {
    const { onValueChange } = draw();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onValueChange).toHaveBeenCalledWith([["", ""]]);
  });

  it("stays where it is while the rest of the table is edited", () => {
    // Dropped here, it would leave the page under the reader as they empty a
    // row, taking the focus to whichever row moved up into its place. What a
    // key has to look like is settled where the object is built.
    const { onValueChange } = draw({
      value: [
        ["colour", "green"],
        ["", ""],
      ],
    });

    fireEvent.change(screen.getByLabelText("Value 1"), { target: { value: "blue" } });

    expect(onValueChange).toHaveBeenCalledWith([
      ["colour", "blue"],
      ["", ""],
    ]);
  });

  it("does not disappear as the reader empties it", () => {
    const { onValueChange } = draw({ value: [["colour", "green"]] });

    fireEvent.change(screen.getByLabelText("Key 1"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Value 1"), { target: { value: "" } });

    expect(onValueChange).toHaveBeenNthCalledWith(1, [["", "green"]]);
    expect(onValueChange).toHaveBeenNthCalledWith(2, [["colour", ""]]);
  });
});

describe("taking a row off", () => {
  it("offers a control naming the row it removes", () => {
    draw({ value: [["colour", "green"]] });

    expect(screen.getByRole("button", { name: "Remove colour" })).toBeTruthy();
  });

  it("names it by its position where it has no key yet", () => {
    draw({ value: [["", "green"]] });

    expect(screen.getByRole("button", { name: "Remove row 1" })).toBeTruthy();
  });

  it("removes the one that was pressed", () => {
    const { onValueChange } = draw({
      value: [
        ["colour", "green"],
        ["size", "large"],
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove colour" }));

    expect(onValueChange).toHaveBeenCalledWith([["size", "large"]]);
  });
});

describe("a field nobody may write to", () => {
  it("puts every box and every control out of reach", () => {
    draw({
      value: [["colour", "green"]],
      status: { lifecycle: "rest", disabled: true },
      binding: { ...binding, disabled: true },
    });

    expect(screen.getByLabelText("Key 1")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Value 1")).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Remove colour" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Add" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});

describe("what the shell wired up", () => {
  it("points the help line at the table, so an error is read with it", () => {
    // The shell hands these out and says the control must carry them, or the
    // help text and the error are announced to nobody.
    const { container } = draw({ value: [["colour", "green"]] });
    const group = container.querySelector("fieldset");

    expect(group?.getAttribute("aria-describedby")).toBe("meta-help");
  });

  it("names the group for the field, rather than leaving a run of boxes", () => {
    draw({ value: [["colour", "green"]] });

    expect(screen.getByRole("group", { name: "Metadata" })).toBeTruthy();
    // One group, not one per row: a group with no name of its own is a stop on
    // the way through the table that says nothing when it is reached.
    expect(screen.getAllByRole("group")).toHaveLength(1);
  });

  it("draws each box in the frame the rest of the page uses", () => {
    // The frame is the wrapper, and the disabled, invalid and draft states are
    // drawn from what it carries — a bare input wearing the class would only
    // ever look right at rest.
    const { container } = draw({
      value: [["colour", "green"]],
      status: { lifecycle: "rest", disabled: true },
    });
    const frames = [...container.querySelectorAll(".perch-control")];

    expect(frames).toHaveLength(2);
    expect(frames.every((one) => one.getAttribute("data-disabled") === "true")).toBe(
      true,
    );
    expect(container.querySelectorAll(".perch-control__input")).toHaveLength(2);
  });
});

describe("what the label points at", () => {
  it("the first box, where there are rows", () => {
    draw({ value: [["colour", "green"]] });

    expect(screen.getByLabelText("Key 1").id).toBe("meta");
  });

  it("the one control there is, where there are none", () => {
    // A label pointing at nothing is a label that does nothing when clicked.
    draw();

    expect(screen.getByRole("button", { name: "Add" }).id).toBe("meta");
  });

  it("without that control losing its own name to the field's", () => {
    // A `<label for>` renames a button, and then the only thing on screen is
    // announced as the field rather than as what pressing it does. The shell
    // draws that label around every field, so it is drawn here too.
    render(
      <label htmlFor="meta">
        Metadata
        <KeyValue
          value={[]}
          onValueChange={vi.fn()}
          status={{ lifecycle: "rest" }}
          binding={binding}
          label="Metadata"
        />
      </label>,
    );

    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Metadata" })).toBeNull();
  });
});
