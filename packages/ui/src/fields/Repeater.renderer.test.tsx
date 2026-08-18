/**
 * @vitest-environment jsdom
 *
 * The repeater, as the payload describes it.
 *
 * The payload's children are flat — every field of every row — because the
 * server addresses them that way. Everything here is about putting them back
 * into rows and writing the one value that says which rows there are.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBuiltInComponents } from "../renderers.js";
import { resetRegistry } from "../registry.js";
import { SchemaRenderer } from "../SchemaRenderer.js";

afterEach(cleanup);

beforeEach(() => {
  resetRegistry();
  registerBuiltInComponents();
});

const field = (key: string, name: string, label: string) => ({
  id: `items/${key}/${name}`,
  type: "TextInput",
  path: `items.${key}.${name}`,
  label,
});

/**
 * @param keys the list the value holds — which is what decides the order
 * @param arrived the order the payload's children come in, when it differs
 */
function draw(
  keys: readonly string[],
  state: Record<string, unknown> = {},
  arrived: readonly string[] = keys,
  props?: Record<string, unknown>,
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  const payload: SchemaPayload = {
    schema: {
      id: "0",
      type: "Schema",
      children: [
        {
          id: "items",
          type: "Repeater",
          path: "items",
          label: "Sections",
          ...(props === undefined ? {} : { props }),
          children: arrived.flatMap((key) => [
            field(key, "label", "Label"),
            field(key, "note", "Note"),
          ]),
        },
      ],
    },
    state: { items: [...keys], ...state },
    errors: {},
  };
  render(<SchemaRenderer payload={payload} onChange={onChange} />);
  return onChange;
}

describe("the rows a payload describes", () => {
  it("groups a row's fields together rather than listing them flat", () => {
    draw(["r1", "r2"], {
      "items.r1.label": "First",
      "items.r1.note": "one",
      "items.r2.label": "Second",
      "items.r2.note": "two",
    });

    expect(screen.getAllByLabelText("Label")).toHaveLength(2);
    expect(screen.getAllByLabelText("Label")[0]).toHaveProperty("value", "First");
    expect(screen.getAllByLabelText("Label")[1]).toHaveProperty("value", "Second");
  });

  it("shows them in the order the list gives, not the order they arrived", () => {
    // The children arrive r1 then r2; the list says r2 first. Built the same
    // way round, this test would pass whichever of the two decided.
    draw(["r2", "r1"], { "items.r1.label": "First", "items.r2.label": "Second" }, [
      "r1",
      "r2",
    ]);

    expect(screen.getAllByLabelText("Label")[0]).toHaveProperty("value", "Second");
  });

  it("shows nothing where the list is empty", () => {
    draw([]);

    expect(screen.queryByLabelText("Label")).toBeNull();
  });
});

describe("changing which rows there are", () => {
  it("adds one by naming it, and writes the list", () => {
    const onChange = draw(["r1"]);

    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    const [path, value] = onChange.mock.calls[0] ?? [];
    expect(path).toBe("items");
    expect(value).toHaveLength(2);
    expect((value as string[])[0]).toBe("r1");
    expect((value as string[])[1]).not.toBe("r1");
  });

  it("names each new row differently, so two adds are two rows", () => {
    const onChange = draw([]);
    const add = screen.getByRole("button", { name: /add/i });

    fireEvent.click(add);
    fireEvent.click(add);

    const first = (onChange.mock.calls[0]?.[1] as string[])[0];
    const second = (onChange.mock.calls[1]?.[1] as string[])[0];
    expect(first).not.toBe(second);
  });

  it("removes one by dropping its key, and touches nothing else", () => {
    const onChange = draw(["r1", "r2"]);

    fireEvent.click(
      screen.getAllByRole("button", { name: /remove/i })[0] as HTMLElement,
    );

    expect(onChange).toHaveBeenCalledWith("items", ["r2"]);
  });

  it("writes only the one path, whatever changed", () => {
    // Adding, removing and reordering are all the same write. A row's fields
    // are never touched by any of them.
    const onChange = draw(["r1", "r2"]);

    fireEvent.click(
      screen.getAllByRole("button", { name: /remove/i })[0] as HTMLElement,
    );

    expect(onChange.mock.calls.every(([path]) => path === "items")).toBe(true);
  });
});

describe("a row with nothing in it", () => {
  it("says so, because the server will not write it", () => {
    // The difference between a row that will be saved and one that looks
    // identical and will not.
    draw(["filled", "blank"], { "items.filled.label": "Something" });
    const rows = document.querySelectorAll(".perch-repeater__item");

    expect(rows[0]?.getAttribute("data-pending")).toBe("false");
    expect(rows[1]?.getAttribute("data-pending")).toBe("true");
  });

  it("stops saying so as soon as any one field has something", () => {
    draw(["r1"], { "items.r1.note": "just this" });

    expect(
      document.querySelector(".perch-repeater__item")?.getAttribute("data-pending"),
    ).toBe("false");
  });

  it("counts an empty string as nothing, which is what a cleared field holds", () => {
    draw(["r1"], { "items.r1.label": "", "items.r1.note": "" });

    expect(
      document.querySelector(".perch-repeater__item")?.getAttribute("data-pending"),
    ).toBe("true");
  });
});

describe("what the server called a row", () => {
  it("is shown, so a row is not only a number", () => {
    draw(["a", "b"], {}, ["a", "b"], { itemLabels: { a: "Intro", b: "Body" } });

    expect(screen.getByText("Intro")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("follows the row when the order changes, not the position", () => {
    draw(["b", "a"], {}, ["a", "b"], { itemLabels: { a: "Intro", b: "Body" } });
    const shown = [...document.querySelectorAll(".perch-repeater__label")].map(
      (el) => el.textContent,
    );

    expect(shown).toEqual(["Body", "Intro"]);
  });

  it("shows nothing for a row it named nothing", () => {
    draw(["a", "b"], {}, ["a", "b"], { itemLabels: { a: "Intro" } });

    expect(document.querySelectorAll(".perch-repeater__label")).toHaveLength(1);
  });

  it("shows nothing at all where no field asked for a name", () => {
    draw(["a"]);

    expect(document.querySelectorAll(".perch-repeater__label")).toHaveLength(0);
  });
});

describe("folding a row away", () => {
  const folding = (keys: readonly string[]) =>
    draw(keys, { "items.a.label": "Kept" }, keys, { collapsible: true });

  it("is not offered where the field did not ask for it", () => {
    draw(["a"]);

    expect(document.querySelector(".perch-repeater__fold")).toBeNull();
  });

  it("hides the row's fields without throwing them away", () => {
    // A folded field is still a field: still filled in, still saved. Unmounting
    // it would lose what is in it.
    folding(["a"]);
    fireEvent.click(screen.getByRole("button", { name: /hide item 1/i }));

    expect(
      document.querySelector(".perch-repeater__fields")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(screen.getByLabelText("Label")).toHaveProperty("value", "Kept");
  });

  it("folds one row without folding the others", () => {
    folding(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: /hide item 1/i }));

    const hidden = [...document.querySelectorAll(".perch-repeater__fields")].map((el) =>
      el.hasAttribute("hidden"),
    );
    expect(hidden).toEqual([true, false]);
  });

  it("unfolds again, and says which way it goes", () => {
    folding(["a"]);
    fireEvent.click(screen.getByRole("button", { name: /hide item 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /show item 1/i }));

    expect(
      document.querySelector(".perch-repeater__fields")?.hasAttribute("hidden"),
    ).toBe(false);
  });

  it("tells the server nothing, because folding is not state", () => {
    const onChange = folding(["a"]);
    fireEvent.click(screen.getByRole("button", { name: /hide item 1/i }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
