/**
 * @vitest-environment jsdom
 *
 * A list the reader writes, one box and the tags already made.
 *
 * Most of what is tested here is what the box does before the server ever sees
 * the value: the field refuses a blank tag, a repeated one and one carrying the
 * separator, and a reader should meet none of those as an error.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagsInput } from "./TagsInput.js";

afterEach(cleanup);

const binding = {
  id: "tags",
  "aria-describedby": "tags-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const draw = (
  over: Partial<Parameters<typeof TagsInput>[0]> = {},
): {
  onValueChange: ReturnType<typeof vi.fn>;
  container: HTMLElement;
  box: HTMLInputElement;
} => {
  const onValueChange = vi.fn();
  const { container } = render(
    <TagsInput
      value={[]}
      onValueChange={onValueChange}
      status={{ lifecycle: "rest" }}
      binding={binding}
      label="Tags"
      {...over}
    />,
  );
  // Found by class rather than by role: an input offering a datalist is a
  // combobox and one without is a textbox, so asking by role would make the
  // helper depend on the very thing half these tests are about.
  const box = container.querySelector<HTMLInputElement>(".perch-tags__input");
  if (box === null) throw new Error("the field drew no box to type in");
  return { onValueChange, container, box };
};

describe("making a tag", () => {
  it("commits what was typed on Enter", () => {
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "ada" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith(["ada"]);
  });

  it("commits it when the box loses focus, rather than losing it", () => {
    // The complaint every tags field that does not do this receives.
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "ada" } });
    fireEvent.blur(box);

    expect(onValueChange).toHaveBeenCalledWith(["ada"]);
  });

  it("adds to what is there rather than replacing it", () => {
    const { onValueChange, box } = draw({ value: ["ada"] });

    fireEvent.change(box, { target: { value: "grace" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith(["ada", "grace"]);
  });

  it("makes nothing from a box with nothing in it", () => {
    const { onValueChange, box } = draw();

    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("makes nothing from one already on the list", () => {
    // The server refuses a repeat, and a reader typing a tag they already have
    // should see nothing happen rather than an error.
    const { onValueChange, box } = draw({ value: ["ada"] });

    fireEvent.change(box, { target: { value: "ada" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("trims what it takes", () => {
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "  ada  " } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith(["ada"]);
  });
});

describe("a field whose column joins the tags", () => {
  it("ends a tag on the separator rather than letting it into the value", () => {
    // The server refuses a tag carrying it, because it would come back as two.
    const { onValueChange, box } = draw({ separator: "," });

    fireEvent.change(box, { target: { value: "ada," } });

    expect(onValueChange).toHaveBeenCalledWith(["ada"]);
  });

  it("makes several from a line that was pasted in", () => {
    const { onValueChange, box } = draw({ separator: "," });

    fireEvent.change(box, { target: { value: "ada,grace,alan" } });

    expect(onValueChange).toHaveBeenCalledWith(["ada", "grace", "alan"]);
  });

  it("leaves the separator alone where no column joins on it", () => {
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "ada,grace" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith(["ada,grace"]);
  });
});

describe("taking a tag off", () => {
  it("offers a control naming the tag it removes", () => {
    // A page of buttons called "Remove" is a list of identical controls to
    // anybody not reading it by eye.
    draw({ value: ["ada", "grace"] });

    expect(screen.getByRole("button", { name: "Remove ada" })).toBeTruthy();
  });

  it("removes the one that was pressed", () => {
    const { onValueChange } = draw({ value: ["ada", "grace"] });

    fireEvent.click(screen.getByRole("button", { name: "Remove ada" }));

    expect(onValueChange).toHaveBeenCalledWith(["grace"]);
  });

  it("takes the last one back on backspace in an empty box", () => {
    const { onValueChange, box } = draw({ value: ["ada", "grace"] });

    fireEvent.keyDown(box, { key: "Backspace" });

    expect(onValueChange).toHaveBeenCalledWith(["ada"]);
  });

  it("leaves them alone while there is something in the box", () => {
    const { onValueChange, box } = draw({ value: ["ada"] });

    fireEvent.change(box, { target: { value: "gr" } });
    fireEvent.keyDown(box, { key: "Backspace" });

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("what it offers while typing", () => {
  it("proposes what it was given", () => {
    const { container, box } = draw({ suggestions: ["ada", "grace"] });
    const options = [...container.querySelectorAll("datalist option")];

    expect(options.map((one) => one.getAttribute("value"))).toEqual(["ada", "grace"]);
    expect(box.getAttribute("list")).toBe(container.querySelector("datalist")?.id);
  });

  it("proposes nothing where nothing was given", () => {
    const { container, box } = draw();

    expect(container.querySelector("datalist")).toBeNull();
    expect(box.hasAttribute("list")).toBe(false);
  });
});

describe("a field nobody may write to", () => {
  it("puts the box and every control out of reach", () => {
    const { box } = draw({
      value: ["ada"],
      status: { lifecycle: "rest", disabled: true },
      binding: { ...binding, disabled: true },
    });

    expect(box.disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: "Remove ada" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
