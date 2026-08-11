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
  page: 1,
  perPage: 25,
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

    expect(fetchPage).toHaveBeenCalledWith({
      sort: { path: "title", direction: "desc" },
      page: 1,
    });
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
    const create = screen.getByRole("link", { name: "Create" });

    expect(create.getAttribute("href")).toBe("/admin/posts/create");
    // The page main action, which is what the primary variant is for. It read
    // as one only because a duplicate rule painted every button that colour.
    expect(create.className).toContain("perch-button--primary");
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

describe("turning a page", () => {
  /** Three pages of two, so there is a previous and a next to reach. */
  const paged = (page: number): RecordsPage => ({
    ...PAGE,
    total: 6,
    perPage: 2,
    page,
  });

  it("shows no controls when everything fits on one page", () => {
    render(<PanelList initial={PAGE} title="Posts" fetchPage={vi.fn()} />);

    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("2 records");
  });

  it("says which page of how many, next to the count", () => {
    render(<PanelList initial={paged(2)} title="Posts" fetchPage={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toBe("Page 2 of 3, 6 records");
  });

  it("asks the server for the next page rather than slicing what it holds", async () => {
    // Invariant 1, the same reason sorting is a round trip: the client cannot
    // see past the page it was given.
    const fetchPage = vi.fn(() => Promise.resolve(paged(3)));
    render(<PanelList initial={paged(2)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Page 3 of 3, 6 records");
    });
    expect(fetchPage).toHaveBeenCalledWith({
      page: 3,
      sort: { path: "title", direction: "asc" },
    });
  });

  it("keeps the order it is in while turning", () => {
    // Turning a page in a different order than the one on screen would reorder
    // the table without being asked.
    const fetchPage = vi.fn(() => Promise.resolve(paged(1)));
    render(<PanelList initial={paged(2)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(fetchPage).toHaveBeenCalledWith({
      page: 1,
      sort: { path: "title", direction: "asc" },
    });
  });

  it("starts over when the order changes", async () => {
    // Page 5 of one order is not page 5 of another.
    const fetchPage = vi.fn(() => Promise.resolve(paged(1)));
    render(<PanelList initial={paged(3)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalledWith({
        page: 1,
        sort: { path: "title", direction: "desc" },
      });
    });
  });

  it("offers no way off either end", () => {
    const { unmount } = render(
      <PanelList initial={paged(1)} title="Posts" fetchPage={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Previous" }).getAttribute("aria-disabled"),
    ).toBe("true");
    unmount();

    render(<PanelList initial={paged(3)} title="Posts" fetchPage={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("shows the page the server served, not the one that was clicked", async () => {
    // The server caps the paging depth, so what comes back is not always what
    // was asked for. A counter advanced locally would disagree with the rows.
    const fetchPage = vi.fn(() => Promise.resolve(paged(2)));
    render(<PanelList initial={paged(2)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Page 2 of 3, 6 records");
    });
  });

  it("ignores an answer overtaken by a later one", async () => {
    // Click Next, then Previous, and let the first answer arrive last. Without
    // a guard the stale page wins and the reader is somewhere they left. This
    // is the ordering bug the form transport solves with sequence numbers; the
    // list had no equivalent.
    const answers: ((value: RecordsPage) => void)[] = [];
    const fetchPage = vi.fn(
      () => new Promise<RecordsPage>((resolve) => answers.push(resolve)),
    );
    render(<PanelList initial={paged(2)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    // Out of order on purpose: the newer request answers first.
    answers[1]?.(paged(1));
    answers[0]?.(paged(3));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Page 1 of 3, 6 records");
    });
  });

  it("does not raise an alarm about a request nobody is waiting on", async () => {
    // Next fails, Previous succeeds, and the refusal lands last. Without the
    // same guard the answers get, the page that loaded fine wears an alert.
    const outcomes: { resolve: (v: RecordsPage) => void; reject: () => void }[] = [];
    const fetchPage = vi.fn(
      () =>
        new Promise<RecordsPage>((resolve, reject) => {
          outcomes.push({
            resolve,
            reject: () => {
              reject(new Error("500"));
            },
          });
        }),
    );
    render(<PanelList initial={paged(2)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    outcomes[1]?.resolve(paged(1));
    outcomes[0]?.reject();

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Page 1 of 3, 6 records");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the same thing whichever round trip failed", async () => {
    // The message covers both now. "Could not reorder" read as a lie the first
    // time a page failed to turn.
    const fetchPage = vi.fn(() => Promise.reject(new Error("500")));
    render(<PanelList initial={paged(2)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).not.toContain("reorder");
    });
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("keeps a control with nowhere to go in the tab order", () => {
    // `disabled` takes an element out of the tab order, and a browser drops the
    // focus it was holding to the body — so a keyboard reader who pressed Next
    // to the last page is left nowhere, and the next Tab starts again from the
    // top of the document.
    //
    // The focus itself is not asserted here: jsdom does not move it on disable,
    // measured, so that test passes whichever way this is written. What is
    // asserted is the mechanism that avoids the question — the control stays a
    // real, focusable button and says it is unavailable.
    render(<PanelList initial={paged(3)} title="Posts" fetchPage={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Next" });

    // The semantics say unavailable; the property that would remove it from the
    // tab order is the one that must stay off.
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next).toHaveProperty("disabled", false);
    // And the stylesheet's own hook, or it looks as pressable as a live one.
    expect(next.getAttribute("data-disabled")).toBe("true");
  });

  it("does nothing when a control with nowhere to go is pressed anyway", () => {
    // It stays focusable, so it stays pressable. What it must not do is ask.
    const fetchPage = vi.fn(() => Promise.resolve(paged(3)));
    render(<PanelList initial={paged(3)} title="Posts" fetchPage={fetchPage} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("cannot be turned at all when nothing fetches", () => {
    render(<PanelList initial={paged(2)} title="Posts" />);

    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});
