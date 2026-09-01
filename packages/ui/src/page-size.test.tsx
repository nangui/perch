/**
 * @vitest-environment jsdom
 *
 * How many rows a reader sees at once.
 *
 * A short list rather than a box they type a number into: the point is to see
 * more or less, and a field accepting 7 or 4000 offers a choice nobody wants
 * and a query somebody's database does not.
 *
 * What it shows is the server's answer, never what was clicked — the same rule
 * the pager and the sort indicator follow. Advancing the control locally would
 * say fifty while the page held twenty-five.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";

const page = (over: Partial<RecordsPage> = {}): RecordsPage => ({
  rows: [{ id: 1, title: "First" }],
  total: 90,
  page: 3,
  perPage: 25,
  columns: {
    columns: [{ type: "TextColumn", path: "title", label: "Title" }],
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
  },
  recordKey: "id",
  ...over,
});

const size = (): HTMLSelectElement => screen.getByLabelText(/rows per page/i);

describe("the page size control", () => {
  it("offers a short list and shows what the page holds", () => {
    cleanup();
    render(<PanelList initial={page()} title="Things" fetchPage={vi.fn()} />);

    expect([...size().options].map((one) => one.value)).toEqual([
      "10",
      "25",
      "50",
      "100",
    ]);
    expect(size().value).toBe("25");
  });

  it("asks for the first page, because page 3 of 25 is not page 3 of 50", () => {
    // Keeping the number would land the reader somewhere they did not choose,
    // which is why sorting and searching already start over.
    cleanup();
    const fetchPage = vi.fn().mockResolvedValue(page({ page: 1, perPage: 50 }));
    render(<PanelList initial={page()} title="Things" fetchPage={fetchPage} />);

    fireEvent.change(size(), { target: { value: "50" } });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({ page: 1, perPage: 50 });
  });

  it("shows what came back rather than what was picked", async () => {
    // A server that answers with a different size — a cap, a stale address —
    // is the one telling the truth about the rows on screen.
    cleanup();
    const fetchPage = vi.fn().mockResolvedValue(page({ page: 1, perPage: 25 }));
    render(<PanelList initial={page()} title="Things" fetchPage={fetchPage} />);

    fireEvent.change(size(), { target: { value: "100" } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(size().value).toBe("25");
  });

  it("is not drawn where the list cannot ask for another page", () => {
    // No transport, no turning: a control that cannot do anything is worse
    // than none, because it looks like one that can.
    cleanup();
    render(<PanelList initial={page()} title="Things" />);

    expect(screen.queryByLabelText(/rows per page/i)).toBeNull();
  });
});
