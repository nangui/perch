/**
 * @vitest-environment jsdom
 */
/**
 * The grid, and what each card does on its own.
 *
 * The behaviour worth holding is the isolation: the roster is drawn before any
 * number exists, each card asks for its own, and one that fails says so in its
 * own box while the others fill in. A dashboard is accepted on exactly that —
 * six cards drawing at once and filling in one by one, and a seventh that
 * throws leaving the six alone — which is why a widget has a route to itself.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { StatNode } from "@perchjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetCard } from "./PanelWidgets.js";
import { PanelWidgets } from "./PanelWidgets.js";

afterEach(cleanup);

const card = (name: string, columnSpan?: number): WidgetCard => ({
  name,
  href: `/admin/api/widget/${name}`,
  ...(columnSpan === undefined ? {} : { columnSpan }),
});

/** A card's box, by the name the roster gave it. */
const boxes = (): readonly HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".perch-widget"),
];

describe("a roster the shell sent", () => {
  it("draws a box per card before a single number exists", async () => {
    // Never resolves. The dashboard is on screen anyway, which is the point.
    render(
      <PanelWidgets
        widgets={[card("visits"), card("signups")]}
        load={() => new Promise<readonly StatNode[]>(() => undefined)}
      />,
    );

    expect(boxes()).toHaveLength(2);
    await waitFor(() => {
      expect(boxes().every((box) => box.getAttribute("aria-busy") === "true")).toBe(
        true,
      );
    });
  });

  it("draws nothing at all for an empty roster", () => {
    // No grid rather than an empty one: a page holding no card and a page whose
    // every card was refused are the same page.
    render(<PanelWidgets widgets={[]} load={() => Promise.resolve([])} />);

    expect(document.querySelector(".perch-widgets")).toBeNull();
  });

  it("asks once per card, at the address the roster carried", async () => {
    const load = vi.fn<(card: WidgetCard) => Promise<readonly StatNode[]>>(() =>
      Promise.resolve([]),
    );
    render(<PanelWidgets widgets={[card("visits"), card("signups")]} load={load} />);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    expect(load.mock.calls.map(([one]) => one.href)).toStrictEqual([
      "/admin/api/widget/visits",
      "/admin/api/widget/signups",
    ]);
  });

  it("carries the width a card asked for, as a property the stylesheet reads", async () => {
    render(
      <PanelWidgets
        widgets={[card("wide", 2), card("plain")]}
        load={() => Promise.resolve([])}
      />,
    );

    await waitFor(() => {
      expect(boxes()).toHaveLength(2);
    });
    expect(boxes()[0]?.style.getPropertyValue("--perch-widget-span")).toBe("2");
    // Nothing set, so the stylesheet's own default of one column stands. A `1`
    // written here would be the renderer repeating a decision the CSS owns.
    expect(boxes()[1]?.style.getPropertyValue("--perch-widget-span")).toBe("");
  });
});

describe("one card going wrong", () => {
  const answers: Readonly<Record<string, readonly StatNode[]>> = {
    visits: [{ label: "Visits", value: 1200 }],
    signups: [{ label: "Signups", value: 31 }],
  };

  const loadWithOneBroken = (one: WidgetCard): Promise<readonly StatNode[]> =>
    one.name === "broken"
      ? Promise.reject(new Error("500"))
      : Promise.resolve(answers[one.name] ?? []);

  it("says so in its own box and leaves the others filled", async () => {
    render(
      <PanelWidgets
        widgets={[card("visits"), card("broken"), card("signups")]}
        load={loadWithOneBroken}
      />,
    );

    // The requirement, in one assertion: the failure is visible and local.
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("That did not load");
    });
    expect(screen.getByText("1200")).toBeTruthy();
    expect(screen.getByText("31")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("offers another go, and takes it", async () => {
    let attempts = 0;
    const flaky = (): Promise<readonly StatNode[]> => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("500"))
        : Promise.resolve<readonly StatNode[]>([{ label: "Visits", value: 7 }]);
    };

    render(<PanelWidgets widgets={[card("visits")]} load={flaky} />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    retry.click();

    await waitFor(() => {
      expect(screen.getByText("7")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("what a card says", () => {
  const shown = async (stat: StatNode): Promise<string> => {
    render(
      <PanelWidgets widgets={[card("one")]} load={() => Promise.resolve([stat])} />,
    );
    const value = await waitFor(() => {
      const found = document.querySelector(".perch-stat__value");
      if (found === null) throw new Error("no value drawn");
      return found;
    });
    return value.textContent;
  };

  it("reads a plain number as it came", async () => {
    expect(await shown({ label: "Visits", value: 1200 })).toBe("1200");
  });

  it("reads nothing as a dash, never as a nought", async () => {
    // An empty set has no average. A nought would be an answer.
    expect(await shown({ label: "Average", value: null })).toBe("—");
  });

  it("reads money with its currency", async () => {
    const said = await shown({
      label: "Payroll",
      value: 90000,
      format: "money",
      currency: "EUR",
    });

    expect(said).toContain("90,000");
    expect(said).toMatch(/€|EUR/);
  });

  it("keeps every digit of a decimal that arrived as text", async () => {
    // A `Decimal` crosses as a string because it does not survive a double.
    // Formatting it through a number would undo the whole reason it is text.
    const said = await shown({
      label: "Owed",
      value: "12345678901234.57",
      format: "numeric",
      decimals: 2,
    });

    expect(said).toContain("12,345,678,901,234.57");
  });

  it("falls back to the digits when the currency is not one", async () => {
    // `currency` is a free string on a declaration nothing validates, and Intl
    // throws on a code it does not know. A card is not worth a blank page.
    expect(
      await shown({ label: "Payroll", value: 42, format: "money", currency: "NOPE" }),
    ).toBe("42");
  });

  it("falls back to the digits when money was asked for with no currency", async () => {
    expect(await shown({ label: "Payroll", value: 42, format: "money" })).toBe("42");
  });

  it("draws the description and its trend arrow", async () => {
    render(
      <PanelWidgets
        widgets={[card("one")]}
        load={() =>
          Promise.resolve<readonly StatNode[]>([
            {
              label: "Sales",
              value: 10,
              description: "12% up",
              descriptionIcon: "trending-up",
              tone: "success",
            },
          ])
        }
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("12% up")).toBeTruthy();
    });
    expect(document.querySelector(".perch-stat__trend")).toBeTruthy();
    // A variant class, where this used to be a `data-tone` attribute a rule
    // had to match. The tone is part of what the card is now rather than
    // something hung on it afterwards.
    expect(document.querySelector(".perch-stat__description")?.className).toContain(
      "perch-stat__description--tone_success",
    );
  });

  it("ignores a tone it has no colour for", async () => {
    // The vocabulary is closed. A name outside it draws the ordinary card
    // rather than an attribute no rule matches.
    render(
      <PanelWidgets
        widgets={[card("one")]}
        load={() =>
          Promise.resolve<readonly StatNode[]>([
            { label: "Sales", value: 10, tone: "chartreuse" },
          ])
        }
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Sales")).toBeTruthy();
    });
    // Nowhere on the card, which is what the closed vocabulary means: the
    // card this one draws is the card with no tone at all. Asserted over the
    // whole of it rather than on one part, since this fixture has no quiet
    // line for a tone to have coloured.
    expect(document.body.innerHTML).not.toMatch(/--tone_/);
  });
});
