/**
 * @vitest-environment jsdom
 *
 * A swatch and a box, both speaking hex.
 *
 * Most of what is tested here is what the box does before the server sees
 * anything: a colour half typed is not a colour, and sent, it would be turned
 * away at the boundary in silence.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./ColorPicker.js";

afterEach(cleanup);

const binding = {
  id: "tint",
  "aria-describedby": "tint-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const draw = (
  over: Partial<Parameters<typeof ColorPicker>[0]> = {},
): {
  onValueChange: ReturnType<typeof vi.fn>;
  container: HTMLElement;
  box: HTMLInputElement;
  swatch: HTMLInputElement;
} => {
  const onValueChange = vi.fn();
  const { container } = render(
    <ColorPicker
      value={null}
      onValueChange={onValueChange}
      status={{ lifecycle: "rest" }}
      binding={binding}
      label="Tint"
      {...over}
    />,
  );
  const box = container.querySelector<HTMLInputElement>(".perch-color__text");
  const swatch = container.querySelector<HTMLInputElement>(".perch-color__swatch");
  if (box === null || swatch === null) throw new Error("the field drew no control");
  return { onValueChange, container, box, swatch };
};

describe("picking a colour", () => {
  it("takes what the browser's own picker gives", () => {
    const { onValueChange, swatch } = draw();

    fireEvent.change(swatch, { target: { value: "#21594A" } });

    expect(onValueChange).toHaveBeenCalledWith("#21594a");
  });

  it("names the swatch, which is a control of its own", () => {
    // Two controls in one frame, and only one of them can carry the label.
    draw();

    expect(screen.getByLabelText("Pick Tint")).toBeTruthy();
  });

  it("shows the colour it holds", () => {
    const { swatch, box } = draw({ value: "#21594a" });

    expect(swatch.value).toBe("#21594a");
    expect(box.value).toBe("#21594a");
  });
});

describe("typing a colour", () => {
  it("takes it once it is one", () => {
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "#21594a" } });

    expect(onValueChange).toHaveBeenCalledWith("#21594a");
  });

  it("says nothing while it is still half typed", () => {
    // Sent, it would be refused at the boundary without a word.
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "#21" } });
    fireEvent.change(box, { target: { value: "#2159" } });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("keeps what is being typed on screen, whatever the value is", () => {
    const { box } = draw({ value: "#21594a" });

    fireEvent.change(box, { target: { value: "#ff" } });

    expect(box.value).toBe("#ff");
  });

  it("puts the colour back when the box is left half typed", () => {
    const { onValueChange, box } = draw({ value: "#21594a" });

    fireEvent.change(box, { target: { value: "#ff" } });
    fireEvent.blur(box);

    expect(box.value).toBe("#21594a");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("takes the hash nobody typed", () => {
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "21594A" } });

    expect(onValueChange).toHaveBeenLastCalledWith("#21594a");
  });

  it("takes the shorthand once the box is left, and not before", () => {
    // Every six-digit colour is typed through a three-digit one. Read as the
    // shorthand on the way past, the swatch turns a colour the reader is
    // halfway through not choosing.
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "#ff8" } });
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.blur(box);
    expect(onValueChange).toHaveBeenCalledWith("#ffff88");
  });

  it("takes it on Enter too, which is the other way of being done", () => {
    const { onValueChange, box } = draw();

    fireEvent.change(box, { target: { value: "#ff8" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("#ffff88");
  });

  it("says nothing about a colour it already holds", () => {
    // Announcing a change that did not happen marks the form dirty and asks
    // the server about a value it has.
    const { onValueChange, box } = draw({ value: "#21594a" });

    fireEvent.change(box, { target: { value: "#21594A" } });

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("a column with no colour in it", () => {
  it("wears the frame every other empty control wears", () => {
    // A colour control has a value whatever happens, so it cannot show this
    // for itself.
    const { container } = draw();

    expect(container.querySelector(".perch-color")?.getAttribute("data-empty")).toBe(
      "true",
    );
  });

  it("leaves the box empty rather than showing the black it stands on", () => {
    const { box, swatch } = draw();

    expect(box.value).toBe("");
    expect(swatch.value).toBe("#000000");
  });

  it("is where emptying the box goes, which is the way back", () => {
    const { onValueChange, box } = draw({ value: "#21594a" });

    fireEvent.change(box, { target: { value: "" } });

    expect(onValueChange).toHaveBeenCalledWith(null);
  });
});

describe("a column holding something that is not a colour", () => {
  it("shows what it holds, because that is where the reader finds out", () => {
    const { box } = draw({ value: "cornflower" });

    expect(box.value).toBe("cornflower");
  });

  it("says no colour rather than stating the black it stands on", () => {
    const { container, swatch } = draw({ value: "cornflower" });

    expect(container.querySelector(".perch-color")?.getAttribute("data-empty")).toBe(
      "true",
    );
    expect(swatch.value).toBe("#000000");
  });
});

describe("a reader passing through the field", () => {
  it("leaves the colour where it was", () => {
    // Tabbing in and out again is not an empty box, and an empty box is the
    // one way to no colour at all.
    const { onValueChange, box } = draw({ value: "#21594a" });

    fireEvent.focus(box);
    fireEvent.blur(box);

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("and does not clear it by pressing Enter on the way past", () => {
    const { onValueChange, box } = draw({ value: "#21594a" });

    fireEvent.keyDown(box, { key: "Enter" });

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("what the shell wired up", () => {
  it("points the label and the help line at the box", () => {
    const { box } = draw();

    expect(box.id).toBe("tint");
    expect(box.getAttribute("aria-describedby")).toBe("tint-help");
  });
});

describe("a field nobody may write to", () => {
  it("puts both controls out of reach", () => {
    const { box, swatch } = draw({
      value: "#21594a",
      status: { lifecycle: "rest", disabled: true },
      binding: { ...binding, disabled: true },
    });

    expect(box.disabled).toBe(true);
    expect(swatch.disabled).toBe(true);
  });
});
