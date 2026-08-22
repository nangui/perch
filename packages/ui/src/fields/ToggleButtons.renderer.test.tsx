/**
 * @vitest-environment jsdom
 *
 * A radio group wearing buttons.
 *
 * The semantics are the radio group's, so what is tested here is that they
 * survived the change of clothes: one tab stop, a named group, the browser's
 * own keyboard handling, and a label that points at something.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToggleButtons } from "./ToggleButtons.js";

afterEach(cleanup);

const binding = {
  id: "role",
  "aria-describedby": "role-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const ROLES = [
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
];

const draw = (
  over: Partial<Parameters<typeof ToggleButtons>[0]> = {},
): { onValueChange: ReturnType<typeof vi.fn>; container: HTMLElement } => {
  const onValueChange = vi.fn();
  const { container } = render(
    <ToggleButtons
      value={null}
      onValueChange={onValueChange}
      options={ROLES}
      status={{ lifecycle: "rest" }}
      binding={binding}
      label="Role"
      {...over}
    />,
  );
  return { onValueChange, container };
};

describe("choosing one", () => {
  it("offers each choice as something to press", () => {
    draw();

    expect(screen.getByRole("radio", { name: "Lead" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Member" })).toBeTruthy();
  });

  it("says which one was pressed", () => {
    const { onValueChange } = draw();

    fireEvent.click(screen.getByRole("radio", { name: "Member" }));

    expect(onValueChange).toHaveBeenCalledWith("member");
  });

  it("shows which one is held", () => {
    draw({ value: "lead" });

    expect(screen.getByRole("radio", { name: "Lead" })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "Member" })).toHaveProperty(
      "checked",
      false,
    );
  });

  it("keeps the native radios, which is where the keyboard comes from", () => {
    // Arrow keys between the choices, one tab stop for the set and the roving
    // focus that goes with it: all of it the browser's, none of it rewritten.
    const { container } = draw();
    const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];

    expect(inputs.map((one) => one.type)).toEqual(["radio", "radio"]);
    expect(new Set(inputs.map((one) => one.name)).size).toBe(1);
  });

  it("names the set for a reader who cannot see it is one", () => {
    draw();

    expect(screen.getByRole("radiogroup", { name: "Role" })).toBeTruthy();
  });
});

describe("how they are laid out", () => {
  it("says nothing about it by default", () => {
    const { container } = draw();
    const group = container.querySelector(".perch-toggles");

    expect(group?.hasAttribute("data-inline")).toBe(false);
    expect(group?.hasAttribute("data-grouped")).toBe(false);
  });

  it("says so where a row was asked for", () => {
    const { container } = draw({ inline: true });

    expect(container.querySelector(".perch-toggles")?.getAttribute("data-inline")).toBe(
      "true",
    );
  });

  it("says so where they are joined into one block", () => {
    const { container } = draw({ grouped: true });

    expect(
      container.querySelector(".perch-toggles")?.getAttribute("data-grouped"),
    ).toBe("true");
  });
});

describe("what the shell wired up", () => {
  it("points the label at the first choice", () => {
    draw();

    expect(screen.getByRole("radio", { name: "Lead" }).id).toBe("role");
  });

  it("points the help line at the set", () => {
    const { container } = draw();

    expect(
      container.querySelector(".perch-toggles")?.getAttribute("aria-describedby"),
    ).toBe("role-help");
  });
});

describe("a field nobody may write to", () => {
  it("puts every choice out of reach", () => {
    draw({
      value: "lead",
      status: { lifecycle: "rest", disabled: true },
      binding: { ...binding, disabled: true },
    });

    expect(screen.getByRole("radio", { name: "Lead" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("radio", { name: "Member" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("puts one choice out of reach where only it is", () => {
    draw({ options: [ROLES[0]!, { ...ROLES[1]!, disabled: true }] });

    expect(screen.getByRole("radio", { name: "Lead" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("radio", { name: "Member" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe("a set of choices with no choices in it", () => {
  it("keeps the row's height and says what is missing", () => {
    // A field that vanishes is one nobody can ask about.
    const { container } = draw({ options: [] });

    expect(screen.getByText("No options available")).toBeTruthy();
    expect(container.querySelector(".perch-toggles--empty")).toBeTruthy();
  });

  it("leaves the shell's label pointing at something", () => {
    const { container } = draw({ options: [] });

    expect(container.querySelector(".perch-toggles__empty")?.id).toBe("role");
  });
});
