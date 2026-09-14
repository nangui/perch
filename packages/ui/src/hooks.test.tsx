/**
 * @vitest-environment jsdom
 *
 * Extension point E4: a component somebody else wrote, on a page they do not
 * own.
 *
 * Two promises are load-bearing here and neither is visible on a working
 * panel. That two plugins at one position come out the same way twice, rather
 * than in whatever order the bundler reached them. And that a plugin which
 * throws loses its own corner and nothing else — the panel is how somebody
 * would go and turn it off, so taking the panel down with it is the one
 * failure there is no way back from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import type { MockInstance } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import {
  HOOK_POSITIONS,
  isHookPosition,
  registerRenderHook,
  RenderHooks,
  resetRenderHooks,
} from "./hooks.js";

beforeEach(() => {
  resetRenderHooks();
  cleanup();
});

const Banner = (): string => "a banner";

describe("a position", () => {
  it("draws what a plugin put there", () => {
    registerRenderHook("shell.start", Banner);
    render(<RenderHooks at="shell.start" />);

    expect(screen.getByText("a banner")).toBeTruthy();
  });

  it("draws nothing where nobody put anything", () => {
    const { container } = render(<RenderHooks at="shell.start" />);

    expect(container.innerHTML).toBe("");
  });

  it("keeps a component to the position it was registered at", () => {
    registerRenderHook("shell.start", Banner);
    const { container } = render(<RenderHooks at="page.end" />);

    expect(container.innerHTML).toBe("");
  });

  it("is refused where the chrome has no such place", () => {
    // A registration that quietly does nothing is worse than a failure: the
    // author sees a panel without their component and no reason for it.
    expect(() => {
      registerRenderHook("footer.end", Banner);
    }).toThrow(/Unknown render hook position/);
  });

  it("names what it does draw, so the message is actionable", () => {
    let said = "";
    try {
      registerRenderHook("nowhere", Banner);
    } catch (error) {
      said = String(error);
    }

    for (const position of HOOK_POSITIONS) expect(said).toContain(position);
  });

  it("admits exactly the positions the chrome draws", () => {
    expect(isHookPosition("shell.start")).toBe(true);
    expect(isHookPosition("topbar.end")).toBe(true);
    // The panel draws no footer, so there is nowhere to put one.
    expect(isHookPosition("footer.end")).toBe(false);
  });
});

describe("two plugins at one position", () => {
  const order = (): readonly string[] =>
    [...document.body.querySelectorAll("span")].map((one) => one.textContent);

  const Wrap = ({ children }: { readonly children: string }): ReactNode => (
    <span>{children}</span>
  );

  it("come out in the order they declared, not the order they arrived", () => {
    registerRenderHook("page.start", () => <Wrap>late</Wrap>, { order: 10 });
    registerRenderHook("page.start", () => <Wrap>early</Wrap>, { order: -10 });
    render(<RenderHooks at="page.start" />);

    expect(order()).toEqual(["early", "late"]);
  });

  it("come out the same way twice where neither declared one", () => {
    // Rule 4. Registration order is the tie-break, so that "no order" is still
    // an order rather than whatever the bundler did this time.
    registerRenderHook("page.start", () => <Wrap>one</Wrap>);
    registerRenderHook("page.start", () => <Wrap>two</Wrap>);
    render(<RenderHooks at="page.start" />);

    expect(order()).toEqual(["one", "two"]);
  });

  it("keeps registration as the tie-break within one declared order", () => {
    registerRenderHook("page.start", () => <Wrap>a</Wrap>, { order: 5 });
    registerRenderHook("page.start", () => <Wrap>b</Wrap>, { order: 5 });
    render(<RenderHooks at="page.start" />);

    expect(order()).toEqual(["a", "b"]);
  });
});

describe("a plugin that throws", () => {
  let complained: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    // React writes its own report to the console as well; neither is the
    // thing under test, and both would drown the run.
    complained = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    complained.mockRestore();
  });

  const Broken = (): never => {
    throw new Error("the plugin is wrong");
  };

  it("loses its own corner and nothing else", () => {
    registerRenderHook("page.start", Broken, { id: "audit-log" });
    registerRenderHook("page.start", Banner, { order: 1 });

    expect(() => render(<RenderHooks at="page.start" />)).not.toThrow();
    expect(screen.getByText("a banner")).toBeTruthy();
  });

  it("does not take the panel down with it, which is where it gets turned off", () => {
    registerRenderHook("page.start", Broken);
    const { container } = render(
      <div>
        <RenderHooks at="page.start" />
        <p>the page</p>
      </div>,
    );

    expect(container.textContent).toContain("the page");
  });

  it("is named in the console, nothing else being able to say which it was", () => {
    registerRenderHook("page.start", Broken, { id: "audit-log" });
    render(<RenderHooks at="page.start" />);

    const said = complained.mock.calls.map((one) => String(one[0])).join("\n");
    expect(said).toContain("audit-log");
    expect(said).toContain("page.start");
  });

  it("leaves no apology on the page for a thing nobody was promised", () => {
    registerRenderHook("page.start", Broken);
    const { container } = render(<RenderHooks at="page.start" />);

    expect(container.textContent).toBe("");
  });
});

describe("the set of positions", () => {
  /** The chrome, as it is written — the only place a position can be drawn. */
  function chrome(): string {
    const here = `${process.cwd()}/packages/ui/src`;
    return readdirSync(here)
      .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
      .map((name) => readFileSync(`${here}/${name}`, "utf8"))
      .join("\n");
  }

  it("holds no position the chrome does not actually draw", () => {
    // The failure this guards is silent from every angle except the page: a
    // position offered, registered against, and drawn nowhere. The plugin
    // author sees a panel without their component and is told nothing.
    const drawn = chrome();
    const undrawn = HOOK_POSITIONS.filter(
      (position) => !drawn.includes(`at="${position}"`),
    );

    expect(undrawn).toEqual([]);
  });

  it("is the whole of what the chrome draws, nothing off the list", () => {
    // The other direction: a position drawn in the markup but not declared
    // cannot be registered against, so it is a slot nobody can reach.
    const used = [...chrome().matchAll(/<RenderHooks\s+at="([^"]+)"/g)].map((one) =>
      String(one[1]),
    );

    expect([...new Set(used)].sort()).toEqual([...HOOK_POSITIONS].sort());
  });
});
