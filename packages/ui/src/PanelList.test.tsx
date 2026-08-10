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
    actions: [{ type: "EditAction" }],
    headerActions: [{ type: "CreateAction" }],
    defaultSort: { path: "title", direction: "asc" },
  },
  recordKey: "id",
  resourcePath: "/admin/posts",
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

    expect(screen.getAllByRole("columnheader")[0]?.getAttribute("aria-sort")).toBe(
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
      Promise.resolve({
        ...PAGE,
        columns: { columns: PAGE.columns.columns, actions: [], headerActions: [] },
      }),
    );
    render(<PanelList initial={PAGE} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(screen.getAllByRole("columnheader")[0]?.getAttribute("aria-sort")).toBe(
        "none",
      );
    });
  });

  it("follows the answer when the server applied a different order", async () => {
    const fetchPage = vi.fn(() =>
      Promise.resolve({ ...PAGE, sort: { path: "title", direction: "desc" as const } }),
    );
    render(<PanelList initial={PAGE} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(screen.getAllByRole("columnheader")[0]?.getAttribute("aria-sort")).toBe(
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

  it("links each row to its own edit page, by the key the server named", () => {
    // Not `id` by convention: the response says which column addresses a row,
    // and a model keyed on `uuid` is addressed by `uuid`.
    render(<PanelList initial={PAGE} title="Posts" />);
    const links = screen.getAllByRole("link", { name: "Edit" });

    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("/admin/posts/1/edit");
    expect(links[1]?.getAttribute("href")).toBe("/admin/posts/2/edit");
  });

  it("keeps the panel's own prefix", () => {
    render(
      <PanelList
        initial={{ ...PAGE, resourcePath: "/api/v1/admin/posts" }}
        title="Posts"
      />,
    );

    expect(screen.getAllByRole("link", { name: "Edit" })[0]?.getAttribute("href")).toBe(
      "/api/v1/admin/posts/1/edit",
    );
  });

  it("addresses a row by whatever the model calls its key", () => {
    render(
      <PanelList
        initial={{
          ...PAGE,
          recordKey: "uuid",
          rows: [{ uuid: "a-b-c", title: "Ada" }],
        }}
        title="Posts"
      />,
    );

    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/admin/posts/a-b-c/edit",
    );
  });

  it("offers nothing when the server would not vouch for the address", () => {
    // The server withholds `resourcePath` when the root it was built from is not
    // one this origin owns. A client that filled the gap in would undo it.
    const withoutPath: RecordsPage = { ...PAGE };
    delete (withoutPath as { resourcePath?: string }).resourcePath;
    render(<PanelList initial={withoutPath} title="Posts" />);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers nothing on a row the server gave no key for", () => {
    // A dead link is worse than no link.
    render(<PanelList initial={{ ...PAGE, rows: [{ title: "Ada" }] }} title="Posts" />);

    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("offers a create link above the table, from the same path", () => {
    render(<PanelList initial={PAGE} title="Posts" />);

    expect(screen.getByRole("link", { name: "Create" }).getAttribute("href")).toBe(
      "/admin/posts/create",
    );
  });

  it("leaves no empty header when every action is skipped", () => {
    render(
      <PanelList
        initial={{
          ...PAGE,
          columns: { ...PAGE.columns, headerActions: [{ type: "ImportAction" }] },
        }}
        title="Posts"
      />,
    );

    expect(document.querySelector(".perch-list__actions")).toBeNull();
  });

  it("skips a header action the renderer has no meaning for", () => {
    render(
      <PanelList
        initial={{
          ...PAGE,
          columns: { ...PAGE.columns, headerActions: [{ type: "ImportAction" }] },
        }}
        title="Posts"
      />,
    );

    expect(screen.queryByRole("link", { name: /Import/ })).toBeNull();
  });

  it("offers no reordering when nothing can answer it", () => {
    render(<PanelList initial={PAGE} title="Posts" />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
