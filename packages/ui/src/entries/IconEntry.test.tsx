/**
 * @vitest-environment jsdom
 */
/**
 * The one mark in the panel that is read aloud.
 *
 * Every other mark sits beside words that already say it, and announcing it
 * says the thing twice. This one is the value: a reader who cannot see a tick
 * has nothing else in the row to go on, so it carries a name rather than being
 * hidden.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IconEntry } from "./IconEntry.js";

afterEach(cleanup);

describe("a mark that is the value", () => {
  it("is announced, under the entry's own label", () => {
    render(<IconEntry mark="check" label="Active" />);

    expect(screen.getByRole("img", { name: "Active" })).toBeTruthy();
  });

  it("falls back to the mark's name where the entry has no label", () => {
    // Worse than a label and far better than silence.
    render(<IconEntry mark="check" />);

    expect(screen.getByRole("img", { name: "check" })).toBeTruthy();
  });

  it("draws the shape, not the word", () => {
    const { container } = render(<IconEntry mark="check" label="Active" />);
    const mark = container.querySelector(".perch-entry__mark");

    expect(mark?.tagName.toLowerCase()).toBe("svg");
    expect(container.textContent).toBe("");
  });

  it("carries the colour the server chose", () => {
    const { container } = render(
      <IconEntry mark="close" tone="danger" label="Active" />,
    );

    expect(
      container.querySelector(".perch-entry__mark")?.getAttribute("data-tone"),
    ).toBe("danger");
  });
});

describe("a record with nothing in it", () => {
  it("says so in words rather than drawing a third mark", () => {
    const { container } = render(<IconEntry label="Active" />);

    expect(container.querySelector("[data-empty='true']")).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("uses the placeholder the resource wrote, when it wrote one", () => {
    render(<IconEntry label="Active" placeholder="Never asked" />);

    expect(screen.getByText("Never asked")).toBeTruthy();
  });

  it("says a dash where nobody wrote one", () => {
    render(<IconEntry label="Active" />);

    expect(screen.getByText("—")).toBeTruthy();
  });
});

describe("a name the panel cannot draw", () => {
  it("reads as an empty record rather than as an empty row", () => {
    // The boot refuses one from a resource; this is what a plugin written in
    // JavaScript would send. Everywhere else an unknown name draws nothing and
    // the words beside it carry on — here the mark is the value, so nothing
    // drawn would be a row blank to the eye and silent to a reader.
    const { container } = render(
      <IconEntry mark="aubergine" label="Active" placeholder="Unknown" />,
    );

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Unknown")).toBeTruthy();
  });
});
