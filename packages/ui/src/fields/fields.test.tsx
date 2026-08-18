/**
 * @vitest-environment jsdom
 *
 * What these tests are for.
 *
 * The value of this design is not that it looks a certain way — it is that a
 * server patch never shifts the layout, that the eight states are actually
 * distinguishable, and that a field which cannot be used still says why. Those
 * are assertions, not screenshots, so they are tested here.
 *
 * Rendering is checked through roles and accessible names rather than class
 * names, because that is what a keyboard and a screen reader see. Accessibility
 * is a requirement, and a test that queries `.perch-control` would pass on a
 * div that no assistive technology can operate.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FieldStatus } from "../field-state.js";
import { debounceFor, isLocked, REST, statusAttributes } from "../field-state.js";
import { FieldShell } from "../FieldShell.js";
import { TextInput } from "./TextInput.js";
import { Textarea } from "./Textarea.js";
import { Select } from "./Select.js";
import { Repeater } from "./Repeater.js";
import { parseJsonDocument } from "./CodeEditor.js";

afterEach(cleanup);

const DRAFT: FieldStatus = { lifecycle: "draft" };
const IN_FLIGHT: FieldStatus = { lifecycle: "inFlight" };
const INVALID: FieldStatus = { lifecycle: "rest", error: "Not a valid email address." };

function shell(status: FieldStatus, help?: string): void {
  render(
    <FieldShell
      label="Legal name"
      status={status}
      {...(help === undefined ? {} : { help })}
    >
      {(binding) => (
        <TextInput
          value="Northwind"
          onChange={() => undefined}
          status={status}
          binding={binding}
        />
      )}
    </FieldShell>,
  );
}

describe("FieldShell — the reserved help line", () => {
  it("renders the help line even with nothing to say", () => {
    // The design's central promise: the line exists at rest, so adding an error
    // later cannot change the field's height.
    shell(REST);
    const help = screen.getByRole("status");
    expect(help).toBeDefined();
    expect(help.textContent).toBe("");
  });

  it("replaces help with the error rather than stacking them", () => {
    shell(INVALID, "Legal name as filed.");
    const help = screen.getByRole("status");
    expect(help.textContent).toBe("Not a valid email address.");
    // If both were rendered the field would grow — which is the bug this design
    // exists to prevent.
    expect(help.textContent).not.toContain("Legal name as filed.");
  });

  it("announces an error politely instead of stealing focus", () => {
    shell(INVALID);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("binds the label to the control and the control to the help line", () => {
    shell(REST, "Legal name as filed.");
    const input = screen.getByLabelText(/legal name/i);
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Legal name as filed.",
    );
  });

  it("marks the control invalid for assistive technology, not only visually", () => {
    shell(INVALID);
    expect(screen.getByLabelText(/legal name/i).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });
});

describe("TextInput — the eight states are distinguishable", () => {
  it("says Unsaved while the patch has not left", () => {
    shell(DRAFT);
    expect(screen.getByText("Unsaved")).toBeDefined();
  });

  it("says Saving… in flight, and stays editable", () => {
    shell(IN_FLIGHT);
    expect(screen.getByText("Saving…")).toBeDefined();
    // The design is explicit: editable throughout, a keystroke cancels the patch.
    expect(screen.getByLabelText(/legal name/i).hasAttribute("readonly")).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>(/legal name/i).disabled).toBe(false);
  });

  it("shows one status mark at a time, never two", () => {
    shell(INVALID);
    expect(screen.queryByText("Unsaved")).toBeNull();
    expect(screen.queryByText("Saving…")).toBeNull();
  });

  it("reports every keystroke to the caller — the value is never local", () => {
    const onChange = vi.fn();
    render(
      <FieldShell label="Name" status={REST}>
        {(binding) => (
          <TextInput value="ab" onChange={onChange} status={REST} binding={binding} />
        )}
      </FieldShell>,
    );
    // `fireEvent.change`, not a raw Event: React tracks the value on the DOM node
    // and ignores a mutation it did not see, so the naive version silently passes
    // nothing to the handler.
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("keeps a disabled value readable rather than blanking it", () => {
    render(
      <FieldShell label="Identifier" status={{ lifecycle: "rest", disabled: true }}>
        {(binding) => (
          <TextInput
            value="org_4f21c9ab7d"
            onChange={() => undefined}
            status={{ lifecycle: "rest", disabled: true }}
            binding={binding}
          />
        )}
      </FieldShell>,
    );
    const input = screen.getByLabelText<HTMLInputElement>(/identifier/i);
    expect(input.value).toBe("org_4f21c9ab7d");
    expect(input.disabled).toBe(true);
  });

  it("does not use type=number for a numeric field", () => {
    // A number input brings spinners, locale parsing and a scroll-wheel trap.
    render(
      <FieldShell label="Seats" status={REST}>
        {(binding) => (
          <TextInput
            value="250"
            onChange={() => undefined}
            status={REST}
            binding={binding}
            flavour="numeric"
          />
        )}
      </FieldShell>,
    );
    const input = screen.getByLabelText(/seats/i);
    expect(input.getAttribute("type")).toBe("text");
    expect(input.getAttribute("inputmode")).toBe("decimal");
  });

  it("hides a password until asked, and reports the toggle as pressed", () => {
    const { rerender } = render(
      <FieldShell label="Password" status={REST}>
        {(binding) => (
          <TextInput
            value="secret"
            onChange={() => undefined}
            status={REST}
            binding={binding}
            flavour="password"
            onRevealToggle={() => undefined}
          />
        )}
      </FieldShell>,
    );
    expect(screen.getByLabelText(/password/i).getAttribute("type")).toBe("password");
    const button = screen.getByRole("button", { name: "show" });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    rerender(
      <FieldShell label="Password" status={REST}>
        {(binding) => (
          <TextInput
            value="secret"
            onChange={() => undefined}
            status={REST}
            binding={binding}
            flavour="password"
            onRevealToggle={() => undefined}
            revealed
          />
        )}
      </FieldShell>,
    );
    expect(screen.getByLabelText(/password/i).getAttribute("type")).toBe("text");
  });
});

describe("Textarea", () => {
  it("shows the count and the over-limit state together", () => {
    const value = "x".repeat(532);
    render(
      <FieldShell
        label="Notes"
        status={{
          lifecycle: "rest",
          error: "32 characters over the limit. Not saved.",
        }}
      >
        {(binding) => (
          <Textarea
            value={value}
            onChange={() => undefined}
            status={{
              lifecycle: "rest",
              error: "32 characters over the limit. Not saved.",
            }}
            binding={binding}
            maxLength={500}
          />
        )}
      </FieldShell>,
    );
    expect(screen.getByText("532 / 500")).toBeDefined();
    expect(screen.getByText("Too long")).toBeDefined();
    expect(screen.getByText(/32 characters over the limit/)).toBeDefined();
  });

  it("does not truncate over-limit text: the user must see what they wrote", () => {
    render(
      <FieldShell label="Notes" status={REST}>
        {(binding) => (
          <Textarea
            value={"x".repeat(600)}
            onChange={() => undefined}
            status={REST}
            binding={binding}
            maxLength={500}
          />
        )}
      </FieldShell>,
    );
    expect(screen.getByLabelText<HTMLTextAreaElement>(/notes/i).value).toHaveLength(
      600,
    );
  });
});

describe("Select — the three moments of a dependent field (milestone A1)", () => {
  const options = [
    { value: "idf", label: "Île-de-France" },
    { value: "paca", label: "Provence" },
  ];

  function renderSelect(props: Partial<Parameters<typeof Select>[0]> = {}): void {
    const status = props.status ?? REST;
    render(
      <FieldShell label="Region" status={status}>
        {(binding) => (
          <Select
            value={null}
            onValueChange={() => undefined}
            options={options}
            status={status}
            binding={binding}
            {...props}
          />
        )}
      </FieldShell>,
    );
  }

  it("says what is missing while awaiting its parent", () => {
    renderSelect({ awaiting: "Select a country first" });
    expect(screen.getByText("Select a country first")).toBeDefined();
  });

  it("marks itself busy while options load, without unmounting", () => {
    renderSelect({ status: { lifecycle: "loading" } });
    const busy = screen.getByRole("status", { busy: true });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading options…")).toBeDefined();
  });

  it("stays present and disabled when no option exists, rather than vanishing", () => {
    // A field that disappears is a field the user cannot ask about.
    renderSelect({ options: [], emptyLabel: "No tax region for this country" });
    const control = screen.getByText("No tax region for this country");
    expect(control).toBeDefined();
    expect(screen.getByLabelText(/region/i).getAttribute("aria-disabled")).toBe("true");
  });

  it("exposes a real combobox once options exist", () => {
    renderSelect();
    expect(screen.getByRole("combobox", { name: /region/i })).toBeDefined();
  });

  it("keeps the selected label visible when disabled", () => {
    renderSelect({ value: "idf", status: { lifecycle: "rest", disabled: true } });
    expect(screen.getByText("Île-de-France")).toBeDefined();
  });
});

describe("Repeater", () => {
  const items = [
    { id: "a", note: "" },
    { id: "b", error: "Not a valid email address — this item is not saved." },
    { id: "c", pending: true, note: "New item — nothing is sent yet." },
  ];

  function renderRepeater(onReorder = vi.fn()): typeof onReorder {
    render(
      <Repeater
        title="Contacts"
        items={items}
        onReorder={onReorder}
        onAdd={() => undefined}
        onRemove={() => undefined}
        max={10}
      >
        {(item) => <span>{item.id}</span>}
      </Repeater>,
    );
    return onReorder;
  }

  it("emits the final order once, not one call per step", () => {
    // The design's rule: reordering is pure UI until release, then one patch.
    const onReorder = renderRepeater();
    screen.getByRole("button", { name: /move item 1 down/i }).click();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("cannot move the last item further down", () => {
    // Marked unavailable rather than disabled, so the keyboard keeps it: see
    // a11y.test.tsx. What matters here is that pressing it moves nothing.
    const onReorder = renderRepeater();
    const down = screen.getByRole<HTMLButtonElement>("button", {
      name: /move item 3 down/i,
    });

    expect(down.getAttribute("aria-disabled")).toBe("true");
    down.click();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("adds nothing once the maximum is reached", () => {
    // Unlike a move, which `move` clamps, an add has nothing behind it: the
    // handler is the caller's and would append an item past the limit.
    const onAdd = vi.fn();
    render(
      <Repeater
        title="Contacts"
        items={[{ id: "a" }, { id: "b" }]}
        max={2}
        onAdd={onAdd}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      >
        {() => null}
      </Repeater>,
    );
    const add = screen.getByRole("button", { name: /Add/i });

    expect(add.getAttribute("aria-disabled")).toBe("true");
    // And the stylesheet's hook, or a button that adds nothing looks live.
    expect(add.getAttribute("data-disabled")).toBe("true");
    add.click();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("reserves a note line per item, whatever it has to say", () => {
    // Reserved either way, so nothing below a row moves as it gains a message.
    renderRepeater();

    expect(screen.getAllByRole("status")).toHaveLength(items.length);
  });

  it("marks a refused row without writing the message twice", () => {
    // The field says it itself. The line takes over only when the row is
    // folded and the field cannot be seen at all.
    renderRepeater();
    const rows = document.querySelectorAll(".perch-repeater__item");

    expect(rows[1]?.getAttribute("data-invalid")).toBe("true");
    expect(screen.getAllByRole("status")[1]?.textContent).not.toContain(
      "Not a valid email address",
    );
  });

  it("offers keyboard reordering on the handle, not mouse only", () => {
    renderRepeater();
    const handle = screen.getByRole("button", { name: /move item 1\. alt/i });
    expect(handle.getAttribute("aria-label")).toMatch(/arrow keys/i);
  });

  it("marks a never-sent item as pending rather than invalid", () => {
    renderRepeater();
    const list = screen.getByRole("list", { name: "Contacts" });
    const third = list.children[2];
    expect(third?.getAttribute("data-pending")).toBe("true");
    expect(third?.getAttribute("data-invalid")).toBe("false");
  });

  it("shows an empty state with a way out", () => {
    render(
      <Repeater
        title="Contacts"
        items={[]}
        onReorder={() => undefined}
        onAdd={() => undefined}
        onRemove={() => undefined}
        emptyTitle="No contacts yet"
        emptyBody="Billing notices go to the owner until you add one."
        addLabel="Add the first contact"
      >
        {() => null}
      </Repeater>,
    );
    expect(screen.getByText("No contacts yet")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add the first contact" })).toBeDefined();
  });
});

describe("field-state", () => {
  it("derives the data attributes the CSS keys off", () => {
    expect(statusAttributes(INVALID)).toEqual({
      "data-state": "rest",
      "data-invalid": "true",
      "data-disabled": "false",
      "data-readonly": "false",
    });
  });

  it("treats read-only as locked, like disabled", () => {
    expect(isLocked({ lifecycle: "rest", readOnly: true })).toBe(true);
    expect(isLocked({ lifecycle: "rest", disabled: true })).toBe(true);
    expect(isLocked(REST)).toBe(false);
  });

  it("gives text 400 ms and everything discrete 0 ms", () => {
    expect(debounceFor("text")).toBe(400);
    expect(debounceFor("textarea")).toBe(400);
    expect(debounceFor("code")).toBe(400);
    expect(debounceFor("select")).toBe(0);
    expect(debounceFor("toggle")).toBe(0);
    expect(debounceFor("date")).toBe(0);
  });
});

describe("parseJsonDocument", () => {
  it("accepts an empty document", () => {
    expect(parseJsonDocument("   ").ok).toBe(true);
  });

  it("reports the line of a syntax error, because the gutter speaks in lines", () => {
    // Asserted on a message V8 does report a position for. The other shape —
    // where it only quotes the offending text — is covered below.
    const result = parseJsonDocument('{\n  "a": 1,\n  "b": 2\n  "c": 3\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.line).toBeGreaterThan(1);
  });

  it("accepts a valid document", () => {
    expect(parseJsonDocument('{"seat_limit": 250}').ok).toBe(true);
  });

  it("omits the line rather than guessing when V8 does not report one", () => {
    // This input produces a message with no position at all. Claiming line 1
    // would point the gutter at the wrong row.
    const result = parseJsonDocument('{\n  "a": 1,\n  "b": [1,\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.message).toBeTruthy();
      expect(result.diagnostic.line).toBeUndefined();
    }
  });
});
