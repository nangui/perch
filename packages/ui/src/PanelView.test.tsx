/**
 * @vitest-environment jsdom
 *
 * The View page, drawn.
 *
 * What it must not have is as much of the point as what it shows: nothing to
 * type into, nothing to submit, and no round trip to make.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SchemaPayload } from "@perchjs/core";
import { beforeAll, describe, expect, it } from "vitest";
import { PanelView } from "./PanelView.js";
import { registerBuiltInComponents } from "./renderers.js";

beforeAll(() => {
  registerBuiltInComponents();
});

const payload = (
  children: NonNullable<SchemaPayload["schema"]["children"]>,
): SchemaPayload => ({
  schema: { id: "root", type: "Schema", children },
  state: {},
  errors: {},
});

describe("an entry on the page", () => {
  it("shows what the server read from the record", () => {
    render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "Title", value: "Ada" },
        ])}
      />,
    );

    expect(screen.getByText("Ada")).toBeDefined();
  });

  it("shows a number as readily as a string", () => {
    render(
      <PanelView
        payload={payload([{ id: "a", type: "TextEntry", label: "Count", value: 12 }])}
      />,
    );

    expect(screen.getByText("12")).toBeDefined();
  });

  it("says what is missing rather than leaving a blank line", () => {
    render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "City", placeholder: "Not given" },
        ])}
      />,
    );

    expect(screen.getByText("Not given")).toBeDefined();
  });

  it("marks itself empty, so the blank reads as one and not as an oversight", () => {
    const { container } = render(
      <PanelView payload={payload([{ id: "a", type: "TextEntry", label: "City" }])} />,
    );

    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
  });
});

/** The entry itself, not the shell around it: the label is text too. */
const entry = (props: Record<string, unknown>, value?: unknown): string => {
  const { container } = render(
    <PanelView
      payload={payload([
        {
          id: "a",
          type: "TextEntry",
          label: "Value",
          ...(value === undefined ? {} : { value }),
          props,
        },
      ])}
    />,
  );
  return container.querySelector(".perch-entry")?.textContent ?? "";
};

describe("a value the server said how to present", () => {
  it("reads a timestamp in the zone that was named, not the machine's", () => {
    // 08:00 UTC is 10:00 in Paris. A page that showed 08:00 would be right
    // about the instant and wrong about the question anybody is asking.
    const shown = entry(
      { format: "dateTime", timezone: "Europe/Paris" },
      "2026-06-15T08:00:00.000Z",
    );

    expect(shown).toContain("10:00");
  });

  it("groups a number the way the reader's own locale groups one", () => {
    expect(entry({ format: "numeric" }, 1234567)).not.toBe("1234567");
  });

  it("keeps the places it was told to keep", () => {
    expect(entry({ format: "numeric", decimals: 2 }, 3)).toContain("3.00");
  });

  it("shows an amount in the currency the form declared", () => {
    const shown = entry({ format: "money", currency: "EUR" }, 12.5);

    expect(shown).toMatch(/12[.,]50/);
    expect(shown).toMatch(/€|EUR/);
  });
});

describe("a rule the value does not fit", () => {
  it("shows the value rather than the word Invalid", () => {
    expect(entry({ format: "dateTime" }, "not a date")).toBe("not a date");
  });

  it("survives a timezone the runtime has never heard of", () => {
    // `Intl` throws on one. One entry may not take the page with it.
    expect(
      entry(
        { format: "dateTime", timezone: "Mars/Olympus" },
        "2026-06-15T08:00:00.000Z",
      ),
    ).toBe("2026-06-15T08:00:00.000Z");
  });

  it("survives a currency code that is not one", () => {
    expect(entry({ format: "money", currency: "nope" }, 12.5)).toBe("12.5");
  });

  it("says nothing is there when the value is missing, rule or no rule", () => {
    expect(entry({ format: "money", currency: "EUR" })).toBe("—");
  });
});

const pill = (props: Record<string, unknown>, node: Record<string, unknown> = {}) =>
  render(
    <PanelView
      payload={payload([
        { id: "a", type: "TextEntry", label: "Role", value: "lead", props, ...node },
      ])}
    />,
  ).container.querySelector(".perch-badge");

describe("a value drawn as a badge", () => {
  it("is a pill rather than a line of text", () => {
    expect(pill({ badge: true })?.textContent).toBe("lead");
  });

  it("wears the colour the server chose", () => {
    expect(pill({ badge: true }, { tone: "success" })?.className).toContain(
      "perch-badge--success",
    );
  });

  it("falls back to neutral rather than to a class the stylesheet has not got", () => {
    // A tone from a panel built against a newer core. An unknown name is not a
    // colour, and a pill with no background reads as a rendering fault.
    expect(pill({ badge: true }, { tone: "chartreuse" })?.className).toContain(
      "perch-badge--neutral",
    );
  });

  it("colours the words where no pill was asked for", () => {
    // `.badge()` and `.color()` are separate options. A tone that drew nothing
    // without the other would be a declaration nothing acts on.
    const container = render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "Role", value: "lead", tone: "success" },
        ])}
      />,
    ).container;

    expect(container.querySelector(".perch-badge")).toBeNull();
    expect(container.querySelector('[data-tone="success"]')).not.toBeNull();
  });

  it("colours nothing where there is nothing to colour", () => {
    const container = render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "Role", tone: "danger" },
        ])}
      />,
    ).container;

    expect(container.querySelector("[data-tone]")).toBeNull();
  });

  it("is not drawn around nothing", () => {
    // A pill around an em dash draws the eye to the one place on the page with
    // the least in it.
    const container = render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "Role", props: { badge: true } },
        ])}
      />,
    ).container;

    expect(container.querySelector(".perch-badge")).toBeNull();
    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
  });
});

const rows = (children: NonNullable<SchemaPayload["schema"]["children"]>) =>
  render(
    <PanelView
      payload={payload([
        { id: "r", type: "RepeatableEntry", label: "Notes", children },
      ])}
    />,
  ).container;

describe("a value with more to it than is shown", () => {
  it("is shortened, and says so", () => {
    expect(entry({ limit: 5 }, "Wrote the first algorithm")).toBe("Wrote\u2026");
  });

  it("keeps the whole of it a hover away", () => {
    const container = render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", value: "Wrote the first", props: { limit: 5 } },
        ])}
      />,
    ).container;

    expect(container.querySelector(".perch-entry")?.getAttribute("title")).toBe(
      "Wrote the first",
    );
  });

  it("counts the way a reader counts, not the way a string does", () => {
    // A family emoji is seven code points. Cut by code unit it leaves a box.
    expect(entry({ limit: 2 }, "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}ab")).toBe(
      "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}a\u2026",
    );
  });

  it("says nothing about a value that already fits", () => {
    const container = render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", value: "Ada", props: { limit: 10 } },
        ])}
      />,
    ).container;

    expect(container.querySelector(".perch-entry")?.getAttribute("title")).toBeNull();
  });
});

describe("a value that can be copied", () => {
  /** jsdom has no clipboard, which is the case the button checks for. */
  const withClipboard = (): { written: string[] } => {
    const written: string[] = [];
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
    return { written };
  };

  const copyable = (props: Record<string, unknown>, value: unknown): HTMLElement =>
    render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", value, props: { copyable: true, ...props } },
        ])}
      />,
    ).container;

  it("offers none where the browser has no clipboard to write to", () => {
    // A button that cannot do its one job is worse than no button: the reader
    // presses it and nothing happens.
    expect(
      copyable({}, "ada@example.com").querySelector(".perch-entry__copy"),
    ).toBeNull();
  });

  it("copies the whole value, not the shortened one", async () => {
    const { written } = withClipboard();
    const container = copyable({ limit: 3 }, "ada@example.com");

    fireEvent.click(container.querySelector(".perch-entry__copy") as HTMLElement);
    await waitFor(() => {
      expect(written).toEqual(["ada@example.com"]);
    });
  });

  it("offers a button named for the entry, not for what is in it", () => {
    // Named for the value, a biography was read aloud in full before the
    // button said what it did. The entry's own name is what tells one copy
    // button from the next, and it is one phrase long.
    withClipboard();
    const container = render(
      <PanelView
        payload={payload([
          {
            id: "a",
            type: "TextEntry",
            label: "Email",
            value: "ada@example.com",
            props: { copyable: true },
          },
        ])}
      />,
    ).container;

    expect(
      container.querySelector(".perch-entry__copy")?.getAttribute("aria-label"),
    ).toBe("Copy Email");
  });

  it("says just Copy where the entry has no name to borrow", () => {
    withClipboard();
    const container = copyable({}, "ada@example.com");

    expect(
      container.querySelector(".perch-entry__copy")?.getAttribute("aria-label"),
    ).toBe("Copy");
  });

  it("offers none where there is nothing to copy", () => {
    withClipboard();
    const container = render(
      <PanelView
        payload={payload([{ id: "a", type: "TextEntry", props: { copyable: true } }])}
      />,
    ).container;

    expect(container.querySelector(".perch-entry__copy")).toBeNull();
  });
});

describe("a value the server made an address of", () => {
  it("is a link to what the server built", () => {
    const container = render(
      <PanelView
        payload={payload([
          {
            id: "a",
            type: "TextEntry",
            value: "ada@example.com",
            href: "mailto:ada@example.com",
          },
        ])}
      />,
    ).container;

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("mailto:ada@example.com");
    expect(link?.textContent).toBe("ada@example.com");
  });

  it("is words where the server built none", () => {
    const container = render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", value: "javascript:alert(1)" },
        ])}
      />,
    ).container;

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector(".perch-entry")?.textContent).toBe(
      "javascript:alert(1)",
    );
  });
});

describe("the rows of a relation", () => {
  it("draws one group per row, each holding its own values", () => {
    const container = rows([
      {
        id: "r/0",
        type: "Schema",
        children: [{ id: "r/0/0", type: "TextEntry", label: "Note", value: "First" }],
      },
      {
        id: "r/1",
        type: "Schema",
        children: [{ id: "r/1/0", type: "TextEntry", label: "Note", value: "Second" }],
      },
    ]);

    const drawn = [...container.querySelectorAll(".perch-rows__row")];
    expect(drawn.length).toBe(2);
    expect(drawn.map((row) => row.querySelector(".perch-entry")?.textContent)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("says there is nothing rather than leaving an empty box", () => {
    // An empty box reads as a page that failed to load, not as a relation with
    // nothing in it.
    const container = rows([]);

    expect(container.querySelector(".perch-rows__empty")).not.toBeNull();
    expect(container.querySelectorAll(".perch-rows__row").length).toBe(0);
  });

  it("offers nothing to add, reorder or remove", () => {
    const container = rows([
      {
        id: "r/0",
        type: "Schema",
        children: [{ id: "a", type: "TextEntry", value: "x" }],
      },
    ]);

    expect(container.querySelectorAll("button").length).toBe(0);
  });
});

describe("what the page does not offer", () => {
  const page = (): HTMLElement =>
    render(
      <PanelView
        payload={payload([
          { id: "a", type: "TextEntry", label: "Title", value: "Ada" },
          { id: "b", type: "TextEntry", label: "Author", value: "Grace" },
        ])}
      />,
    ).container;

  it("has nothing to type into", () => {
    expect(page().querySelectorAll("input, textarea, select").length).toBe(0);
  });

  it("has nothing to submit", () => {
    expect(page().querySelectorAll("button, form").length).toBe(0);
  });
});
