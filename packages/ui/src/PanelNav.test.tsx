/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NavigationGroup } from "./PanelNav.js";
import { PanelNav } from "./PanelNav.js";

afterEach(cleanup);

const GROUPS: readonly NavigationGroup[] = [
  { items: [{ label: "Dashboard", href: "/admin/dashboard" }] },
  {
    label: "Content",
    items: [
      { label: "Posts", href: "/admin/posts", current: true },
      { label: "Tags", href: "/admin/tags", icon: "tag" },
    ],
  },
];

describe("the panel menu", () => {
  it("is a landmark, so a screen reader can skip it", () => {
    render(<PanelNav groups={GROUPS} />);

    expect(screen.getByRole("navigation", { name: "Panel" })).toBeTruthy();
  });

  it("heads a group that has a name, and not one that does not", () => {
    render(<PanelNav groups={GROUPS} />);

    expect(screen.getByRole("heading", { name: "Content" })).toBeTruthy();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("says which page you are on rather than only drawing it", () => {
    render(<PanelNav groups={GROUPS} />);

    expect(
      screen.getByRole("link", { name: "Posts" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Tags" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("hides the icon from the accessible name", () => {
    // "tag Tags" is not what the link is called — and now that the name
    // resolves to a drawing, the word is not in the link at all.
    render(<PanelNav groups={GROUPS} />);
    const link = screen.getByRole("link", { name: "Tags" });

    expect(link.textContent).toBe("Tags");
    expect(link.querySelector(".perch-nav__icon")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("renders nothing at all when there is nothing to reach", () => {
    // An empty landmark is a landmark a screen reader offers and then finds
    // empty.
    render(<PanelNav groups={[]} />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("a count beside a name", () => {
  /** Its own groups: the shared ones are what the tests above read by name. */
  const COUNTED: readonly NavigationGroup[] = [
    {
      items: [
        { label: "Posts", href: "/admin/posts" },
        { label: "Tags", href: "/admin/tags", badge: "12" },
      ],
    },
  ];

  it("is drawn, and is part of what the link is called", () => {
    // The opposite of the icon beside it. A mark says nothing a reader needs;
    // a number is the whole reason the entry looks different today, and hiding
    // it from a screen reader would hide the only news in the menu.
    render(<PanelNav groups={COUNTED} />);

    // Loose on the spacing, exact on the fact: the name computation joins the
    // label and the count without one, and where the space falls is not what
    // this is about.
    expect(screen.getByRole("link", { name: /Tags\s*12/ })).toBeTruthy();
    expect(screen.getByText("12").getAttribute("aria-hidden")).toBeNull();
  });

  it("is absent from an entry that has none", () => {
    render(<PanelNav groups={COUNTED} />);
    const posts = screen.getByRole("link", { name: "Posts" });

    expect(posts.querySelector(".perch-nav__badge")).toBeNull();
  });
});
