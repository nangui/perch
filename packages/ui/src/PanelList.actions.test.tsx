/**
 * @vitest-environment jsdom
 *
 * Pressing an action from the table.
 *
 * jsdom does not implement `<dialog>`'s `showModal`, so it is stood in for
 * here. Everything else — which button is drawn, what is sent, what is shown
 * afterwards — is the real component.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInColumns, resetColumnRegistry } from "./index.js";
import type { ActionAnswer, RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";

const ARCHIVE = {
  type: "ArchiveAction",
  name: "ArchiveAction",
  trigger: "run",
  label: "Archive",
} as const;

const REMOVE = {
  type: "DeleteAction",
  name: "DeleteAction",
  trigger: "run",
  danger: true,
  confirmation: { heading: "Delete this person?", confirmLabel: "Delete" },
} as const;

const page = (actions: RecordsPage["columns"]["actions"]): RecordsPage => ({
  rows: [{ id: 1, title: "Ada" }],
  total: 1,
  page: 1,
  perPage: 25,
  columns: {
    columns: [{ type: "TextColumn", path: "title", label: "Headline", sortable: true }],
    actions,
    filters: [],
    headerActions: [],
  },
  recordKey: "id",
  resourcePath: "/admin/people",
});

const ANSWER: ActionAnswer = { processed: 1, refused: 0 };

beforeEach(() => {
  resetColumnRegistry();
  registerBuiltInColumns();
  // jsdom has the element but not its modal behaviour.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(cleanup);

describe("an action that needs no confirmation", () => {
  it("runs on the press, naming itself and the row", async () => {
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(runAction).toHaveBeenCalledWith("ArchiveAction", [1]);
    });
  });

  it("sends the name, never the type: two of a kind differ by name alone", async () => {
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    const renamed = { ...ARCHIVE, name: "archive-hard" };
    render(
      <PanelList initial={page([renamed])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(runAction).toHaveBeenCalledWith("archive-hard", [1]);
    });
  });

  it("says what came back, when the action said nothing itself", async () => {
    const runAction = vi.fn().mockResolvedValue({ processed: 1, refused: 0 });
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Done: 1 record.")).toBeTruthy();
  });

  it("says both counts, so neither half is hidden by the other", async () => {
    const runAction = vi.fn().mockResolvedValue({ processed: 3, refused: 2 });
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Done: 3 records. 2 could not be.")).toBeTruthy();
  });

  it("prefers what the action said over anything it would have said itself", async () => {
    const runAction = vi.fn().mockResolvedValue({
      processed: 1,
      refused: 0,
      notification: {
        title: "Archived",
        body: "It is out of the list.",
        tone: "success",
      },
    });
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Archived")).toBeTruthy();
    expect(screen.queryByText("Done: 1 record.")).toBeNull();
  });

  it("shows a failure as the failure it was, not as a success", async () => {
    const runAction = vi
      .fn()
      .mockRejectedValue(new Error("That selection is too large."));
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("That selection is too large.")).toBeTruthy();
  });

  it("asks the server again afterwards, because the rows have changed", async () => {
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    const fetchPage = vi.fn().mockResolvedValue(page([ARCHIVE]));
    render(
      <PanelList
        initial={page([ARCHIVE])}
        title="People"
        runAction={runAction}
        fetchPage={fetchPage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalled();
    });
  });
});

describe("what an earlier action said", () => {
  it("does not outlive the page it was said about", async () => {
    // The reader archives a row, then turns a page or searches. A notice still
    // reading "Done" describes something that is no longer on screen.
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    const fetchPage = vi.fn().mockResolvedValue(page([ARCHIVE]));
    render(
      <PanelList
        initial={page([ARCHIVE])}
        title="People"
        runAction={runAction}
        fetchPage={fetchPage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Done: 1 record.")).toBeTruthy();

    // The sort trigger is a button inside the header. Clicking the header
    // itself lands on nothing, which is how this test first passed for the
    // wrong reason.
    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(screen.queryByText("Done: 1 record.")).toBeNull();
    });
  });
});

describe("an action that declared a confirmation", () => {
  it("asks before it does anything at all", () => {
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    render(<PanelList initial={page([REMOVE])} title="People" runAction={runAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Delete this person?")).toBeTruthy();
    expect(runAction).not.toHaveBeenCalled();
  });

  it("uses the wording the server sent, not a default", () => {
    render(<PanelList initial={page([REMOVE])} title="People" runAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("heading", { name: "Delete this person?" })).toBeTruthy();
  });

  it("does it once the reader agrees", async () => {
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    render(<PanelList initial={page([REMOVE])} title="People" runAction={runAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    // The dialog's own confirm button, which carries the declared label.
    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete" })[1] as HTMLElement,
    );

    await waitFor(() => {
      expect(runAction).toHaveBeenCalledWith("DeleteAction", [1]);
    });
  });

  it("does nothing at all when the reader backs out", () => {
    const runAction = vi.fn();
    render(<PanelList initial={page([REMOVE])} title="People" runAction={runAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(runAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete this person?")).toBeNull();
  });

  it("is not in the page at all until something is pending", () => {
    render(<PanelList initial={page([REMOVE])} title="People" runAction={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

describe("a second press while the first is in flight", () => {
  it("starts nothing for an action that asks nothing first either", () => {
    // Criterion 7: an action triggered twice by a double click performs the
    // mutation once. The dialog holds itself, but a press with no dialog has
    // nothing holding it.
    const runAction = vi.fn().mockImplementation(() => new Promise(() => undefined));
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    const button = screen.getByRole("button", { name: "Archive" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("starts nothing, so a double click acts once", async () => {
    let settle: ((answer: ActionAnswer) => void) | undefined;
    const runAction = vi
      .fn()
      .mockImplementation(() => new Promise<ActionAnswer>((r) => (settle = r)));
    render(<PanelList initial={page([REMOVE])} title="People" runAction={runAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = screen.getAllByRole("button", { name: "Delete" })[1] as HTMLElement;
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Working…" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Working…" }));

    expect(runAction).toHaveBeenCalledTimes(1);
    settle?.(ANSWER);
  });
});

describe("an action the host cannot carry out", () => {
  it("is not drawn, rather than drawn and dead", () => {
    render(<PanelList initial={page([ARCHIVE])} title="People" />);

    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });

  it("leaves no column behind either", () => {
    // The button being absent is not enough: the column it would have sat in
    // is drawn from the same list, and an empty one reads as a rendering fault.
    render(<PanelList initial={page([ARCHIVE])} title="People" />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(1);
    expect(screen.getAllByRole("cell")).toHaveLength(1);
  });

  it("keeps the column when something in it can still be drawn", () => {
    const link = { type: "EditAction", name: "EditAction", trigger: "link" } as const;
    render(<PanelList initial={page([ARCHIVE, link])} title="People" />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Edit" })).toBeTruthy();
  });
});
