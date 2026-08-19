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
import {
  registerBuiltInColumns,
  registerBuiltInComponents,
  resetColumnRegistry,
  resetRegistry,
} from "./index.js";
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

const page = (
  actions: RecordsPage["columns"]["actions"],
  bulkActions: RecordsPage["columns"]["bulkActions"] = [],
): RecordsPage => ({
  rows: [{ id: 1, title: "Ada" }],
  total: 1,
  page: 1,
  perPage: 25,
  columns: {
    columns: [{ type: "TextColumn", path: "title", label: "Headline", sortable: true }],
    actions,
    filters: [],
    headerActions: [],
    bulkActions,
  },
  recordKey: "id",
  resourcePath: "/admin/people",
});

const ANSWER: ActionAnswer = { processed: 1, refused: 0 };

beforeEach(() => {
  resetColumnRegistry();
  registerBuiltInColumns();
  // A modal renders fields, not only cells.
  resetRegistry();
  registerBuiltInComponents();
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
      expect(runAction).toHaveBeenCalledWith(
        "ArchiveAction",
        [1],
        undefined,
        expect.any(String),
      );
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
      expect(runAction).toHaveBeenCalledWith(
        "archive-hard",
        [1],
        undefined,
        expect.any(String),
      );
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
      expect(runAction).toHaveBeenCalledWith(
        "DeleteAction",
        [1],
        undefined,
        expect.any(String),
      );
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
  it("says so on the row button too, not only in the bulk bar", () => {
    // The ref already stops a second request. What is missing is telling the
    // reader why nothing happened when they pressed again.
    const runAction = vi.fn().mockImplementation(() => new Promise(() => undefined));
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(screen.getByRole("button", { name: "Archive" })).toHaveProperty(
      "disabled",
      true,
    );
  });

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
    const link = {
      type: "EditAction",
      name: "EditAction",
      trigger: "link",
      page: "edit",
    } as const;
    render(<PanelList initial={page([ARCHIVE, link])} title="People" />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Edit" })).toBeTruthy();
  });
});

describe("ticking rows", () => {
  const many = (): RecordsPage => ({
    ...page([], [ARCHIVE]),
    rows: [
      { id: 1, title: "Ada" },
      { id: 2, title: "Grace" },
      { id: 3, title: "Alan" },
    ],
    total: 3,
  });

  it("offers no checkbox at all when nothing could be done with a selection", () => {
    render(<PanelList initial={page([ARCHIVE])} title="People" runAction={vi.fn()} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("offers none either when no host would carry the action out", () => {
    render(<PanelList initial={page([], [ARCHIVE])} title="People" />);

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("says nothing until something is ticked", () => {
    render(<PanelList initial={many()} title="People" runAction={vi.fn()} />);

    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("counts what is ticked, and offers the action over it", () => {
    render(<PanelList initial={many()} title="People" runAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 2" }));
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 3" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("sends every ticked key, not just the last one", async () => {
    const runAction = vi.fn().mockResolvedValue({ processed: 2, refused: 0 });
    render(<PanelList initial={many()} title="People" runAction={runAction} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(runAction).toHaveBeenCalledWith(
        "ArchiveAction",
        [1, 3],
        undefined,
        expect.any(String),
      );
    });
  });

  it("ticks every row on the page at once, and unticks them again", () => {
    render(<PanelList initial={many()} title="People" runAction={vi.fn()} />);
    const all = screen.getByRole("checkbox", { name: "Select every row on this page" });

    fireEvent.click(all);
    expect(screen.getByText("3 selected")).toBeTruthy();

    fireEvent.click(all);
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("says all rows are ticked only when they are", () => {
    render(<PanelList initial={many()} title="People" runAction={vi.fn()} />);
    const all = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Select every row on this page",
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));

    // Some but not all: the platform's third state, rather than a tick that
    // would claim the other two rows were chosen.
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(true);
  });

  it("forgets the selection once the page it described is gone", async () => {
    const runAction = vi.fn().mockResolvedValue({ processed: 1, refused: 0 });
    const fetchPage = vi.fn().mockResolvedValue(many());
    render(
      <PanelList
        initial={many()}
        title="People"
        runAction={runAction}
        fetchPage={fetchPage}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    // The rows it named have just been acted on; keeping the ticks would offer
    // to do it again to rows that may no longer be there.
    await waitFor(() => {
      expect(screen.queryByText(/selected/)).toBeNull();
    });
  });

  it("does not leave the reader on a page the rows have left", async () => {
    // Delete everything on page 3 of 3 and page 3 stops existing. Asking for it
    // again answers with nothing, and the reader is looking at an empty table
    // that says there are records.
    const emptied: RecordsPage = { ...many(), rows: [], total: 6, page: 3, perPage: 3 };
    const first: RecordsPage = { ...many(), total: 6, page: 2, perPage: 3 };
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(emptied)
      .mockResolvedValueOnce(first);
    const runAction = vi.fn().mockResolvedValue({ processed: 3, refused: 0 });
    render(
      <PanelList
        initial={{ ...many(), total: 9, page: 3, perPage: 3 }}
        title="People"
        runAction={runAction}
        fetchPage={fetchPage}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select every row on this page" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });
    expect(fetchPage.mock.calls[1]?.[0]).toMatchObject({ page: 2 });
  });

  it("takes an empty page at its word when it is the last one there is", async () => {
    // A server saying "six records" and handing back nothing for the last page
    // is contradicting itself. Asking again would not fix it and would spend a
    // round trip finding that out.
    const emptied: RecordsPage = { ...many(), rows: [], total: 6, page: 2, perPage: 3 };
    const fetchPage = vi.fn().mockResolvedValue(emptied);
    const runAction = vi.fn().mockResolvedValue({ processed: 3, refused: 0 });
    render(
      <PanelList
        initial={{ ...many(), total: 6, page: 2, perPage: 3 }}
        title="People"
        runAction={runAction}
        fetchPage={fetchPage}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select every row on this page" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(fetchPage).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Nothing to show.")).toBeTruthy();
  });

  it("asks before a bulk action that declared a confirmation", async () => {
    const runAction = vi.fn().mockResolvedValue({ processed: 2, refused: 0 });
    render(
      <PanelList
        initial={{ ...many(), columns: { ...many().columns, bulkActions: [REMOVE] } }}
        title="People"
        runAction={runAction}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select every row on this page" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Delete this person?")).toBeTruthy();
    expect(runAction).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete" })[1] as HTMLElement,
    );
    await waitFor(() => {
      expect(runAction).toHaveBeenCalledWith(
        "DeleteAction",
        [1, 2, 3],
        undefined,
        expect.any(String),
      );
    });
  });
});

describe("an action that collects something first", () => {
  const WITH_FORM = {
    type: "ArchiveAction",
    name: "ArchiveAction",
    trigger: "run",
    label: "Archive",
    hasForm: true,
    confirmation: { heading: "Why?", confirmLabel: "Archive it" },
  } as const;

  const SCHEMA = {
    schema: {
      id: "0",
      type: "Schema",
      children: [{ id: "reason", type: "TextInput", path: "reason", label: "Reason" }],
    },
    // A resolved tree carries an entry per field. Left empty, nothing is ever
    // marked as seen and no error the server sends can be shown.
    state: { reason: "" },
    errors: {},
  };

  const draw = (over: Partial<Record<string, unknown>> = {}) => {
    const runAction = vi.fn().mockResolvedValue({ processed: 1, refused: 0 });
    const actionForm = vi.fn().mockResolvedValue(SCHEMA);
    render(
      <PanelList
        initial={page([WITH_FORM])}
        title="People"
        runAction={runAction}
        actionForm={actionForm}
        actionState={() => () => Promise.resolve({ payload: SCHEMA })}
        {...over}
      />,
    );
    return { runAction, actionForm };
  };

  it("asks the server what to show, rather than showing what the table said", () => {
    const { actionForm } = draw();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(actionForm).toHaveBeenCalledWith("ArchiveAction", [1]);
  });

  it("runs nothing until the form is submitted", () => {
    const { runAction } = draw();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(runAction).not.toHaveBeenCalled();
  });

  it("shows the fields the server resolved", async () => {
    draw();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByLabelText("Reason")).toBeTruthy();
  });

  it("sends what was typed, with the selection it was opened for", async () => {
    const { runAction } = draw();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.change(await screen.findByLabelText("Reason"), {
      target: { value: "stale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive it" }));

    await waitFor(() => {
      expect(runAction).toHaveBeenCalledWith(
        "ArchiveAction",
        [1],
        { reason: "stale" },
        expect.any(String),
      );
    });
  });

  it("keeps the dialog open when the server would not accept the form", async () => {
    const runAction = vi.fn().mockResolvedValue({
      processed: 0,
      refused: 0,
      errors: { reason: "This field is required." },
      payload: { ...SCHEMA, errors: { reason: "This field is required." } },
    });
    draw({ runAction });

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(await screen.findByRole("button", { name: "Archive it" }));

    expect(await screen.findByText("This field is required.")).toBeTruthy();
    expect(screen.getByLabelText("Reason")).toBeTruthy();
  });

  it("still closes a plain confirmation on a click outside it", () => {
    // The other half of the rule: nothing is lost by dismissing a question, so
    // dismissing it stays as easy as it was.
    render(<PanelList initial={page([REMOVE])} title="People" runAction={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(document.querySelector("dialog") as HTMLElement);

    expect(screen.queryByText("Delete this person?")).toBeNull();
  });

  it("does not throw away what was typed on a click outside it", async () => {
    // A question can be dismissed by clicking away from it. A form somebody has
    // filled in cannot: the click is as likely to be a miss as a decision.
    draw();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.change(await screen.findByLabelText("Reason"), {
      target: { value: "stale" },
    });
    fireEvent.click(document.querySelector("dialog") as HTMLElement);

    expect(screen.getByLabelText("Reason")).toBeTruthy();
  });

  it("is not opened when the host cannot carry its round trips either", async () => {
    // Half a host is worse than none: the fields render and every keystroke
    // fails, which reads as the panel being broken rather than unavailable.
    const runAction = vi.fn();
    const actionForm = vi.fn().mockResolvedValue(SCHEMA);
    render(
      <PanelList
        initial={page([WITH_FORM])}
        title="People"
        runAction={runAction}
        actionForm={actionForm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(actionForm).not.toHaveBeenCalled();
    });
    expect(screen.queryByText("Archive them")).toBeNull();
  });

  it("is not opened at all when the host cannot ask for the schema", () => {
    const runAction = vi.fn();
    render(
      <PanelList initial={page([WITH_FORM])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    expect(runAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Why?")).toBeNull();
  });
});

describe("what the page that sent the reader here said", () => {
  it("is shown on arrival", () => {
    render(
      <PanelList
        initial={page([])}
        title="People"
        flash={{ title: "Person created", tone: "success" }}
      />,
    );

    expect(screen.getByText("Person created")).toBeTruthy();
  });

  it("goes as soon as the reader asks for different rows", async () => {
    // It was about the page that was there when it was written.
    const fetchPage = vi.fn().mockResolvedValue(page([]));
    render(
      <PanelList
        initial={{
          ...page([]),
          columns: {
            ...page([]).columns,
            columns: [
              { type: "TextColumn", path: "title", label: "Headline", sortable: true },
            ],
          },
        }}
        title="People"
        fetchPage={fetchPage}
        flash={{ title: "Person created", tone: "success" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Headline/ }));

    await waitFor(() => {
      expect(screen.queryByText("Person created")).toBeNull();
    });
  });
});

describe("naming what the reader asked for", () => {
  it("sends a key, so a replayed request is recognised", async () => {
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(runAction).toHaveBeenCalled();
    });
    expect(runAction.mock.calls[0]?.[3]).toEqual(expect.any(String));
  });

  it("names each press separately, because each is its own intent", async () => {
    const runAction = vi.fn().mockResolvedValue(ANSWER);
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(2);
    });

    expect(runAction.mock.calls[0]?.[3]).not.toBe(runAction.mock.calls[1]?.[3]);
  });

  it("keeps the name when the request itself failed", async () => {
    // The one case the whole mechanism is for: the request may have reached
    // the server and been carried out, with only the answer lost. Retrying
    // under the same name is what lets the server recognise it.
    const runAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(ANSWER);
    render(
      <PanelList initial={page([ARCHIVE])} title="People" runAction={runAction} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(2);
    });

    expect(runAction.mock.calls[0]?.[3]).toBe(runAction.mock.calls[1]?.[3]);
  });

  it("keeps the name across a form the server sent back", async () => {
    // The same intent, corrected. The server remembers nothing about a refused
    // form, so reusing the name costs nothing and a network retry in between
    // is still recognised.
    const runAction = vi
      .fn()
      .mockResolvedValueOnce({
        processed: 0,
        refused: 0,
        errors: { reason: "This field is required." },
        payload: { ...SCHEMA_FOR_KEY, errors: { reason: "This field is required." } },
      })
      .mockResolvedValue(ANSWER);
    render(
      <PanelList
        initial={page([WITH_FORM_FOR_KEY])}
        title="People"
        runAction={runAction}
        actionForm={vi.fn().mockResolvedValue(SCHEMA_FOR_KEY)}
        actionState={() => () => Promise.resolve({ payload: SCHEMA_FOR_KEY })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(await screen.findByRole("button", { name: "Archive it" }));
    await waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "stale" } });
    fireEvent.click(screen.getByRole("button", { name: "Archive it" }));
    await waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(2);
    });

    // A refusal changed nothing, so the second attempt is its own intent.
    expect(runAction.mock.calls[0]?.[3]).not.toBe(runAction.mock.calls[1]?.[3]);
  });
});

const WITH_FORM_FOR_KEY = {
  type: "ArchiveAction",
  name: "ArchiveAction",
  trigger: "run",
  label: "Archive",
  hasForm: true,
  confirmation: { heading: "Why?", confirmLabel: "Archive it" },
} as const;

const SCHEMA_FOR_KEY = {
  schema: {
    id: "0",
    type: "Schema",
    children: [{ id: "reason", type: "TextInput", path: "reason", label: "Reason" }],
  },
  state: { reason: "" },
  errors: {},
};
