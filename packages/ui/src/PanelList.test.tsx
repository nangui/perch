/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInColumns, resetColumnRegistry } from "./index.js";
import type { RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";

const PAGE: RecordsPage = {
  rows: [
    { id: 1, title: "Ada" },
    { id: 2, title: "Grace" },
  ],
  total: 2,
  columns: {
    columns: [{ type: "TextColumn", path: "title", label: "Headline", sortable: true }],
    defaultSort: { path: "title", direction: "asc" },
  },
};

beforeEach(() => {
  resetColumnRegistry();
  registerBuiltInColumns();
});

afterEach(cleanup);

describe("the list page", () => {
  it("shows the rows it was handed, and how many there are", () => {
    render(<PanelList initial={PAGE} title="Posts" />);

    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("2 records");
  });

  it("counts one record without the plural", () => {
    render(<PanelList initial={{ ...PAGE, total: 1 }} title="Posts" />);

    expect(screen.getByRole("status").textContent).toBe("1 record");
  });

  it("opens on the order the table declared", () => {
    render(<PanelList initial={PAGE} title="Posts" fetchPage={vi.fn()} />);

    expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBe(
      "ascending",
    );
  });

  it("asks the server to reorder rather than sorting what it holds", async () => {
    // Invariant 1. Sorting in the browser would be a second implementation of
    // the ordering, and one that cannot see past the page it holds.
    const fetchPage = vi.fn(() =>
      Promise.resolve({ ...PAGE, rows: [{ id: 2, title: "Grace" }], total: 1 }),
    );
    render(<PanelList initial={PAGE} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    expect(fetchPage).toHaveBeenCalledWith({ path: "title", direction: "desc" });
    await waitFor(() => {
      expect(screen.queryByText("Ada")).toBeNull();
    });
  });

  it("draws the indicator from the answer, not from what it asked", async () => {
    // The server drops a sort on an undeclared column in silence. Believing the
    // request would leave the header claiming an order nobody applied.
    const fetchPage = vi.fn(() =>
      // No `sort` in the answer: the request was refused.
      Promise.resolve({ ...PAGE, columns: { columns: PAGE.columns.columns } }),
    );
    render(<PanelList initial={PAGE} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBe("none");
    });
  });

  it("follows the answer when the server applied a different order", async () => {
    const fetchPage = vi.fn(() =>
      Promise.resolve({ ...PAGE, sort: { path: "title", direction: "desc" as const } }),
    );
    render(<PanelList initial={PAGE} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBe(
        "descending",
      );
    });
  });

  it("keeps the rows it has when the server refuses, and says so", async () => {
    // Replacing them with an empty table would read as "there is nothing here".
    const fetchPage = vi.fn(() => Promise.reject(new Error("500")));
    render(<PanelList initial={PAGE} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("offers no reordering when nothing can answer it", () => {
    render(<PanelList initial={PAGE} title="Posts" />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
