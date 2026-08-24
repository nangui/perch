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

const draw = (
  column: ColumnNode,
  rows: readonly Row[],
  over: Partial<Parameters<typeof DataTable>[0]> = {},
): HTMLElement => {
  const columns: ColumnTree = {
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
    columns: [column],
  };
  const { container } = render(
    <DataTable columns={columns} rows={rows} caption="People" {...over} />,
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

describe("a cell this reader may write", () => {
  const ROW = [{ id: 1, title: "Ada", active: false }];

  it("draws a control, named for the row it is in", () => {
    // A page of switches all called "Active" is a list of identical controls to
    // anybody not reading it by eye. What names the row is the table's own
    // reading column, not whatever string the row carries first: a projected
    // row holds an avatar's address as readily as a name.
    const columns: ColumnTree = {
      actions: [],
      filters: [],
      headerActions: [],
      bulkActions: [],
      columns: [
        { type: "ImageColumn", path: "avatar" },
        { type: "TextColumn", path: "title" },
        { type: "ToggleColumn", path: "active", label: "Active", editable: true },
      ],
    };
    render(
      <DataTable
        columns={columns}
        rows={[{ id: 1, avatar: "/files/ada.png", title: "Ada", active: false }]}
        caption="People"
        onCellWrite={vi.fn()}
      />,
    );

    expect(screen.getByRole("switch", { name: "Active: Ada" })).toBeTruthy();
  });

  it("asks for the value the reader chose", () => {
    const onCellWrite = vi.fn();
    draw({ type: "ToggleColumn", path: "active", editable: true }, ROW, {
      onCellWrite,
    });

    fireEvent.click(screen.getByRole("switch"));

    expect(onCellWrite).toHaveBeenCalledWith(ROW[0], expect.anything(), true);
  });

  it("draws a box where the column asked for one", () => {
    draw({ type: "CheckboxColumn", path: "active", editable: true }, ROW, {
      onCellWrite: vi.fn(),
    });

    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows what the row holds, never a copy of its own", () => {
    // The server owns the value, so a refused write shows itself by the cell
    // going back to what it was.
    draw(
      { type: "ToggleColumn", path: "active", editable: true },
      [{ id: 1, title: "Ada", active: true }],
      { onCellWrite: vi.fn() },
    );

    expect(screen.getByRole("switch")).toHaveProperty("checked", true);
  });

  it("refuses input while it is waiting on an answer", () => {
    draw({ type: "ToggleColumn", path: "active", editable: true }, ROW, {
      onCellWrite: vi.fn(),
      cellPending: () => true,
    });

    expect(screen.getByRole("switch")).toHaveProperty("disabled", true);
  });

  it("shows what was asked for while it waits, not what the row still holds", () => {
    // A control that does not move when it is pressed reads as one that did
    // not hear. The server still decides: what comes back replaces this.
    draw({ type: "ToggleColumn", path: "active", editable: true }, ROW, {
      onCellWrite: vi.fn(),
      cellPending: () => true,
      cellAsked: () => true,
    });

    expect(screen.getByRole("switch")).toHaveProperty("checked", true);
  });

  it("goes back to the row once the answer has landed", () => {
    draw({ type: "ToggleColumn", path: "active", editable: true }, ROW, {
      onCellWrite: vi.fn(),
      cellPending: () => false,
      cellAsked: () => true,
    });

    expect(screen.getByRole("switch")).toHaveProperty("checked", false);
  });
});

describe("a line of text in a cell", () => {
  const ROW = [{ id: 1, title: "Ada", note: "Wrote the first algorithm" }];
  const COLUMN: ColumnNode = { type: "TextInputColumn", path: "note", editable: true };

  it("shows what the row holds, in a box the reader may type in", () => {
    draw(COLUMN, ROW, { onCellWrite: vi.fn() });

    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      "Wrote the first algorithm",
    );
  });

  it("names the row even where the reading column is an editable one", () => {
    // A column of text is what a reader reads the row by, editable or not.
    // Counting only the read-only ones left every control named after its
    // column and nothing else, a hundred times down the page.
    const columns: ColumnTree = {
      actions: [],
      filters: [],
      headerActions: [],
      bulkActions: [],
      columns: [
        { type: "TextInputColumn", path: "title", label: "Title", editable: true },
        { type: "ToggleColumn", path: "active", label: "Active", editable: true },
      ],
    };
    render(
      <DataTable
        columns={columns}
        rows={[{ id: 1, title: "Ada", active: false }]}
        caption="People"
        onCellWrite={vi.fn()}
      />,
    );

    expect(screen.getByRole("switch", { name: "Active: Ada" })).toBeTruthy();
  });

  it("draws the box the field asked for, and takes what it takes", () => {
    // The form owns the rules; the cell is told rather than left to guess. A
    // bare line of text over an address only says no after the round trip.
    draw(
      {
        type: "TextInputColumn",
        path: "note",
        editable: true,
        flavour: "email",
        maxLength: 20,
      },
      ROW,
      { onCellWrite: vi.fn() },
    );
    const box = screen.getByRole("textbox");

    expect(box.getAttribute("type")).toBe("email");
    expect(box.getAttribute("maxlength")).toBe("20");
  });

  it("says nothing while it is being typed", () => {
    // A write per keystroke is a write per keystroke.
    const onCellWrite = vi.fn();
    draw(COLUMN, ROW, { onCellWrite });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Wrote t" } });

    expect(onCellWrite).not.toHaveBeenCalled();
  });

  it("commits when the box is left", () => {
    const onCellWrite = vi.fn();
    draw(COLUMN, ROW, { onCellWrite });
    const box = screen.getByRole("textbox");

    fireEvent.change(box, { target: { value: "Wrote the first compiler" } });
    fireEvent.blur(box);

    expect(onCellWrite).toHaveBeenCalledWith(
      ROW[0],
      expect.anything(),
      "Wrote the first compiler",
    );
  });

  it("commits on Enter, without submitting the page", () => {
    const onCellWrite = vi.fn();
    draw(COLUMN, ROW, { onCellWrite });
    const box = screen.getByRole("textbox");

    fireEvent.change(box, { target: { value: "Something else" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(onCellWrite).toHaveBeenCalledWith(
      ROW[0],
      expect.anything(),
      "Something else",
    );
  });

  it("says nothing where nothing was changed", () => {
    // Leaving a box the reader only looked at is not a write, and announcing
    // one asks the server about a value it already has.
    const onCellWrite = vi.fn();
    draw(COLUMN, ROW, { onCellWrite });

    fireEvent.blur(screen.getByRole("textbox"));

    expect(onCellWrite).not.toHaveBeenCalled();
  });

  it("keeps the cursor where it was when Enter commits", () => {
    // The element is replaced when the value it was given changes, and the
    // value in flight is not that value: a box the reader is still standing in
    // must not be pulled out from under them.
    const onCellWrite = vi.fn();
    const columns: ColumnTree = {
      actions: [],
      filters: [],
      headerActions: [],
      bulkActions: [],
      columns: [COLUMN],
    };
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={ROW}
        caption="People"
        onCellWrite={onCellWrite}
      />,
    );

    const box = screen.getByRole("textbox");
    box.focus();
    fireEvent.change(box, { target: { value: "Wrote the first compiler" } });
    fireEvent.keyDown(box, { key: "Enter" });

    // The write is in flight now, and the row still holds what it held.
    rerender(
      <DataTable
        columns={columns}
        rows={ROW}
        caption="People"
        onCellWrite={onCellWrite}
        cellPending={() => true}
        cellAsked={() => "Wrote the first compiler"}
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole("textbox"));
    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      "Wrote the first compiler",
    );

    // And when the answer lands, the row itself changes. That is the moment the
    // cursor used to go: the element was replaced because the value it had been
    // given was no longer the same.
    rerender(
      <DataTable
        columns={columns}
        rows={[{ id: 1, title: "Ada", note: "Wrote the first compiler" }]}
        caption="People"
        onCellWrite={onCellWrite}
      />,
    );

    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("takes the server's answer where nobody is standing in the box", () => {
    const columns: ColumnTree = {
      actions: [],
      filters: [],
      headerActions: [],
      bulkActions: [],
      columns: [COLUMN],
    };
    const { rerender } = render(
      <DataTable columns={columns} rows={ROW} caption="People" onCellWrite={vi.fn()} />,
    );

    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      "Wrote the first algorithm",
    );

    rerender(
      <DataTable
        columns={columns}
        rows={[{ id: 1, title: "Ada", note: "Something the server said" }]}
        caption="People"
        onCellWrite={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      "Something the server said",
    );
  });

  it("puts the row's value back on Escape", () => {
    const onCellWrite = vi.fn();
    draw(COLUMN, ROW, { onCellWrite });
    const box = screen.getByRole("textbox");

    fireEvent.change(box, { target: { value: "Half a thought" } });
    fireEvent.keyDown(box, { key: "Escape" });

    expect(box).toHaveProperty("value", "Wrote the first algorithm");
    expect(onCellWrite).not.toHaveBeenCalled();
  });

  it("shows the value out of reach where nobody would carry a write", () => {
    const container = draw({ type: "TextInputColumn", path: "note" }, ROW, {
      onCellWrite: vi.fn(),
    });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container.textContent).toContain("Wrote the first algorithm");
  });
});

describe("a choice in a cell", () => {
  const ROW = [{ id: 1, title: "Ada", role: "lead" }];
  const COLUMN: ColumnNode = {
    type: "SelectColumn",
    path: "role",
    label: "Role",
    editable: true,
    options: [
      { value: "lead", label: "Lead" },
      { value: "member", label: "Member" },
    ],
  };

  it("offers exactly what the field declared, and shows what is held", () => {
    // The choices are the field's, over the wire: a cell offering anything else
    // offers a value the boundary will not take.
    draw(COLUMN, ROW, { onCellWrite: vi.fn() });
    // Named for the column alone here: this table has no text column to read
    // the row by, which is its own test above.
    const box = screen.getByRole("combobox", { name: "Role" });

    expect([...box.querySelectorAll("option")].map((one) => one.textContent)).toEqual([
      "Lead",
      "Member",
    ]);
    expect(box).toHaveProperty("value", "lead");
  });

  it("commits the moment a choice is made", () => {
    // Nothing half-typed to wait for, unlike a line of text.
    const onCellWrite = vi.fn();
    draw(COLUMN, ROW, { onCellWrite });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "member" } });

    expect(onCellWrite).toHaveBeenCalledWith(ROW[0], expect.anything(), "member");
  });

  it("shows a cell holding nothing as holding nothing", () => {
    draw(COLUMN, [{ id: 1, title: "Ada", role: null }], { onCellWrite: vi.fn() });

    expect(screen.getByRole("combobox")).toHaveProperty("value", "");
  });

  it("takes the server's answer where nobody is standing in it", () => {
    const columns: ColumnTree = {
      actions: [],
      filters: [],
      headerActions: [],
      bulkActions: [],
      columns: [COLUMN],
    };
    const { rerender } = render(
      <DataTable columns={columns} rows={ROW} caption="People" onCellWrite={vi.fn()} />,
    );

    rerender(
      <DataTable
        columns={columns}
        rows={[{ id: 1, title: "Ada", role: "member" }]}
        caption="People"
        onCellWrite={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveProperty("value", "member");
  });

  it("reads rather than offers where the column carries no list", () => {
    // A list that could not cross the wire — one from a resolver — is a control
    // with nothing in it, which is worse than the value written out.
    const container = draw(
      { type: "SelectColumn", path: "role", editable: true },
      ROW,
      {
        onCellWrite: vi.fn(),
      },
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(container.textContent).toContain("lead");
  });
});

describe("a cell this reader may not write", () => {
  const ROW = [{ id: 1, title: "Ada", active: true }];

  it("shows the value out of reach rather than a control that does nothing", () => {
    draw({ type: "ToggleColumn", path: "active" }, ROW, { onCellWrite: vi.fn() });

    expect(screen.getByRole("switch")).toHaveProperty("disabled", true);
    expect(screen.getByRole("switch")).toHaveProperty("checked", true);
  });

  it("does the same where the host would carry nothing out", () => {
    draw({ type: "ToggleColumn", path: "active", editable: true }, ROW);

    expect(screen.getByRole("switch")).toHaveProperty("disabled", true);
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
