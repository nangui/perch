/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FieldStatus } from "../field-state.js";
import type { ControlBinding } from "../FieldShell.js";
import type { SearchableOption } from "./SearchableSelect.js";
import { SearchableSelect } from "./SearchableSelect.js";

afterEach(() => {
  cleanup();
  // Restored here rather than at the end of the one test that fakes them: a
  // test that fails before its own cleanup would otherwise leave every test
  // after it waiting on a clock that never moves.
  vi.useRealTimers();
});

const STATUS: FieldStatus = { lifecycle: "rest", disabled: false, readOnly: false };
const BINDING: ControlBinding = {
  id: "authorId",
  "aria-describedby": "authorId-help",
  "aria-invalid": false,
  "aria-required": false,
  disabled: false,
  readOnly: false,
};

const WINDOW: readonly SearchableOption[] = [
  { value: "2", label: "Ada" },
  { value: "7", label: "Grace" },
];

function draw(overrides: Partial<React.ComponentProps<typeof SearchableSelect>> = {}): {
  search: ReturnType<typeof vi.fn>;
  onValueChange: ReturnType<typeof vi.fn>;
} {
  const search = vi.fn(() => Promise.resolve(WINDOW));
  const onValueChange = vi.fn();
  render(
    <SearchableSelect
      value={null}
      onValueChange={onValueChange}
      options={WINDOW}
      status={STATUS}
      binding={BINDING}
      label="Author"
      search={search}
      debounce={0}
      {...overrides}
    />,
  );
  return { search, onValueChange };
}

// Radix reaches for a pointer environment jsdom does not have. These four are
// the whole of what it needs; without them the popover never opens and every
// assertion below would be about a component that never rendered.
beforeAll(() => {
  const element = Element.prototype as unknown as Record<string, unknown>;
  element["hasPointerCapture"] = () => false;
  element["setPointerCapture"] = () => undefined;
  element["releasePointerCapture"] = () => undefined;
  element["scrollIntoView"] = () => undefined;
});

function drawFor(overrides: Partial<React.ComponentProps<typeof SearchableSelect>>) {
  return render(
    <SearchableSelect
      value={null}
      onValueChange={vi.fn()}
      options={WINDOW}
      status={STATUS}
      binding={BINDING}
      label="Author"
      search={() => Promise.resolve(WINDOW)}
      debounce={0}
      {...overrides}
    />,
  );
}

async function open(): Promise<void> {
  fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("combobox");
}

const box = (): HTMLElement => screen.getByRole("combobox");

async function type(text: string): Promise<void> {
  // Awaited: the change queues an effect, and the assertions that follow are
  // about what that effect did.
  await act(() => {
    fireEvent.change(box(), { target: { value: text } });
    return Promise.resolve();
  });
}

const press = (key: string): void => {
  fireEvent.keyDown(box(), { key });
};

describe("the box", () => {
  it("is a combobox, named by the field rather than by its id", async () => {
    draw();

    await open();

    expect(screen.getByRole("combobox", { name: "Search Author" })).toBeTruthy();
  });

  it("takes the focus when the list opens", async () => {
    draw();

    await open();

    expect(document.activeElement).toBe(box());
  });

  it("shows the window the form arrived with, before anything is typed", async () => {
    const { search } = draw();

    await open();

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Ada",
      "Grace",
    ]);
    expect(search).not.toHaveBeenCalled();
  });

  it("tells the reader a list is coming, not a dialog", () => {
    draw();

    // Radix's own answer is `dialog`, which describes its popover rather than
    // what this one holds.
    expect(screen.getByRole("button").getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("shows the newest window, not the one it opened with", async () => {
    // A dependent select whose parent changed while this was open: the server
    // sends another list, and the reader must not be choosing from the old one.
    const { rerender } = drawFor({});
    await open();

    rerender(
      <SearchableSelect
        value={null}
        onValueChange={vi.fn()}
        options={[{ value: "9", label: "Alan" }]}
        status={STATUS}
        binding={BINDING}
        label="Author"
        search={() => Promise.resolve([])}
        debounce={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Alan"]);
    });
  });
});

describe("typing", () => {
  it("asks the server rather than filtering what it already has", async () => {
    const search = vi.fn(() => Promise.resolve([{ value: "9", label: "Alan" }]));
    draw({ search });

    await open();
    await type("al");

    await waitFor(() => {
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Alan"]);
    });
    expect(search).toHaveBeenLastCalledWith("al");
  });

  it("waits for the typing to stop before asking", async () => {
    const search = vi.fn(() => Promise.resolve(WINDOW));
    draw({ search, debounce: 200 });
    await open();

    // Faked only now: opening goes through Radix and `findBy`, both of which
    // want a clock that runs on its own.
    vi.useFakeTimers();
    await type("ada");
    expect(search).not.toHaveBeenCalled();

    // Stopped one millisecond short first: under fake timers a delay of zero
    // waits exactly as long as a delay of two hundred, so only crossing the
    // boundary shows that the number is honoured rather than merely present.
    await vi.advanceTimersByTimeAsync(199);
    expect(search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("goes back to the window when the box is cleared", async () => {
    const search = vi.fn(() => Promise.resolve([{ value: "9", label: "Alan" }]));
    draw({ search });

    await open();
    await type("al");
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1);
    });
    await type("");

    await waitFor(() => {
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Ada",
        "Grace",
      ]);
    });
  });

  it("ignores an answer a newer one has already overtaken", async () => {
    // The slow request is the earlier one. Landing last, it would replace the
    // narrower list with the wider one and undo the reader's own typing.
    let settleSlow: ((options: readonly SearchableOption[]) => void) | undefined;
    const search = vi.fn(async (term: string) => {
      if (term === "a") {
        return await new Promise<readonly SearchableOption[]>((resolve) => {
          settleSlow = resolve;
        });
      }
      return [{ value: "9", label: "Alan" }];
    });
    draw({ search });

    await open();
    await type("a");
    await waitFor(() => {
      expect(search).toHaveBeenCalledWith("a");
    });

    await type("al");
    await waitFor(() => {
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Alan"]);
    });

    // The overtaken answer arrives now, and must change nothing.
    await act(() => {
      settleSlow?.([{ value: "1", label: "Stale" }]);
      return Promise.resolve();
    });

    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Alan"]);
  });
});

describe("the keyboard", () => {
  it("moves through the list without leaving the box", async () => {
    draw();

    await open();
    press("ArrowDown");

    expect(document.activeElement).toBe(box());
    expect(box().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1]?.id,
    );
  });

  it("wraps rather than stopping at the end", async () => {
    draw();

    await open();
    press("ArrowUp");

    expect(box().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1]?.id,
    );
  });

  it("chooses the active option on Enter", async () => {
    const { onValueChange } = draw();

    await open();
    press("ArrowDown");
    press("Enter");

    expect(onValueChange).toHaveBeenCalledWith("7");
  });

  it("chooses nothing when there is nothing to choose", async () => {
    const { onValueChange } = draw({ options: [] });

    await open();
    press("Enter");

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe("choosing", () => {
  it("takes the value and closes", async () => {
    const { onValueChange } = draw();

    await open();
    fireEvent.mouseDown(screen.getByText("Ada"));

    expect(onValueChange).toHaveBeenCalledWith("2");
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("marks the current value rather than only colouring it", async () => {
    draw({ value: "7" });

    await open();

    const chosen = screen.getAllByRole("option").find((o) => o.textContent === "Grace");
    expect(chosen?.getAttribute("aria-selected")).toBe("true");
  });
});

describe("when the request fails", () => {
  it("says so instead of saying nothing matched", async () => {
    // The two look the same on screen and mean opposite things: one is an
    // answer about the data, the other is no answer at all.
    const search = vi.fn(() => Promise.reject(new Error("offline")));
    draw({ search, options: [] });

    await open();
    await type("al");

    await waitFor(() => {
      expect(screen.getByText("Could not search just now")).toBeTruthy();
    });
  });

  it("keeps the list it had rather than emptying it", async () => {
    const search = vi.fn(() => Promise.reject(new Error("offline")));
    draw({ search });

    await open();
    await type("al");

    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(2);
    });
  });
});

describe("a locked field", () => {
  it("still shows its value rather than blanking it", () => {
    draw({ value: "2", status: { ...STATUS, disabled: true } });

    expect(screen.getByRole("button").textContent).toContain("Ada");
  });
});
