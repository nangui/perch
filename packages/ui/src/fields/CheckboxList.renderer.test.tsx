/**
 * @vitest-environment jsdom
 *
 * Every choice on the page, any number of them taken.
 *
 * A `<fieldset>` with a name, so the browser announces the set as a group and
 * each box keeps its own tab stop. Unlike a radio group there is no roving
 * focus to inherit — several can be ticked, so each is reached in turn.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckboxList } from "./CheckboxList.js";

afterEach(cleanup);

const ROLES = [
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
  { value: "guest", label: "Guest" },
];

const binding = {
  id: "roles",
  "aria-describedby": "roles-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const draw = (
  over: Partial<Parameters<typeof CheckboxList>[0]> = {},
): { onValueChange: ReturnType<typeof vi.fn>; container: HTMLElement } => {
  const onValueChange = vi.fn();
  const { container } = render(
    <CheckboxList
      value={[]}
      onValueChange={onValueChange}
      options={ROLES}
      status={{ lifecycle: "rest" }}
      binding={binding}
      label="Roles"
      {...over}
    />,
  );
  return { onValueChange, container };
};

describe("the group a reader meets", () => {
  it("is named for the field, so it is not an unnamed set of boxes", () => {
    draw();

    expect(screen.getByRole("group", { name: "Roles" })).toBeTruthy();
  });

  it("offers every choice it was given", () => {
    draw();

    expect(
      screen.getAllByRole("checkbox").map((one) => one.getAttribute("value")),
    ).toEqual(["lead", "member", "guest"]);
  });

  it("shows what is ticked", () => {
    draw({ value: ["lead", "guest"] });

    const boxes = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(boxes.map((one) => one.checked)).toEqual([true, false, true]);
  });

  it("gives the shell's label something to point at when it is empty", () => {
    // A `for` naming an element that does not exist is a label attached to
    // nobody. There is no control to focus here, and the words that replaced
    // it are what the label is about.
    const { container } = draw({ options: [] });

    expect(container.querySelector("#roles")?.textContent).toBe("No options available");
  });

  it("keeps its shape where there is nothing to choose", () => {
    // A field that vanishes is one nobody can ask about, and the row below it
    // would move under the reader's pointer.
    const { container } = draw({ options: [] });

    expect(container.querySelector(".perch-checkbox-list--empty")).not.toBeNull();
  });
});

describe("what ticking sends", () => {
  it("the value added, as a list", () => {
    const { onValueChange } = draw({ value: ["lead"] });

    fireEvent.click(screen.getByLabelText("Guest"));

    expect(onValueChange).toHaveBeenCalledWith(["lead", "guest"]);
  });

  it("the value taken away", () => {
    const { onValueChange } = draw({ value: ["lead", "guest"] });

    fireEvent.click(screen.getByLabelText("Lead"));

    expect(onValueChange).toHaveBeenCalledWith(["guest"]);
  });

  it("an empty list when the last one goes, not nothing at all", () => {
    const { onValueChange } = draw({ value: ["lead"] });

    fireEvent.click(screen.getByLabelText("Lead"));

    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it("them in the order they were declared, not the order they were ticked", () => {
    // What is written should not depend on which box a reader reached first.
    const { onValueChange } = draw({ value: ["guest"] });

    fireEvent.click(screen.getByLabelText("Lead"));

    expect(onValueChange).toHaveBeenCalledWith(["lead", "guest"]);
  });
});

describe("the control over all of them", () => {
  it("is not there unless the field asked for it", () => {
    draw();

    expect(screen.queryByLabelText(/tick all/i)).toBeNull();
  });

  it("ticks every one a reader could have ticked", () => {
    const { onValueChange } = draw({ bulkToggleable: true });

    fireEvent.click(screen.getByText("Tick all"));

    expect(onValueChange).toHaveBeenCalledWith(["lead", "member", "guest"]);
  });

  it("unticks them again once they are all on", () => {
    const { onValueChange } = draw({
      bulkToggleable: true,
      value: ["lead", "member", "guest"],
    });

    fireEvent.click(screen.getByText("Untick all"));

    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it("leaves alone what the reader could not have changed", () => {
    // A bulk control that ticked a disabled box would write what the box
    // refuses, and one that unticked a ticked disabled box would throw away a
    // value the reader was never allowed to touch.
    const options = [...ROLES.slice(0, 2), { ...ROLES[2]!, disabled: true }];
    const { onValueChange } = draw({
      bulkToggleable: true,
      options,
      value: ["guest"],
    });

    fireEvent.click(screen.getByText("Tick all"));

    expect(onValueChange).toHaveBeenCalledWith(["guest", "lead", "member"]);
  });
});

describe("a field nobody may write to", () => {
  it("puts every box out of reach", () => {
    draw({ status: { lifecycle: "rest", disabled: true }, bulkToggleable: true });

    const boxes = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(boxes.every((one) => one.disabled)).toBe(true);
  });
});
