/**
 * @vitest-environment jsdom
 *
 * Whether there is a bar across the top at all.
 *
 * An empty one is not a neutral thing: it takes a strip off the top of every
 * page for something nobody asked for. A panel where nobody declared a user
 * menu and no plugin put anything up there has no business losing the space,
 * and the bar being invisible is not the same as it not being there.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PanelTopbar } from "./PanelTopbar.js";
import { registerRenderHook, resetRenderHooks } from "./hooks.js";

beforeEach(() => {
  resetRenderHooks();
  cleanup();
});

const bar = (menu?: { readonly name: string }): Element | null =>
  render(
    <PanelTopbar {...(menu === undefined ? {} : { menu })} />,
  ).container.querySelector(".perch-topbar");

describe("the bar", () => {
  it("is not drawn at all where there is nothing to put in it", () => {
    expect(bar()).toBeNull();
  });

  it("is drawn for a panel that declared who is signed in", () => {
    expect(bar({ name: "Ada" })?.textContent).toContain("Ada");
  });

  it("is drawn for a plugin alone, with nobody signed in", () => {
    registerRenderHook("topbar.start", () => "a notice");

    expect(bar()?.textContent).toBe("a notice");
  });

  it("holds both, the name at the far end", () => {
    // Which is where a reader looks for it, and what keeps a plugin's button
    // from landing between the name and the edge.
    registerRenderHook("topbar.start", () => "a notice");
    const drawn = bar({ name: "Ada" });

    expect(drawn?.textContent).toBe("a noticeAda");
    expect(drawn?.querySelector(".perch-topbar__end")?.textContent).toBe("Ada");
  });
});
