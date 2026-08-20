/**
 * @vitest-environment jsdom
 *
 * A record's children, under the form that edits it.
 *
 * The rule the tests are about: a tab's rows are fetched when it is opened.
 * A record with six managers has to cost one page, not seven, and a tab nobody
 * looked at has to cost nothing at all.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInColumns, resetColumnRegistry } from "./index.js";
import type { RecordsPage } from "./PanelList.js";
import { PanelRelations } from "./PanelRelations.js";

const RELATIONS = [
  { relation: "comments", label: "Comments" },
  { relation: "notes", label: "Notes" },
];

const page = (title: string): RecordsPage => ({
  rows: [{ id: 1, body: title }],
  total: 1,
  page: 1,
  perPage: 25,
  columns: {
    columns: [{ type: "TextColumn", path: "body", label: "Body" }],
    actions: [{ type: "DeleteAction", name: "DeleteAction", trigger: "run" }],
    filters: [],
    headerActions: [],
    bulkActions: [],
  },
  recordKey: "id",
});

/** Which relations were asked for, in the order they were asked. */
const asked = (fetchPage: Mock): string[] =>
  fetchPage.mock.calls.map((call) => String(call[0]));

const nothing = {
  runAction: vi.fn(),
  actionForm: vi.fn(),
  actionState: vi.fn(),
};

beforeEach(() => {
  resetColumnRegistry();
  registerBuiltInColumns();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("the tabs under a form", () => {
  it("draws one per manager, named by its label", () => {
    render(
      <PanelRelations
        relations={RELATIONS}
        fetchPage={vi.fn().mockResolvedValue(page("First"))}
        {...nothing}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Comments",
      "Notes",
    ]);
  });

  it("draws nothing at all where there are no managers", () => {
    const { container } = render(
      <PanelRelations relations={[]} fetchPage={vi.fn()} {...nothing} />,
    );

    expect(container.textContent).toBe("");
  });

  it("fetches the first tab's rows and no others", async () => {
    const fetchPage = vi.fn().mockResolvedValue(page("On the first"));
    render(<PanelRelations relations={RELATIONS} fetchPage={fetchPage} {...nothing} />);

    await waitFor(() => {
      expect(screen.getByText("On the first")).toBeTruthy();
    });
    expect(asked(fetchPage)).toEqual(["comments"]);
  });

  it("fetches a tab's rows when it is opened, and once", async () => {
    const fetchPage = vi
      .fn()
      .mockImplementation((relation: string) => Promise.resolve(page(relation)));
    render(<PanelRelations relations={RELATIONS} fetchPage={fetchPage} {...nothing} />);
    await waitFor(() => {
      expect(screen.getByText("comments")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    await waitFor(() => {
      expect(screen.getByText("notes")).toBeTruthy();
    });

    // Back to the first, which was already loaded: no second request for it.
    fireEvent.click(screen.getByRole("tab", { name: "Comments" }));
    await waitFor(() => {
      expect(screen.getByText("comments")).toBeTruthy();
    });
    expect(asked(fetchPage)).toEqual(["comments", "notes"]);
  });

  it("says so when a tab's rows will not load", async () => {
    render(
      <PanelRelations
        relations={RELATIONS}
        fetchPage={vi.fn().mockRejectedValue(new Error("That did not work."))}
        {...nothing}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("That did not work.");
    });
  });
});

describe("what a tab sends", () => {
  it("names its own relation, not the one that happens to be first", async () => {
    const runAction = vi.fn().mockResolvedValue({ processed: 1, refused: 0 });
    const fetchPage = vi
      .fn()
      .mockImplementation((relation: string) => Promise.resolve(page(relation)));
    render(
      <PanelRelations
        relations={RELATIONS}
        fetchPage={fetchPage}
        runAction={runAction}
        actionForm={vi.fn()}
        actionState={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
    await waitFor(() => {
      expect(screen.getByText("notes")).toBeTruthy();
    });

    fireEvent.click(await screen.findByLabelText("Actions"));
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(runAction).toHaveBeenCalled();
    });
    expect(runAction.mock.calls[0]?.[0]).toBe("notes");
  });
});

describe("a tab nobody is on", () => {
  it("puts none of its controls in the tab order", async () => {
    const fetchPage = vi
      .fn()
      .mockImplementation((relation: string) => Promise.resolve(page(relation)));
    render(<PanelRelations relations={RELATIONS} fetchPage={fetchPage} {...nothing} />);
    await waitFor(() => {
      expect(screen.getByText("comments")).toBeTruthy();
    });

    // One table on the page, not two: the closed tab is not built at all, so
    // its buttons are not reachable by tabbing past the open one.
    expect(screen.getAllByRole("table")).toHaveLength(1);
  });
});
