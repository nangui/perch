/**
 * @vitest-environment jsdom
 *
 * Which columns a reader keeps.
 *
 * Only the ones that said they could be taken off are offered: a column a table
 * declared plainly is one its author meant, and offering to remove it would
 * make every table's shape a suggestion.
 *
 * What a reader has taken off is theirs from then on. A page turning is not a
 * reason to put a column back, and that is the part only a rendered page can be
 * wrong about.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";

const page = (): RecordsPage => ({
  rows: [{ id: 1, title: "First", note: "kept", extra: "wide" }],
  total: 1,
  page: 1,
  perPage: 25,
  columns: {
    columns: [
      { type: "TextColumn", path: "title", label: "Title" },
      { type: "TextColumn", path: "note", label: "Note", toggleable: true },
      {
        type: "TextColumn",
        path: "extra",
        label: "Extra",
        toggleable: true,
        hiddenByDefault: true,
      },
    ],
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
  },
  recordKey: "id",
});

const heads = (): readonly string[] =>
  screen.getAllByRole("columnheader").map((one) => one.textContent);

describe("the columns a table starts with", () => {
  it("leaves out the ones declared hidden", () => {
    cleanup();
    render(<PanelList initial={page()} title="Things" />);

    expect(heads()).toContain("Title");
    expect(heads()).toContain("Note");
    expect(heads()).not.toContain("Extra");
  });

  it("offers only the ones that may be taken off", () => {
    cleanup();
    render(<PanelList initial={page()} title="Things" />);
    fireEvent.click(screen.getByText("Columns"));

    const offered = screen.getAllByRole("checkbox").map((box) => {
      const label = box.closest("label");
      return `${label?.textContent ?? ""}:${String((box as HTMLInputElement).checked)}`;
    });

    // `Title` said nothing, so it is not here at all.
    expect(offered).toEqual(["Note:true", "Extra:false"]);
  });

  it("draws no control at all where nothing may be taken off", () => {
    cleanup();
    const plain = page();
    render(
      <PanelList
        initial={{
          ...plain,
          columns: {
            ...plain.columns,
            columns: [{ type: "TextColumn", path: "title", label: "Title" }],
          },
        }}
        title="Things"
      />,
    );

    expect(screen.queryByText("Columns")).toBeNull();
  });
});

describe("what the reader does with it", () => {
  it("puts a column back", () => {
    cleanup();
    render(<PanelList initial={page()} title="Things" />);
    fireEvent.click(screen.getByText("Columns"));
    fireEvent.click(screen.getAllByRole("checkbox")[1] as HTMLElement);

    expect(heads()).toContain("Extra");
  });

  it("takes one off", () => {
    cleanup();
    render(<PanelList initial={page()} title="Things" />);
    fireEvent.click(screen.getByText("Columns"));
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);

    expect(heads()).not.toContain("Note");
  });

  it("keeps the table's order, not the order things were turned on", () => {
    cleanup();
    render(<PanelList initial={page()} title="Things" />);
    fireEvent.click(screen.getByText("Columns"));
    fireEvent.click(screen.getAllByRole("checkbox")[1] as HTMLElement);

    const shown = heads();
    expect(shown.indexOf("Note")).toBeLessThan(shown.indexOf("Extra"));
  });
});

describe("a page that turns underneath it", () => {
  it("does not put back what the reader took off", async () => {
    // A list that re-seeded from every payload would undo the choice on the
    // next page, and the reader would take the same column off twice.
    cleanup();
    const fetchPage = vi.fn().mockResolvedValue({ ...page(), page: 2 });
    render(<PanelList initial={page()} title="Things" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByText("Columns"));
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    expect(heads()).not.toContain("Note");

    const next = screen.queryByRole("button", { name: /next/i });
    if (next !== null) fireEvent.click(next);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(heads()).not.toContain("Note");
  });
});
