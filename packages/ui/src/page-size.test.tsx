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
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";
import { remember } from "./remembered.js";

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

// What Radix asks of an element and jsdom does not draw.
beforeAll(() => {
  const element = Element.prototype as unknown as Record<string, unknown>;
  element["hasPointerCapture"] = () => false;
  element["setPointerCapture"] = () => undefined;
  element["releasePointerCapture"] = () => undefined;
  element["scrollIntoView"] = () => undefined;
});

const size = (): HTMLElement =>
  screen.getByRole("combobox", { name: /rows per page/i });

/** Opens the list and picks one, the way a reader does. */
const pick = (rows: string): void => {
  fireEvent.click(size());
  fireEvent.click(screen.getByRole("option", { name: rows }));
};

describe("the page size control", () => {
  it("offers a short list and shows what the page holds", () => {
    cleanup();
    render(<PanelList initial={page()} title="Things" fetchPage={vi.fn()} />);

    expect(size().textContent).toBe("25");
    fireEvent.click(size());
    const options = screen.getAllByRole("option");
    expect(options.map((one) => one.textContent.replace("✓", ""))).toEqual([
      "10",
      "25",
      "50",
      "100",
    ]);
    // `data-state` rather than `aria-selected`, which Radix sets on the focused
    // option only.
    expect(options.map((one) => one.getAttribute("data-state"))).toEqual([
      "unchecked",
      "checked",
      "unchecked",
      "unchecked",
    ]);
  });

  it("asks for the first page, because page 3 of 25 is not page 3 of 50", () => {
    // Keeping the number would land the reader somewhere they did not choose,
    // which is why sorting and searching already start over.
    cleanup();
    const fetchPage = vi.fn().mockResolvedValue(page({ page: 1, perPage: 50 }));
    render(<PanelList initial={page()} title="Things" fetchPage={fetchPage} />);

    pick("50");

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({ page: 1, perPage: 50 });
  });

  it("keeps what the list was narrowed to", () => {
    // A size is how many of these rows, not a reason to show different ones.
    cleanup();
    const fetchPage = vi.fn().mockResolvedValue(page({ page: 1, perPage: 50 }));
    render(
      <PanelList
        initial={page({ search: "ada", filters: { status: "draft" } })}
        title="Things"
        fetchPage={fetchPage}
      />,
    );

    pick("50");

    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({
      search: "ada",
      filters: { status: "draft" },
      page: 1,
      perPage: 50,
    });
  });

  it("asks for the size it remembers without dropping the address's filters", () => {
    // Arriving on a link to a narrowed list, with a size kept from last time,
    // asked for that size of the whole table.
    cleanup();
    remember("/admin/things", { perPage: 50 });
    const fetchPage = vi.fn().mockResolvedValue(page({ page: 1, perPage: 50 }));
    render(
      <PanelList
        initial={page({ resourcePath: "/admin/things", filters: { status: "draft" } })}
        title="Things"
        fetchPage={fetchPage}
      />,
    );

    expect(fetchPage.mock.calls[0]?.[0]).toMatchObject({
      filters: { status: "draft" },
      perPage: 50,
    });
    globalThis.localStorage.clear();
  });

  it("shows what came back rather than what was picked", async () => {
    // A server that answers with a different size — a cap, a stale address —
    // is the one telling the truth about the rows on screen.
    cleanup();
    const fetchPage = vi.fn().mockResolvedValue(page({ page: 1, perPage: 25 }));
    render(<PanelList initial={page()} title="Things" fetchPage={fetchPage} />);

    pick("100");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(size().textContent).toBe("25");
  });

  it("is not drawn where the list cannot ask for another page", () => {
    // No transport, no turning: a control that cannot do anything is worse
    // than none, because it looks like one that can.
    cleanup();
    render(<PanelList initial={page()} title="Things" />);

    expect(screen.queryByRole("combobox", { name: /rows per page/i })).toBeNull();
  });
});
