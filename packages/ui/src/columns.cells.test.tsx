/**
 * @vitest-environment jsdom
 *
 * The two cells that draw rather than read.
 *
 * Both are plain functions: a cell renderer is not a component type, which is
 * what keeps a table of a thousand cells from being a thousand components. So
 * they are asked here through the table that calls them.
 */
import type { ColumnNode, ColumnTree, Row } from "@perchjs/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetColumnRegistry } from "./column-registry.js";
import { registerBuiltInColumns } from "./columns.js";
import { DataTable } from "./DataTable.js";

registerBuiltInColumns();

afterEach(() => {
  cleanup();
  resetColumnRegistry();
  registerBuiltInColumns();
});

const draw = (column: ColumnNode, rows: readonly Row[]): HTMLElement => {
  const columns: ColumnTree = {
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
    columns: [column],
  };
  const { container } = render(
    <DataTable columns={columns} rows={rows} caption="People" />,
  );
  return container;
};

describe("a column of images", () => {
  it("draws what the row holds", () => {
    const container = draw({ type: "ImageColumn", path: "avatar" }, [
      { id: 1, avatar: "/files/ada.png" },
    ]);
    const image = container.querySelector("img");

    expect(image?.getAttribute("src")).toBe("/files/ada.png");
    expect(image?.getAttribute("loading")).toBe("lazy");
  });

  it("names the image nothing, because the row already names itself", () => {
    // A screen reader reading an address after the name is noise. A column of
    // images with meaning of their own wants a text column beside it.
    const container = draw({ type: "ImageColumn", path: "avatar" }, [
      { id: 1, avatar: "/files/ada.png" },
    ]);

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("takes the size and the shape it was given", () => {
    const container = draw(
      { type: "ImageColumn", path: "avatar", size: 40, circular: true },
      [{ id: 1, avatar: "/files/ada.png" }],
    );
    const image = container.querySelector("img");

    expect(image?.getAttribute("width")).toBe("40");
    expect(image?.getAttribute("data-circular")).toBe("true");
  });

  it("draws as many as it was allowed and counts the rest", () => {
    const container = draw({ type: "ImageColumn", path: "faces", limit: 2 }, [
      { id: 1, faces: ["/a.png", "/b.png", "/c.png", "/d.png"] },
    ]);

    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("counts nothing where they all fit", () => {
    const container = draw({ type: "ImageColumn", path: "faces", limit: 4 }, [
      { id: 1, faces: ["/a.png", "/b.png"] },
    ]);

    expect(container.querySelector(".perch-cell__more")).toBeNull();
  });

  it("says a cell with nothing in it is empty", () => {
    // Rather than an empty stack, which reads as an image that failed to load.
    const container = draw({ type: "ImageColumn", path: "avatar" }, [
      { id: 1, avatar: null },
    ]);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("—");
  });
});

describe("a column of colours", () => {
  it("draws a swatch of what the row holds", () => {
    const container = draw({ type: "ColorColumn", path: "tint" }, [
      { id: 1, tint: "#21594a" },
    ]);

    expect(
      container.querySelector<HTMLElement>(".perch-cell__swatch")?.style.background,
    ).toBe("rgb(33, 89, 74)");
    expect(screen.getByText("#21594a")).toBeTruthy();
  });

  it("draws one from whichever notation the column keeps", () => {
    const container = draw({ type: "ColorColumn", path: "tint" }, [
      { id: 1, tint: "hsl(164, 46%, 24%)" },
    ]);

    expect(container.querySelector(".perch-cell__swatch")).toBeTruthy();
  });

  it("shows what is not a colour as the text it is", () => {
    // A swatch of nothing says the row is empty when it is not, and the reader
    // is the one who can tell whether the column holds a mistake.
    const container = draw({ type: "ColorColumn", path: "tint" }, [
      { id: 1, tint: "cornflower" },
    ]);

    expect(screen.getByText("cornflower")).toBeTruthy();
    expect(container.querySelector(".perch-cell__swatch")).toBeNull();
  });

  it("puts nothing a browser would fetch into a style", () => {
    // A row holds whatever it holds, and `url(...)` in a background is a
    // request to somewhere nobody chose.
    const container = draw({ type: "ColorColumn", path: "tint" }, [
      { id: 1, tint: "url(https://example.com/track.png)" },
    ]);

    expect(container.querySelector(".perch-cell__swatch")).toBeNull();
    expect(container.innerHTML).not.toContain('track.png")');
  });
});

describe("copying a colour", () => {
  const clipboard = { writeText: vi.fn(() => Promise.resolve()) };

  it("offers a control where the column asked for one", () => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: clipboard,
      configurable: true,
    });

    draw({ type: "ColorColumn", path: "tint", copyable: true }, [
      { id: 1, tint: "#21594a" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Copy #21594a" }));

    expect(clipboard.writeText).toHaveBeenCalledWith("#21594a");
  });

  it("offers none where the browser has no clipboard to write to", () => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    const container = draw({ type: "ColorColumn", path: "tint", copyable: true }, [
      { id: 1, tint: "#21594a" },
    ]);

    expect(container.querySelector(".perch-cell__copy")).toBeNull();
  });
});
