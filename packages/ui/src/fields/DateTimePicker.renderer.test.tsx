/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

describe("the bounds a field declared", () => {
  const openCalendar = (props: Record<string, unknown>): void => {
    draw("2026-06-15", { withTime: false, ...props });
    fireEvent.click(screen.getByRole("button", { name: "Open calendar" }));
  };

  /**
   * A day by the number it shows. Its accessible name is a written-out date —
   * "Tuesday, 9 June 2026" — so the number alone will not find it.
   */
  const day = (shown: string): HTMLButtonElement => {
    const found = [...document.querySelectorAll(".perch-calendar__day")].find(
      (element) =>
        element.textContent === shown &&
        element.getAttribute("data-outside") === "false",
    );
    if (found === undefined) throw new Error(`no day showing ${shown}`);
    return found as HTMLButtonElement;
  };

  it("closes the days before the floor", () => {
    openCalendar({ minDate: "2026-06-10" });

    expect(day("9").disabled).toBe(true);
    expect(day("10").disabled).toBe(false);
  });

  it("closes the days past the ceiling", () => {
    // The server refuses one either side; before this, only the floor was
    // shown, so a reader picked a date the save then turned down.
    openCalendar({ maxDate: "2026-06-20" });

    expect(day("20").disabled).toBe(false);
    expect(day("21").disabled).toBe(true);
  });

  it("closes both when a field declared both", () => {
    openCalendar({ minDate: "2026-06-10", maxDate: "2026-06-20" });

    expect(day("9").disabled).toBe(true);
    expect(day("15").disabled).toBe(false);
    expect(day("21").disabled).toBe(true);
  });

  it("leaves every day open where a field declared neither", () => {
    openCalendar({});

    expect(day("1").disabled).toBe(false);
    expect(day("28").disabled).toBe(false);
  });
});
