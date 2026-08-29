/**
 * @vitest-environment jsdom
 *
 * A mask, in the box rather than in the abstract.
 *
 * `mask.ts` decides what a value looks like, where the caret goes and how much
 * room a shape has, and is tested beside this. What none of that can say is
 * whether anything applies it — a rule computed and dropped looks exactly like
 * one that works from every angle except the page.
 *
 * Three of them are only ever visible here: the caret, which a rewritten value
 * sends to the end of the box unless something puts it back; the ceiling, which
 * is the mask's own room and not a length limit counting other characters; and
 * what happens to a value the field was handed rather than typed.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { TextInput } from "./TextInput.js";

const binding = {
  id: "one",
  "aria-describedby": "one-hint",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
};

/** Controlled the way a page controls it: the value comes back from above. */
function Box({
  mask,
  held = "5551234567",
}: {
  readonly mask?: string;
  readonly held?: string;
}): React.ReactNode {
  const [value, setValue] = useState(held);
  return (
    <TextInput
      value={value}
      onChange={setValue}
      status={{ lifecycle: "rest" }}
      binding={binding}
      {...(mask === undefined ? {} : { mask })}
    />
  );
}

/** Typing one character in, where the box has room for it. */
const typeAt = (box: HTMLInputElement, at: number, character: string): void => {
  const next = `${box.value.slice(0, at)}${character}${box.value.slice(at)}`;
  fireEvent.change(box, { target: { value: next, selectionStart: at + 1 } });
};

/**
 * Typing over a selected character, which is how a full box is corrected — the
 * mask's own room caps it, so the browser refuses a plain insertion there.
 */
const typeOver = (box: HTMLInputElement, at: number, character: string): void => {
  const next = `${box.value.slice(0, at)}${character}${box.value.slice(at + 1)}`;
  fireEvent.change(box, { target: { value: next, selectionStart: at + 1 } });
};

describe("a correction in the middle of a masked box", () => {
  it("leaves the caret where the correction was", () => {
    cleanup();
    const { container } = render(<Box mask="(999) 999-9999" />);
    const box = container.querySelector("input") as HTMLInputElement;
    expect(box.value).toBe("(555) 123-4567");

    typeOver(box, 2, "9");

    expect(box.value).toBe("(595) 123-4567");
    // Not 14, which is where a rewritten value puts it.
    expect(box.selectionStart).toBe(3);
  });

  it("leaves it there when a character is typed into a box with room", () => {
    cleanup();
    const { container } = render(<Box mask="(999) 999-9999" held="555123456" />);
    const box = container.querySelector("input") as HTMLInputElement;
    expect(box.value).toBe("(555) 123-456");

    typeAt(box, 2, "9");

    expect(box.value).toBe("(595) 512-3456");
    expect(box.selectionStart).toBe(3);
  });

  it("is left alone where there is no mask", () => {
    cleanup();
    const { container } = render(<Box />);
    const box = container.querySelector("input") as HTMLInputElement;
    expect(box.value).toBe("5551234567");

    typeAt(box, 2, "9");
    expect(box.value).toBe("55951234567");
  });
});

describe("a value the field was handed rather than typed", () => {
  it("is shown whole where the mask cannot hold it", () => {
    // A row written before the mask existed. Shaping it would show `(555` over
    // a field still holding the whole thing, and the reader would be refused by
    // a rule their box appears to satisfy.
    cleanup();
    const { container } = render(<Box mask="(999) 999-9999" held="555CALLNOW" />);
    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "555CALLNOW",
    );
  });

  it("is shaped where the mask can", () => {
    cleanup();
    const { container } = render(<Box mask="(999) 999-9999" held="5551234567" />);
    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "(555) 123-4567",
    );
  });
});

describe("what the box will hold at most", () => {
  it("is the mask's own room, not a limit counting other characters", () => {
    cleanup();
    const { container } = render(<Box mask="(999) 999-9999" />);
    expect((container.querySelector("input") as HTMLInputElement).maxLength).toBe(14);
  });

  it("is whatever was asked for where there is no mask", () => {
    cleanup();
    const { container } = render(
      <TextInput
        value=""
        onChange={vi.fn()}
        status={{ lifecycle: "rest" }}
        binding={binding}
        maxLength={10}
      />,
    );
    expect((container.querySelector("input") as HTMLInputElement).maxLength).toBe(10);
  });
});
