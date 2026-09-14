/**
 * Render hooks — extension point E4: named positions in the chrome.
 *
 * A plugin puts a component at a position the panel drew, without owning the
 * page it lands on: a banner above everything, a link under the navigation, a
 * notice at the top of whatever is being read.
 *
 * **Registered in the browser, never sent.** The server cannot hand over a
 * component, and it must not hand over markup: markup crossing the wire to be
 * put on a page is the shape of an injection, which is why an icon is a name
 * here and not a drawing. So this is a registry, and it is the same call a
 * plugin already makes for a field of its own. Nothing in the core knows that
 * plugins exist — an extension point the core has to be told about is one the
 * core got wrong.
 *
 * **The set of positions is closed.** A position is a promise the chrome
 * keeps, and one that can be invented by its caller is a promise about
 * nothing: the component lands nowhere and the author is told nothing. So an
 * unknown position is refused where it is registered, loudly, the way an
 * unknown icon name is refused at boot.
 *
 * **A hook is handed nothing.** Not an oversight: what a plugin would want to
 * know about the page around it is a shape nobody has designed yet, and one
 * invented here would be frozen by the first plugin that read it. A banner and
 * a link need none of it, and what is given later can be given; what is given
 * now cannot be taken back.
 */
import type { ComponentType, ReactNode } from "react";
import { HookBoundary } from "./HookBoundary.js";

/**
 * Where a hook may go, which is where the chrome has somewhere to put it.
 *
 * Deliberately short. Each of these is a place that exists in the markup
 * today; a panel with a topbar will have topbar positions when it has a
 * topbar, rather than a topbar drawn so that a position can exist.
 */
export const HOOK_POSITIONS = [
  /** Above everything, inside the shell. The banner position. */
  "shell.start",
  "shell.end",
  /** Inside the navigation, before and after its groups. */
  "sidebar.start",
  "sidebar.end",
  /** Around what the page is showing, under its heading. */
  "page.start",
  "page.end",
] as const;

export type HookPosition = (typeof HOOK_POSITIONS)[number];

export function isHookPosition(name: string): name is HookPosition {
  return (HOOK_POSITIONS as readonly string[]).includes(name);
}

interface Registered {
  readonly component: ComponentType;
  readonly order: number;
  /** Where it came from, for the message when it throws. */
  readonly id: string;
  /** What it was registered at, to keep the sort stable. */
  readonly at: number;
}

/**
 * What to call a component that did not say.
 *
 * `name` is typed as always being there and is empty for an arrow passed
 * inline — which is how a small hook tends to be written, and exactly the one
 * that will need naming when it throws.
 */
function nameOf(component: ComponentType): string {
  const said = component.displayName ?? component.name;
  return said === "" ? "a plugin" : said;
}

const HOOKS = new Map<HookPosition, Registered[]>();
let registrations = 0;

export interface RenderHookOptions {
  /**
   * Where it goes among the others at the same position. Lower is earlier.
   *
   * Declared rather than inferred, because two plugins at one position would
   * otherwise be ordered by whichever module the bundler happened to reach
   * first — an order that changes under people without anybody editing
   * anything, and that nobody can state in advance.
   */
  readonly order?: number;
  /** A name for the message, where the component throws. Its package, ideally. */
  readonly id?: string;
}

/**
 * Puts a component at a named position.
 *
 * Refuses a position the chrome does not have. A registration that silently
 * does nothing is worse than a failure: the plugin author sees a panel without
 * their component and no reason for it.
 */
export function registerRenderHook(
  position: string,
  component: ComponentType,
  options: RenderHookOptions = {},
): void {
  if (!isHookPosition(position)) {
    throw new Error(
      `Unknown render hook position ${JSON.stringify(position)}. ` +
        `The panel draws: ${HOOK_POSITIONS.join(", ")}.`,
    );
  }

  const list = HOOKS.get(position) ?? [];
  list.push({
    component,
    order: options.order ?? 0,
    id: options.id ?? nameOf(component),
    at: registrations,
  });
  registrations += 1;
  HOOKS.set(position, list);
}

/** Test seam: a registration would otherwise leak between suites. */
export function resetRenderHooks(): void {
  HOOKS.clear();
  registrations = 0;
}

/**
 * What was registered at a position, in the order it is drawn.
 *
 * By declared order, then by when it was registered. The second half is what
 * makes two plugins that both said nothing come out the same way twice.
 */
function at(position: HookPosition): readonly Registered[] {
  return [...(HOOKS.get(position) ?? [])].sort(
    (one, two) => one.order - two.order || one.at - two.at,
  );
}

export interface RenderHooksProps {
  readonly at: HookPosition;
}

/**
 * Draws whatever a plugin put here, each behind its own boundary.
 *
 * Behind its own, so that one that throws loses its own corner and not the
 * panel. A component out of a package nobody in this tree wrote would
 * otherwise take the whole page down with it — and the page is how somebody
 * would go and turn that plugin off.
 */
export function RenderHooks({ at: position }: RenderHooksProps): ReactNode {
  const hooks = at(position);
  if (hooks.length === 0) return null;

  return (
    <>
      {hooks.map((hook) => (
        <HookBoundary key={`${hook.id}#${String(hook.at)}`} id={hook.id} at={position}>
          <hook.component />
        </HookBoundary>
      ))}
    </>
  );
}
