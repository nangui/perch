/**
 * @vitest-environment jsdom
 *
 * What a reader is shown, and what a reader who is not looking is told.
 *
 * The form beside this one hides its headings, because each of its cells is a
 * box carrying its own name. A read page has no such thing, so the headings
 * here have to be real ones — which is most of what this file checks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { SchemaRenderer } from "../SchemaRenderer.js";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
  cleanup();
});

const draw = (node: Record<string, unknown>): HTMLElement => {
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "one",
          type: "KeyValueEntry",
          path: "settings",
          label: "Settings",
          ...node,
        },
      ],
    },
    state: {},
    errors: {},
  };
  return render(<SchemaRenderer payload={payload} onChange={vi.fn()} />).container;
};

const pairs: readonly (readonly [string, string])[] = [
  ["theme", "dark"],
  ["locale", "fr"],
];

describe("the rows", () => {
  it("are drawn in the order the server read them", () => {
    const rows = draw({ pairs }).querySelectorAll("tbody tr");

    expect([...rows].map((row) => row.textContent)).toEqual(["themedark", "localefr"]);
  });

  it("are drawn exactly as they arrived, this half converting nothing", () => {
    // The server already decided that a number is shown as its JSON.
    const container = draw({ pairs: [["retries", "3"]] });

    expect(container.querySelector("tbody td")?.textContent).toBe("3");
  });

  it("each carry the key as the heading of their own row", () => {
    // So that a cell read on its own is read as "theme, dark" and not as
    // "dark", which is a value belonging to nothing.
    const row = draw({ pairs }).querySelector("tbody tr");

    expect(within(row as HTMLElement).getByRole("rowheader").textContent).toBe("theme");
  });
});

describe("what the columns are called", () => {
  it("is Key and Value where the entry said nothing", () => {
    draw({ pairs });

    expect(screen.getByRole("columnheader", { name: "Key" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Value" })).toBeTruthy();
  });

  it("is what the entry said, where it said something", () => {
    draw({ pairs, props: { keyLabel: "Header", valueLabel: "Sent" } });

    expect(screen.getByRole("columnheader", { name: "Header" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Sent" })).toBeTruthy();
  });

  it("is announced rather than hidden, unlike the form's", () => {
    const head = draw({ pairs }).querySelector("thead");

    expect(head?.getAttribute("aria-hidden")).toBeNull();
  });
});

describe("a column with nothing in it", () => {
  it("is the placeholder, not an empty table", () => {
    const container = draw({ pairs: [], placeholder: "No settings" });

    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".perch-entry")?.textContent).toBe("No settings");
  });

  it("is the placeholder where the column held nothing at all", () => {
    const container = draw({ placeholder: "No settings" });

    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".perch-entry")?.textContent).toBe("No settings");
  });
});

describe("a column holding something that is not an object", () => {
  it("is shown as the JSON it is, rather than as an empty table", () => {
    // An empty table says the column is empty. This is the case where it is
    // not, and a reader who cannot see what is in it cannot go and fix it.
    const container = draw({ value: [1, 2], placeholder: "No settings" });

    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".perch-entry")?.textContent).toBe("[1,2]");
  });

  it("is told apart from a column that is genuinely empty", () => {
    expect(draw({ value: "plain" }).querySelector(".perch-entry")?.textContent).toBe(
      '"plain"',
    );
    cleanup();
    expect(
      draw({ value: "plain" })
        .querySelector(".perch-entry")
        ?.getAttribute("data-empty"),
    ).toBeNull();
    cleanup();
    expect(draw({}).querySelector(".perch-entry")?.getAttribute("data-empty")).toBe(
      "true",
    );
  });
});

describe("the table as a whole", () => {
  it("carries the entry's name, the shell's label being inert on a table", () => {
    // `label for` names a form control. A table is not one, so the shell's
    // label reaches nothing and the table would be listed unnamed among the
    // others a page holds.
    draw({ pairs });

    expect(screen.getByRole("table", { name: "Settings" })).toBeTruthy();
  });

  it("takes the name from the entry rather than inventing one", () => {
    cleanup();
    draw({ pairs, label: "Request headers" });

    expect(screen.getByRole("table", { name: "Request headers" })).toBeTruthy();
  });
});
