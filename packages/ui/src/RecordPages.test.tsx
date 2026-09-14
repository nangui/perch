/**
 * @vitest-environment jsdom
 *
 * The strip of links a record carries.
 *
 * Everything in it was decided on the server: which pages exist, which this
 * reader may reach, which one is being read. What is left is whether a reader
 * who cannot see the page is told the same things a reader who can is.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecordPages } from "./RecordPages.js";
import type { RecordPage } from "./RecordPages.js";

beforeEach(cleanup);

const draw = (pages: readonly RecordPage[]): HTMLElement =>
  render(<RecordPages pages={pages} />).container;

const three: readonly RecordPage[] = [
  { label: "View", href: "/admin/posts/1" },
  { label: "Edit", href: "/admin/posts/1/edit", current: true },
  { label: "Statistics", href: "/admin/posts/1/stats", icon: "star" },
];

describe("the strip", () => {
  it("offers every page as a link, in the order it was given", () => {
    const links = [...draw(three).querySelectorAll<HTMLAnchorElement>("a")];

    expect(links.map((one) => [one.textContent, one.getAttribute("href")])).toEqual([
      ["View", "/admin/posts/1"],
      ["Edit", "/admin/posts/1/edit"],
      ["Statistics", "/admin/posts/1/stats"],
    ]);
  });

  it("names the page being read rather than only colouring it", () => {
    // A colour is not a thing a reader who cannot see it is told.
    draw(three);

    expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Edit");
  });

  it("draws the mark a page named", () => {
    const marks = draw(three).querySelectorAll(".perch-record-pages__icon");

    expect(marks).toHaveLength(1);
    expect(marks[0]?.tagName.toLowerCase()).toBe("svg");
  });

  it("draws no mark for a name the panel cannot draw", () => {
    const container = draw([
      ...three,
      { label: "Odd", href: "/admin/posts/1/odd", icon: "aubergine" },
    ]);

    expect(container.querySelectorAll(".perch-record-pages__icon")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Odd" })).toBeTruthy();
  });

  it("is announced as its own navigation, not as the panel's menu", () => {
    expect(draw(three).querySelector("nav")?.getAttribute("aria-label")).toBe(
      "This record",
    );
  });
});

describe("a record with nothing to choose between", () => {
  it("gets no strip at one page", () => {
    // A strip of one reads as a control that does not work.
    expect(draw([three[0] as RecordPage]).innerHTML).toBe("");
  });

  it("gets no strip at none", () => {
    expect(draw([]).innerHTML).toBe("");
  });
});
