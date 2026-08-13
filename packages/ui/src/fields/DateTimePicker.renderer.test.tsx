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
