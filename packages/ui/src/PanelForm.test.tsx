/**
 * @vitest-environment jsdom
 *
 * A1 assembled on the client: a keystroke, the debounce the field declared, one
 * request, reconciliation, a re-render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { PanelForm } from "./PanelForm.js";
import { registerBuiltInComponents } from "./renderers.js";
import { resetRegistry } from "./registry.js";
import type { StateResponse } from "./transport.js";

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
        {
          id: "title",
          type: "TextInput",
          path: "title",
          label: "Title",
          live: { debounce: 400, onBlur: false },
        },
        { id: "notes", type: "TextInput", path: "notes", label: "Notes" },
      ],
    },
    state: { title: "", notes: "" },
    errors: {},
    ...overrides,
  };
}

const field = (label: string): HTMLInputElement =>
  screen.getByLabelText<HTMLInputElement>(label);

describe("typing is optimistic on the draft zone — ARCH 13 §5", () => {
  it("shows the keystroke immediately, before any request", () => {
    const send = vi.fn(() => new Promise<StateResponse>(() => undefined));
    render(<PanelForm initial={payload()} send={send} />);

    fireEvent.change(field("Title"), { target: { value: "Hello" } });

    expect(field("Title").value).toBe("Hello");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the debounce comes from the field, not from the form", () => {
  it("sends nothing for a field the server did not mark live", () => {
    const send = vi.fn(() => new Promise<StateResponse>(() => undefined));
    render(<PanelForm initial={payload()} send={send} />);

    fireEvent.change(field("Notes"), { target: { value: "no round trip" } });

    // A debounce of 0 would have meant "send now", which is the opposite of
    // what a field without `live` asks for.
    expect(send).not.toHaveBeenCalled();
    expect(field("Notes").value).toBe("no round trip");
  });

  it("waits the declared debounce before sending a live field", () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => new Promise<StateResponse>(() => undefined));
      render(<PanelForm initial={payload()} send={send} />);

      fireEvent.change(field("Title"), { target: { value: "Hello" } });
      expect(send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ dirtyPath: "title", sequence: 1 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the server's answer reaches the screen", () => {
  it("renders a field the response added", async () => {
    const withExtra = payload({
      schema: {
        ...payload().schema,
        children: [
          ...payload().schema.children!,
          { id: "city", type: "TextInput", path: "city", label: "City" },
        ],
      },
    });
    vi.useFakeTimers();
    try {
      render(
        <PanelForm
          initial={payload()}
          send={() => Promise.resolve({ payload: withExtra })}
        />,
      );
      expect(screen.queryByLabelText("City")).toBeNull();

      fireEvent.change(field("Title"), { target: { value: "Hello" } });
      await vi.advanceTimersByTimeAsync(400);

      expect(screen.getByLabelText("City")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("puts a server error on the field's reserved line", async () => {
    vi.useFakeTimers();
    try {
      render(
        <PanelForm
          initial={payload()}
          send={() =>
            Promise.resolve({
              payload: payload({ errors: { title: "Too short." } }),
            })
          }
        />,
      );
      fireEvent.change(field("Title"), { target: { value: "H" } });
      await vi.advanceTimersByTimeAsync(400);

      expect(screen.getByText("Too short.")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a failure is shown, never swallowed — ARCH 13 §5", () => {
  it("renders whatever the caller supplies, with a retry that works", async () => {
    vi.useFakeTimers();
    try {
      let attempt = 0;
      const send = vi.fn(() => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ payload: payload({ state: { title: "H", notes: "" } }) });
      });

      render(
        <PanelForm
          initial={payload()}
          send={send}
          renderFailure={(_, retry) => (
            <button type="button" onClick={retry}>
              Retry
            </button>
          )}
        />,
      );

      fireEvent.change(field("Title"), { target: { value: "H" } });
      await vi.advanceTimersByTimeAsync(400);

      const button = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(button);
      await vi.advanceTimersByTimeAsync(0);

      expect(attempt).toBe(2);
      expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the typed value while the failure is on screen", async () => {
    vi.useFakeTimers();
    try {
      render(
        <PanelForm
          initial={payload()}
          send={() => Promise.reject(new Error("offline"))}
          renderFailure={() => <div>Network error</div>}
        />,
      );
      fireEvent.change(field("Title"), { target: { value: "kept" } });
      await vi.advanceTimersByTimeAsync(400);

      expect(screen.getByText("Network error")).toBeDefined();
      expect(field("Title").value).toBe("kept");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("lifetime", () => {
  it("sends nothing after the form is unmounted", () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn(() => new Promise<StateResponse>(() => undefined));
      const { unmount } = render(<PanelForm initial={payload()} send={send} />);

      fireEvent.change(field("Title"), { target: { value: "abandoned" } });
      unmount();
      vi.advanceTimersByTime(400);

      // A debounce that outlives its form fires a request nobody is waiting for.
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads `initial` once, so another record needs another key", () => {
    // Re-creating the client on a prop change would drop the draft zone, which
    // is the one thing the server cannot restore. Asserted so it is a decision
    // rather than a surprise.
    const send = (): Promise<StateResponse> => new Promise(() => undefined);
    const { rerender } = render(<PanelForm initial={payload()} send={send} />);
    rerender(
      <PanelForm
        initial={payload({ state: { title: "from parent", notes: "" } })}
        send={send}
      />,
    );
    expect(field("Title").value).toBe("");

    cleanup();
    render(
      <PanelForm
        key="second-record"
        initial={payload({ state: { title: "from parent", notes: "" } })}
        send={send}
      />,
    );
    expect(field("Title").value).toBe("from parent");
  });
});
