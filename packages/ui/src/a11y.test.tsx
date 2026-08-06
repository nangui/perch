/**
 * @vitest-environment jsdom
 *
 * WCAG 2.2, which ARCH 13 §10 makes a requirement. The criteria 2.2 added are
 * the ones a component written against 2.1 passes every older check and still
 * fails.
 *
 * 2.5.8 Target Size is in `target-size.test.ts`: jsdom computes no layout.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { REST } from "./field-state.js";
import { FieldShell } from "./FieldShell.js";
import { Toggle } from "./fields/Toggle.js";
import { Calendar, DateTimePicker } from "./fields/DateTimePicker.js";
import { Repeater } from "./fields/Repeater.js";
import { TextInput } from "./fields/TextInput.js";

afterEach(cleanup);

describe("4.1.2 Name, Role, Value — every control is named", () => {
  it("names the Toggle", () => {
    // A switch whose label sits in a sibling div has no accessible name at all:
    // a screen reader announces "switch, off" and nothing else.
    render(
      <Toggle
        checked={false}
        onCheckedChange={() => undefined}
        label="SSO enforced"
        help="All members must sign in through SAML."
        status={REST}
      />,
    );
    expect(screen.getByRole("switch", { name: /SSO enforced/i })).toBeDefined();
  });

  it("names the Toggle from the label alone, not from its state tag", () => {
    // Folding the tag in makes a reader say the state twice.
    render(
      <Toggle
        checked
        onCheckedChange={() => undefined}
        label="SSO enforced"
        tag="on"
        status={REST}
      />,
    );
    expect(screen.getByRole("switch").getAttribute("aria-label")).toBeNull();
    expect(
      screen.getByRole("switch", { name: "SSO enforced" }),
      "the name picked up the state tag as well as the label",
    ).toBeDefined();
  });

  it("describes the Toggle with its help text", () => {
    render(
      <Toggle
        checked
        onCheckedChange={() => undefined}
        label="Sandbox mode"
        help="Writes are discarded nightly."
        status={REST}
      />,
    );
    const control = screen.getByRole("switch");
    const describedBy = control.getAttribute("aria-describedby");
    expect(describedBy, "the switch points at no description").toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      "Writes are discarded nightly.",
    );
  });

  it("describes the Toggle with its error, so a refusal is read with the field", () => {
    // ARCH 13 §10. The switch is the one field outside FieldShell, so it is the
    // one that can lose the wiring silently.
    render(
      <Toggle
        checked
        onCheckedChange={() => undefined}
        label="SSO enforced"
        help="All members must sign in through SAML."
        status={{ lifecycle: "rest", error: "Your plan does not include SSO." }}
      />,
    );
    const control = screen.getByRole("switch");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    const describedBy = control.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Your plan does not include SSO.",
    );
  });

  it("makes the Toggle's label a pointer target for the switch", () => {
    // `label for` widens the target to the text without any script.
    render(
      <Toggle
        checked={false}
        onCheckedChange={() => undefined}
        label="SSO enforced"
        status={REST}
      />,
    );
    const control = screen.getByRole("switch");
    const label = document.querySelector<HTMLLabelElement>(
      "label.perch-toggle-text__label",
    );
    expect(label?.getAttribute("for")).toBe(control.id);
    expect(control.id, "the switch has no id to point a label at").toBeTruthy();
  });

  it("names the calendar's month navigation", () => {
    render(<Calendar selected="2026-09-12" onSelect={() => undefined} />);
    expect(screen.getByRole("button", { name: /previous month/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /next month/i })).toBeDefined();
  });

  it("names a calendar day in words, weekday included", () => {
    // Matched loosely: ICU punctuates "Saturday, 12 September" differently across
    // versions, and pinning it would fail on a different Node, not a regression.
    render(<Calendar selected="2026-09-12" onSelect={() => undefined} />);
    expect(
      screen.getByRole("button", { name: /^Saturday\b.*12 September 2026$/ }),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "2026-09-12" }),
      "a day is still named by its ISO string",
    ).toBeNull();
  });

  it("does not claim a grid role without grid children", () => {
    // Vacuous today — the calendar declares `group` — and its job is to fire the
    // day someone reintroduces the role without the structure.
    render(<Calendar selected="2026-09-12" onSelect={() => undefined} />);
    for (const grid of screen.queryAllByRole("grid")) {
      expect(
        grid.querySelectorAll('[role="row"], [role="gridcell"]').length,
        "role=grid declared with no row or gridcell inside",
      ).toBeGreaterThan(0);
    }
  });

  it("hides the weekday strip, which means nothing read aloud", () => {
    render(<Calendar selected="2026-09-12" onSelect={() => undefined} />);
    const strip = document.querySelector(".perch-calendar__weekday")?.parentElement;
    expect(strip?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("2.5.7 Dragging Movements — a pointer alternative to every drag", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  function renderRepeater(): void {
    render(
      <Repeater
        title="Contacts"
        items={items}
        onReorder={() => undefined}
        onAdd={() => undefined}
        onRemove={() => undefined}
      >
        {() => null}
      </Repeater>,
    );
  }

  it("offers a keyboard route to reorder", () => {
    renderRepeater();
    expect(
      screen
        .getByRole("button", { name: /reorder item 1/i })
        .getAttribute("aria-label"),
    ).toMatch(/arrow keys/i);
  });

  it("offers a pointer route in both directions, not only down", () => {
    // With "down" alone, raising an item means bubbling every other one past it.
    renderRepeater();
    expect(screen.getByRole("button", { name: /move item 2 up/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /move item 2 down/i })).toBeDefined();
  });

  it("disables each direction only at the end it cannot go", () => {
    renderRepeater();
    const up = (n: number): HTMLButtonElement =>
      screen.getByRole<HTMLButtonElement>("button", {
        name: `Move item ${String(n)} up`,
      });
    const down = (n: number): HTMLButtonElement =>
      screen.getByRole<HTMLButtonElement>("button", {
        name: `Move item ${String(n)} down`,
      });
    expect(up(1).disabled).toBe(true);
    expect(down(1).disabled).toBe(false);
    expect(up(3).disabled).toBe(false);
    expect(down(3).disabled).toBe(true);
  });

  it("puts exactly as many buttons in a row as the grid track was sized for", () => {
    // The row's last track in `styles.css` is sized from this count. A fourth
    // button has to fail here and in `target-size.test.ts` together.
    renderRepeater();
    const actions = document.querySelectorAll(".perch-repeater__actions");
    expect(actions.length).toBe(3);
    for (const group of actions) {
      expect(group.querySelectorAll("button").length).toBe(3);
    }
  });
});

describe("1.4.1 Use of Color — no state carried by colour alone", () => {
  it("states an error in words, not only with a red border", () => {
    render(
      <FieldShell
        label="Email"
        status={{ lifecycle: "rest", error: "Not a valid email." }}
      >
        {(binding) => (
          <TextInput
            value="a@b"
            onChange={() => undefined}
            status={{ lifecycle: "rest", error: "Not a valid email." }}
            binding={binding}
          />
        )}
      </FieldShell>,
    );
    expect(screen.getByRole("status").textContent).toBe("Not a valid email.");
  });

  it("states in flight in words, not only with a hairline", () => {
    render(
      <FieldShell label="Name" status={{ lifecycle: "inFlight" }}>
        {(binding) => (
          <TextInput
            value="x"
            onChange={() => undefined}
            status={{ lifecycle: "inFlight" }}
            binding={binding}
            progress={0.5}
          />
        )}
      </FieldShell>,
    );
    expect(screen.getByText("Saving…")).toBeDefined();
  });
});

describe("2.1.1 Keyboard — nothing is pointer-only", () => {
  it("keeps the calendar trigger reachable", () => {
    render(
      <FieldShell label="Renewal" status={REST}>
        {(binding) => (
          <DateTimePicker
            value={{ date: "2026-09-12" }}
            onChange={() => undefined}
            status={REST}
            binding={binding}
            dateOnly
          />
        )}
      </FieldShell>,
    );
    const trigger = screen.getByRole("button", { name: /open calendar/i });
    expect(trigger.hasAttribute("disabled")).toBe(false);
  });

  it("does not put two controls with the same name in one field", () => {
    // Two controls named "Time" make "click Time" ambiguous for voice control.
    render(
      <FieldShell label="Renewal" status={REST}>
        {(binding) => (
          <DateTimePicker
            value={{ date: "2026-09-12", time: "18:30" }}
            onChange={() => undefined}
            status={REST}
            binding={binding}
            timeZone="Europe/Paris"
          />
        )}
      </FieldShell>,
    );
    expect(screen.queryAllByLabelText(/^time$/i)).toHaveLength(1);
  });
});
