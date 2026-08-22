/**
 * @vitest-environment jsdom
 *
 * The field, and what it does while the editor is still on its way.
 *
 * The editor itself is a dynamic import, so this half is what every page pays
 * for: a frame the right height, something said for a reader who cannot see it
 * waiting, and no ProseMirror anywhere near it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichEditor } from "./RichEditor.js";

afterEach(cleanup);

const binding = {
  id: "body",
  "aria-describedby": "body-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
} as const;

const draw = (over: Partial<Parameters<typeof RichEditor>[0]> = {}): HTMLElement => {
  const { container } = render(
    <RichEditor
      value={null}
      onValueChange={vi.fn()}
      toolbar={["bold"]}
      status={{ lifecycle: "rest" }}
      binding={binding}
      label="Body"
      {...over}
    />,
  );
  return container;
};

describe("while the editor is on its way", () => {
  it("holds the space it will take, so nothing below it moves", () => {
    const container = draw();

    expect(container.querySelector(".perch-rich--waiting")).toBeTruthy();
  });

  it("says what is happening to a reader who cannot see it", () => {
    const container = draw();

    expect(screen.getByText("Loading the editor")).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
