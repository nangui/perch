/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
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
    // "tag Tags" is not what the link is called.
    render(<PanelNav groups={GROUPS} />);
    const link = screen.getByRole("link", { name: "Tags" });

    expect(within(link).getByText("tag").getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing at all when there is nothing to reach", () => {
    // An empty landmark is a landmark a screen reader offers and then finds
    // empty.
    render(<PanelNav groups={[]} />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
