/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CalendarSurface } from "./CalendarSurface.js";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";
import { SchemaRenderer } from "../SchemaRenderer.js";

beforeAll(() => {
  const element = Element.prototype as unknown as Record<string, unknown>;
  element["hasPointerCapture"] = () => false;
  element["setPointerCapture"] = () => undefined;
  element["releasePointerCapture"] = () => undefined;
  element["scrollIntoView"] = () => undefined;
});

afterEach(cleanup);

function draw(
  value: unknown,
  props: Record<string, unknown> = { withTime: true, timezone: "Europe/Paris" },
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  resetRegistry();
  registerBuiltInComponents();
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "publishedAt",
          type: "DateTimePicker",
          path: "publishedAt",
          label: "Published",
          props,
        },
      ],
    },
    state: { publishedAt: value },
    errors: {},
  };
  render(<SchemaRenderer payload={payload} onChange={onChange} />);
  return onChange;
}

describe("a DateTimePicker a form declared", () => {
  it("reaches the page at all", () => {
    draw("2026-06-15T12:00");

    expect(screen.getByDisplayValue("2026-06-15")).toBeTruthy();
  });

  it("splits the wall clock into the segments the control works in", () => {
    draw("2026-06-15T12:00");

    expect(screen.getByDisplayValue("2026-06-15")).toBeTruthy();
    expect(screen.getByDisplayValue("12:00")).toBeTruthy();
  });

  it("shows the zone it is showing, rather than leaving it to be assumed", () => {
    // A date with no zone beside it is a date each reader completes from their
    // own, which is the misunderstanding the whole field exists to prevent.
    draw("2026-06-15T12:00");

    expect(screen.getByText("Europe/Paris")).toBeTruthy();
  });

  it("shows an empty control for a column never written", () => {
    // Both segments empty, and neither showing today as though a row held it.
    draw(null);

    expect(screen.getAllByDisplayValue("")).toHaveLength(2);
  });
});

describe("typing a date", () => {
  it("reports the two segments joined back into one wall clock", () => {
    const onChange = draw("2026-06-15T12:00");

    fireEvent.change(screen.getByDisplayValue("2026-06-15"), {
      target: { value: "2026-07-01" },
    });

    expect(onChange).toHaveBeenCalledWith("publishedAt", "2026-07-01T12:00");
  });

  it("reports a cleared field as empty rather than as half a value", () => {
    // `T14:30` with no day is a wall clock the boundary refuses, and the reader
    // would never learn why.
    const onChange = draw("2026-06-15T12:00");

    fireEvent.change(screen.getByDisplayValue("2026-06-15"), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith("publishedAt", "");
  });
});

describe("a date-only field", () => {
  it("carries no time segment at all", () => {
    draw("2026-06-15", { withTime: false, timezone: "Europe/Paris" });

    expect(screen.getByDisplayValue("2026-06-15")).toBeTruthy();
    expect(screen.queryByDisplayValue("12:00")).toBeNull();
  });

  it("reports just the day", () => {
    const onChange = draw("2026-06-15", { withTime: false, timezone: "Europe/Paris" });

    fireEvent.change(screen.getByDisplayValue("2026-06-15"), {
      target: { value: "2026-07-01" },
    });

    expect(onChange).toHaveBeenCalledWith("publishedAt", "2026-07-01");
  });
});

/**
 * The grid arrives on its own chunk, so every one of these waits for it. A
 * synchronous query here would find nothing and read as a calendar that drew
 * no days.
 */
async function openCalendar(props: Record<string, unknown>): Promise<void> {
  draw("2026-06-15", { withTime: false, ...props });
  fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
  await screen.findByRole("grid");
}

/** A day by the date it is, rather than by the number it shows. */
function day(iso: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(
    `.perch-calendar__day[data-value="${iso}"]`,
  );
  if (found === null) throw new Error(`no day for ${iso}`);
  return found;
}

/** Refused, which is an aria state here and not a disabled attribute. */
function refused(iso: string): boolean {
  return day(iso).getAttribute("aria-disabled") === "true";
}

/**
 * Presses a key on the grid and waits for the day it moves to.
 *
 * Awaited, every one of them: the grid is a state machine that answers on a
 * tick of its own, so a synchronous read after the key is a read of the day
 * before it. Measured — every assertion in here passed the key and failed the
 * day until it was written this way.
 */
async function walks(key: string, iso: string): Promise<void> {
  fireEvent.keyDown(screen.getByRole("grid"), { key });
  await waitFor(() => {
    expect(focused(), `${key} did not reach ${iso}`).toBe(iso);
  });
}

/** The one day the grid would hand the caret to. */
function focused(): string | null {
  return (
    document
      .querySelector(".perch-calendar__day[data-focus]")
      ?.getAttribute("data-value") ?? null
  );
}

describe("the bounds a field declared", () => {
  it("closes the days before the floor", async () => {
    await openCalendar({ minDate: "2026-06-10" });

    expect(refused("2026-06-09")).toBe(true);
    expect(refused("2026-06-10")).toBe(false);
  });

  it("closes the days past the ceiling", async () => {
    // The server refuses one either side; before this, only the floor was
    // shown, so a reader picked a date the save then turned down.
    await openCalendar({ maxDate: "2026-06-20" });

    expect(refused("2026-06-20")).toBe(false);
    expect(refused("2026-06-21")).toBe(true);
  });

  it("closes both when a field declared both", async () => {
    await openCalendar({ minDate: "2026-06-10", maxDate: "2026-06-20" });

    expect(refused("2026-06-09")).toBe(true);
    expect(refused("2026-06-15")).toBe(false);
    expect(refused("2026-06-21")).toBe(true);
  });

  it("leaves every day of the month open where a field declared neither", async () => {
    await openCalendar({});

    expect(refused("2026-06-01")).toBe(false);
    expect(refused("2026-06-30")).toBe(false);
  });

  it("refuses the days the neighbouring months lend it", async () => {
    // Shown so the grid keeps its height, and not selectable, which is what
    // their greying has claimed all along. They used to select.
    await openCalendar({});

    expect(day("2026-07-01").hasAttribute("data-outside-range")).toBe(true);
    expect(refused("2026-07-01")).toBe(true);
  });
});

describe("the grid a reader has no mouse for", () => {
  it("is one tab stop for the month, not one per day", async () => {
    // Thirty-one stops is what it was: reachable, and nobody's idea of
    // navigable. A reader tabbing past a date field crossed a month to leave it.
    await openCalendar({});

    const stops = [...document.querySelectorAll(".perch-calendar__day")].filter(
      (one) => one.getAttribute("tabindex") === "0",
    );

    expect(stops).toHaveLength(1);
    expect(stops[0]?.getAttribute("data-value")).toBe("2026-06-15");
  });

  it("walks the week sideways and the month downwards", async () => {
    await openCalendar({});

    await walks("ArrowRight", "2026-06-16");
    await walks("ArrowDown", "2026-06-23");
    await walks("ArrowLeft", "2026-06-22");
    // The month's ends, not the week's — which is what this grid means by
    // Home and End, and was worth finding out from it rather than assuming.
    await walks("End", "2026-06-30");
    await walks("Home", "2026-06-01");
  });

  it("changes month with the page keys", async () => {
    await openCalendar({});

    await walks("PageDown", "2026-07-15");
    await walks("PageUp", "2026-06-15");
  });

  it("reports the day it was walked to, not the day it opened on", async () => {
    // The whole point of the keys: a reader who cannot click still commits a
    // date, and the field hears the same ISO string a click would have sent.
    const onChange = vi.fn();
    resetRegistry();
    registerBuiltInComponents();
    render(
      <SchemaRenderer
        payload={{
          schema: {
            id: "0",
            type: "Schema",
            children: [
              {
                id: "publishedAt",
                type: "DateTimePicker",
                path: "publishedAt",
                label: "Published",
                props: { withTime: false },
              },
            ],
          },
          state: { publishedAt: "2026-06-15" },
          errors: {},
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
    const grid = await screen.findByRole("grid");

    fireEvent.keyDown(grid, { key: "ArrowRight" });
    await waitFor(() => {
      expect(focused()).toBe("2026-06-16");
    });
    fireEvent.keyDown(grid, { key: "Enter" });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("publishedAt", "2026-06-16");
    });
  });
});

/**
 * The zone a column declared, and what the grid computes with it.
 *
 * Driven straight at the grid rather than through a form, because what is being
 * held is the one thing in here that reads a clock. Both of these were found by
 * attacking the change rather than by it failing: a zone used to be a label
 * drawn beside the control, and handing it to something that computes with it
 * is what gave a typo in one the power to take a form down.
 */
describe("the zone a column declared", () => {
  /** 23:30 UTC, when Paris is already on the next day. */
  const LATE = new Date("2026-10-06T23:30:00Z");

  const todayIs = (): string | null =>
    document
      .querySelector(".perch-calendar__day[data-today]")
      ?.getAttribute("data-value") ?? null;

  afterEach(() => {
    vi.useRealTimers();
  });

  function at(zone: string | undefined): void {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(LATE);
    render(
      <CalendarSurface
        selected="2026-10-06"
        onSelect={() => undefined}
        {...(zone === undefined ? {} : { timeZone: zone })}
      />,
    );
  }

  it("marks today by that zone rather than by the reader's machine", () => {
    at("Europe/Paris");

    // Half past eleven in London is half past one in Paris, on the day after.
    // A panel whose rows are stamped in Paris should not mark the sixth.
    expect(todayIs()).toBe("2026-10-07");
  });

  it("marks a different day for a different zone, at the same instant", () => {
    // The pair is the test. One of them alone passes against a grid that reads
    // any clock at all, including the wrong one.
    at("UTC");

    expect(todayIs()).toBe("2026-10-06");
  });

  it("draws a calendar for a zone that is not one, rather than throwing", () => {
    // `timezone` is a free string on a column and nothing validates it, so a
    // typo reaches here. Measured before the guard: this threw `Invalid time
    // zone specified` out of render, which is a form that will not draw over a
    // word spelled wrong.
    expect(() => {
      at("Europe/Pariss");
    }).not.toThrow();

    expect(screen.getByRole("grid")).toBeTruthy();
  });

  it("draws a calendar for an empty zone, which a declaration can hold", () => {
    expect(() => {
      at("");
    }).not.toThrow();

    expect(screen.getByRole("grid")).toBeTruthy();
  });
});
