/**
 * @vitest-environment jsdom
 *
 * What an action answered, said in a toast.
 *
 * Driven through the list, with the message a page arrives holding: the same
 * one a create carries across its redirect, and the one path that needs no
 * action to be run first.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RecordsPage } from "./PanelList.js";
import { PanelList } from "./PanelList.js";

const page: RecordsPage = {
  rows: [{ id: 1, title: "First" }],
  total: 1,
  page: 1,
  perPage: 25,
  columns: {
    columns: [{ type: "TextColumn", path: "title", label: "Title" }],
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
  },
  recordKey: "id",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const toast = (): HTMLElement | null => document.querySelector(".perch-toast");

describe("a message an action answered with", () => {
  it("is drawn in the corner over the page, not in the flow above the table", () => {
    render(
      <PanelList
        initial={page}
        title="Things"
        flash={{ title: "Saved", tone: "success" }}
      />,
    );

    const shown = toast();
    expect(shown?.textContent).toContain("Saved");
    expect(shown?.closest(".perch-toasts")).not.toBeNull();
    // Nothing between the header and the table moves the rows down any more.
    expect(document.querySelector(".perch-list .perch-notice")).toBeNull();
  });

  it("goes by itself when it is good news", () => {
    vi.useFakeTimers();
    render(
      <PanelList
        initial={page}
        title="Things"
        flash={{ title: "Saved", tone: "success" }}
      />,
    );
    expect(toast()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(toast()).toBeNull();
  });

  it("stays until it is closed when something went wrong", () => {
    // A failure that leaves on its own is one a reader who looked away never
    // learns about.
    vi.useFakeTimers();
    render(
      <PanelList
        initial={page}
        title="Things"
        flash={{ title: "That did not work.", tone: "danger" }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(toast()?.textContent).toContain("That did not work.");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(toast()).toBeNull();
  });

  it("says the body under the title, in the server's words", () => {
    render(
      <PanelList
        initial={page}
        title="Things"
        flash={{ title: "Archived", body: "Three posts were moved.", tone: "info" }}
      />,
    );

    expect(document.querySelector(".perch-toast__title")?.textContent).toBe("Archived");
    expect(document.querySelector(".perch-toast__body")?.textContent).toBe(
      "Three posts were moved.",
    );
  });
});
