/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FieldStatus } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import type { MultiSelectOption } from "./MultiSelect.js";
import { MultiSelect } from "./MultiSelect.js";

beforeAll(() => {
  const element = Element.prototype as unknown as Record<string, unknown>;
  element["hasPointerCapture"] = () => false;
  element["setPointerCapture"] = () => undefined;
  element["releasePointerCapture"] = () => undefined;
  element["scrollIntoView"] = () => undefined;
});

afterEach(cleanup);

const STATUS: FieldStatus = { lifecycle: "rest" };
const BINDING: ControlBinding = {
  id: "tags",
  "aria-describedby": "tags-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
};

const OPTIONS: readonly MultiSelectOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

function draw(
  overrides: Partial<React.ComponentProps<typeof MultiSelect>> = {},
): ReturnType<typeof vi.fn> {
  const onValueChange = vi.fn();
  render(
    <MultiSelect
      value={[]}
      onValueChange={onValueChange}
      options={OPTIONS}
      status={STATUS}
      binding={BINDING}
      label="Tags"
      {...overrides}
    />,
  );
  return onValueChange;
}

async function open(): Promise<void> {
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("listbox");
}

const press = (key: string): void => {
  fireEvent.keyDown(screen.getByRole("listbox"), { key });
};

describe("the list", () => {
  it("says it takes more than one", async () => {
    draw();
    await open();

    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe(
      "true",
    );
  });

  it("marks every option, chosen or not", async () => {
    // Marking only the chosen ones leaves a screen reader unable to say what
    // it would be choosing.
    draw({ value: ["b"] });
    await open();

    expect(
      screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected")),
    ).toEqual(["false", "true", "false"]);
  });

  it("is named by the field", async () => {
    draw();
    await open();

    expect(screen.getByRole("listbox", { name: "Tags" })).toBeTruthy();
  });
});

describe("choosing", () => {
  it("adds to the selection rather than replacing it", async () => {
    const onValueChange = draw({ value: ["a"] });
    await open();

    fireEvent.mouseDown(screen.getByText("Gamma"));

    expect(onValueChange).toHaveBeenCalledWith(["a", "c"]);
  });

  it("takes a value back out when it is chosen again", async () => {
    const onValueChange = draw({ value: ["a", "c"] });
    await open();

    fireEvent.mouseDown(screen.getByText("Alpha"));

    expect(onValueChange).toHaveBeenCalledWith(["c"]);
  });

  it("stays open, so a second choice costs no reopening", async () => {
    draw();
    await open();

    fireEvent.mouseDown(screen.getByText("Alpha"));

    expect(screen.queryByRole("listbox")).not.toBeNull();
  });
});

describe("the keyboard", () => {
  it("toggles the active option on Enter", async () => {
    const onValueChange = draw();
    await open();

    press("ArrowDown");
    press("Enter");

    expect(onValueChange).toHaveBeenCalledWith(["b"]);
  });

  it("toggles on Space too, which is what a listbox answers to", async () => {
    const onValueChange = draw();
    await open();

    press(" ");

    expect(onValueChange).toHaveBeenCalledWith(["a"]);
  });

  it("wraps rather than stopping at the end", async () => {
    draw();
    await open();

    press("ArrowUp");

    expect(screen.getByRole("listbox").getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[2]?.id,
    );
  });
});

describe("what the closed control says", () => {
  it("shows the placeholder when nothing is chosen", () => {
    draw({ placeholder: "Pick some" });

    expect(screen.getByRole("button").textContent).toContain("Pick some");
  });

  it("names a single choice rather than counting it", () => {
    draw({ value: ["b"] });

    expect(screen.getByRole("button").textContent).toContain("Beta");
  });

  it("counts once there are too many to read", () => {
    draw({ value: ["a", "b", "c"] });

    expect(screen.getByRole("button").textContent).toContain("3 selected");
  });

  it("keeps showing the selection when the field is locked", () => {
    draw({ value: ["b"], status: { ...STATUS, disabled: true } });

    expect(screen.getByRole("button").textContent).toContain("Beta");
  });
});

describe("with nothing to choose from", () => {
  it("says so rather than opening an empty box", async () => {
    draw({ options: [] });
    await open();

    expect(screen.getByText("Nothing to choose from")).toBeTruthy();
  });
});

describe("focus", () => {
  it("lands on the list, which is what the arrows drive", async () => {
    draw();
    await open();

    await act(() => Promise.resolve());
    expect(document.activeElement).toBe(screen.getByRole("listbox"));
  });
});
