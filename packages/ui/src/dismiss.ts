/**
 * A disclosure closes when the reader turns away from it.
 *
 * The menus here are native `details` elements, which is the right shape: they
 * open on a click, hold their content, and are announced as disclosures without
 * a line of JavaScript. What the element does not do is close. Nothing in HTML
 * says a `details` should notice a click somewhere else, so a reader who opens a
 * row's menu, thinks better of it and clicks the page is left with it open —
 * and because each row holds its own, a table ends up with three menus standing
 * over the rows below them.
 *
 * One handler answers both, and the second falls out of the first: a click on
 * another row's button is a click outside this one.
 *
 * `pointerdown` in the capture phase, so the menu is gone before whatever was
 * clicked does its own work, and so a click on another summary closes this one
 * before the browser toggles that one. Escape as well, because a menu a mouse
 * can dismiss and a keyboard cannot is a menu somebody is trapped in; focus
 * goes back to the button that opened it, which is where it came from.
 */
import type { RefObject } from "react";
import { useEffect } from "react";

export function useDismiss(details: RefObject<HTMLDetailsElement | null>): void {
  useEffect(() => {
    const close = (event: Event): void => {
      const shell = details.current;
      if (shell === null || !shell.open) return;

      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        shell.open = false;
        shell.querySelector("summary")?.focus();
        return;
      }

      // Inside includes the panel, which is a child of the `details` even where
      // it is painted somewhere else: choosing something in the menu is not
      // turning away from it, and the choice's own handler is what acts.
      // Narrowed rather than asserted: the two checkers disagree about whether
      // an assertion here is needed, and a target that is not a node at all is
      // outside by definition.
      const target = event.target;
      if (!(target instanceof Node) || !shell.contains(target)) shell.open = false;
    };

    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [details]);
}
