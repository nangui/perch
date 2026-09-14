/**
 * @vitest-environment jsdom
 *
 * Who is signed in, drawn.
 *
 * Nothing is decided here — the name was read on the server, the items were
 * filtered there and the addresses were checked there. What this half owes is
 * a control that behaves like the controls beside it, and one that does not
 * pretend to open something when there is nothing to open.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PanelUser } from "./PanelUser.js";
import type { PanelUserMenu } from "./PanelUser.js";

beforeEach(cleanup);

const draw = (menu: PanelUserMenu): HTMLElement =>
  render(<PanelUser menu={menu} />).container;

const ada: PanelUserMenu = {
  name: "Ada Lovelace",
  items: [
    { label: "Profile", href: "/me" },
    { label: "Sign out", href: "/auth/logout" },
  ],
};

describe("the menu", () => {
  it("says who is signed in", () => {
    expect(draw(ada).querySelector(".perch-user__name")?.textContent).toBe(
      "Ada Lovelace",
    );
  });

  it("draws the line under the name where there is one", () => {
    const container = draw({ ...ada, description: "ada@example.com" });

    expect(container.querySelector(".perch-user__description")?.textContent).toBe(
      "ada@example.com",
    );
  });

  it("has none where none was declared", () => {
    expect(draw(ada).querySelector(".perch-user__description")).toBeNull();
  });

  it("offers each item as a link, at the address the server checked", () => {
    const links = [
      ...draw(ada).querySelectorAll<HTMLAnchorElement>(".perch-user__link"),
    ];

    expect(links.map((one) => [one.textContent, one.getAttribute("href")])).toEqual([
      ["Profile", "/me"],
      ["Sign out", "/auth/logout"],
    ]);
  });

  it("draws the mark an item named", () => {
    const container = draw({
      name: "Ada",
      items: [{ label: "Profile", href: "/me", icon: "user" }],
    });

    expect(container.querySelector(".perch-user__icon")?.tagName.toLowerCase()).toBe(
      "svg",
    );
  });

  it("draws no mark for a name the panel cannot draw", () => {
    const container = draw({
      name: "Ada",
      items: [{ label: "Profile", href: "/me", icon: "aubergine" }],
    });

    expect(container.querySelector(".perch-user__icon")).toBeNull();
    expect(container.querySelector(".perch-user__link")?.textContent).toBe("Profile");
  });
});

describe("what opens it", () => {
  it("is a disclosure, which the browser opens and Escape closes", () => {
    // Rather than a menu built by hand: the arrow keys, the focus trap and the
    // outside click, written again and worse.
    const container = draw(ada);

    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("summary")).not.toBeNull();
  });

  it("is shut until somebody opens it", () => {
    expect(draw(ada).querySelector("details")?.open).toBe(false);
  });

  it("is named for what pressing it does, the name being visible anyway", () => {
    draw(ada);

    expect(screen.getByLabelText("Account: Ada Lovelace")).toBeTruthy();
  });
});

describe("a reader with nothing to open", () => {
  it("is told who they are without being offered a control", () => {
    // A button that opens an empty panel is a promise the panel did not make.
    const container = draw({ name: "Ada Lovelace" });

    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector(".perch-user__name")?.textContent).toBe(
      "Ada Lovelace",
    );
  });

  it("is the same where the server filtered every item away", () => {
    const container = draw({ name: "Ada", items: [] });

    expect(container.querySelector("details")).toBeNull();
  });
});
