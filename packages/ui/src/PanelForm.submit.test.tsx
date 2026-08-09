/**
 * @vitest-environment jsdom
 *
 * Submitting closes the loop: fill the form, save it, see what the server made
 * of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { PanelForm } from "./PanelForm.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";
import type { SaveRequest, SaveResponse, StateResponse } from "./transport.js";

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
});
afterEach(cleanup);

function payload(overrides: Partial<SchemaPayload> = {}): SchemaPayload {
  return {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        { id: "title", type: "TextInput", path: "title", label: "Title" },
        { id: "notes", type: "TextInput", path: "notes", label: "Notes" },
      ],
    },
    state: { title: "", notes: "" },
    errors: {},
    ...overrides,
  };
}

const never = (): Promise<StateResponse> => new Promise(() => undefined);
const field = (label: string): HTMLInputElement =>
  screen.getByLabelText<HTMLInputElement>(label);
const saveButton = (): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>("button", { name: /save/i });

describe("there is a button only when there is somewhere to write", () => {
  it("renders none without a save handler", () => {
    render(<PanelForm initial={payload()} send={never} />);

    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("renders one with it", () => {
    render(
      <PanelForm initial={payload()} send={never} save={() => Promise.resolve({})} />,
    );

    expect(saveButton()).toBeDefined();
  });
});

describe("what it sends", () => {
  it("sends the whole state, not only what changed", async () => {
    // The server decides what may be written; a client sending only its own
    // idea of the diff would be deciding for it.
    const save = vi.fn<(request: SaveRequest) => Promise<SaveResponse>>(() =>
      Promise.resolve({ record: { id: 1 } }),
    );
    render(<PanelForm initial={payload()} send={never} save={save} />);

    fireEvent.change(field("Title"), { target: { value: "Hello" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({ state: { title: "Hello", notes: "" } });
    });
  });

  it("submits on Enter, because it is a form", async () => {
    const save = vi.fn(() => Promise.resolve({ record: {} }));
    render(<PanelForm initial={payload()} send={never} save={save} />);

    fireEvent.submit(field("Title").closest("form")!);

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  it("refuses a second submission while the first is in flight", async () => {
    // Two writes, and the second is the one that lands. Submitting again is
    // what has to be refused, not merely made hard to click: Enter still
    // submits a form whose button is disabled.
    const save = vi.fn(() => new Promise<SaveResponse>(() => undefined));
    render(<PanelForm initial={payload()} send={never} save={save} />);
    const form = field("Title").closest("form")!;

    fireEvent.submit(form);
    await waitFor(() => {
      expect(saveButton().disabled).toBe(true);
    });
    fireEvent.submit(form);
    fireEvent.click(saveButton());

    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("when the server writes it", () => {
  it("says so, out loud", async () => {
    render(
      <PanelForm
        initial={payload()}
        send={never}
        save={() => Promise.resolve({ record: { id: 1 } })}
      />,
    );

    fireEvent.change(field("Title"), { target: { value: "Hello" } });
    fireEvent.click(saveButton());

    // In a live region, so it reaches somebody who cannot see it appear.
    await waitFor(() => {
      expect(screen.getByText("Saved").getAttribute("role")).toBe("status");
    });
  });

  it("does not write the same thing twice", async () => {
    // On a create that second write is a second row. Nothing redirects after a
    // create yet, so the page is still sitting there offering to do it again.
    const save = vi.fn(() => Promise.resolve({ record: { id: 1 } }));
    render(<PanelForm initial={payload()} send={never} save={save} />);

    fireEvent.change(field("Title"), { target: { value: "Hello" } });
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeDefined();
    });

    fireEvent.click(saveButton());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("writes again once something else is typed", async () => {
    const save = vi.fn(() => Promise.resolve({ record: { id: 1 } }));
    render(<PanelForm initial={payload()} send={never} save={save} />);

    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeDefined();
    });

    fireEvent.change(field("Title"), { target: { value: "Changed" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(2);
    });
  });

  it("hands the record back to the caller", async () => {
    const onSaved = vi.fn();
    render(
      <PanelForm
        initial={payload()}
        send={never}
        save={() => Promise.resolve({ record: { id: 7 } })}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith({ id: 7 });
    });
  });

  it("stops marking the field as unconfirmed", async () => {
    // Otherwise every field it wrote stays flagged as pending for good.
    render(
      <PanelForm
        initial={payload()}
        send={never}
        save={() => Promise.resolve({ record: {} })}
      />,
    );

    const control = (): Element | null => field("Title").closest(".perch-control");

    fireEvent.change(field("Title"), { target: { value: "Hello" } });
    expect(control()?.getAttribute("data-state")).not.toBe("rest");

    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(control()?.getAttribute("data-state")).toBe("rest");
    });
  });

  it("keeps what was typed on screen", async () => {
    render(
      <PanelForm
        initial={payload()}
        send={never}
        save={() => Promise.resolve({ record: {} })}
      />,
    );

    fireEvent.change(field("Title"), { target: { value: "Hello" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeDefined();
    });
    expect(field("Title").value).toBe("Hello");
  });
});

describe("when the server refuses it", () => {
  const refused = (): Promise<SaveResponse> =>
    Promise.resolve({
      errors: { title: "Too short." },
      payload: payload({ errors: { title: "Too short." } }),
    });

  it("shows the error where the field is", async () => {
    render(<PanelForm initial={payload()} send={never} save={refused} />);

    fireEvent.change(field("Title"), { target: { value: "H" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText("Too short.")).toBeDefined();
    });
  });

  it("keeps what was typed, since nothing was written", async () => {
    render(<PanelForm initial={payload()} send={never} save={refused} />);

    fireEvent.change(field("Title"), { target: { value: "H" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText("Too short.")).toBeDefined();
    });
    expect(field("Title").value).toBe("H");
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("lets it be submitted again", async () => {
    const save = vi.fn(refused);
    render(<PanelForm initial={payload()} send={never} save={save} />);

    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(saveButton().disabled).toBe(false);
    });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(2);
    });
  });
});

describe("when the request fails", () => {
  it("is shown rather than swallowed", async () => {
    render(
      <PanelForm
        initial={payload()}
        send={never}
        save={() => Promise.reject(new Error("offline"))}
        renderFailure={() => <div>Network error</div>}
      />,
    );

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
    expect(saveButton().disabled).toBe(false);
  });
});
