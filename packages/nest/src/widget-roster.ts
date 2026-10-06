/**
 * Which cards a dashboard draws, and nothing about what is on them.
 *
 * The roster is the one half of a widget that travels with the page. The
 * numbers do not: each card asks for its own on its own request once the
 * chrome is up, so a dashboard of eight heavy aggregates draws at once and
 * fills in, and the slow one is slow alone.
 *
 * Narrowed here as well as on the route, and neither alone is enough. A roster
 * listing a widget this reader may not have tells them it exists and what it is
 * called; a roster that leaves it out is no protection, because the route is
 * still there to be asked. A hidden button never was one.
 */
import { mayReach } from "./authorization.js";
import type { WidgetRegistry } from "./widget-registry.js";

/** One card's place on the page, as the browser gets it. */
export interface WidgetCard {
  /** What it is called, which is also what it answers at. */
  readonly name: string;
  /**
   * Where its numbers are.
   *
   * Built here rather than assembled in the browser from a base and a name:
   * the panel's root is only knowable from the request, and an address the
   * client guesses is an address that breaks under a global prefix.
   */
  readonly href: string;
  /** How many columns it asks for. Absent means one. */
  readonly columnSpan?: number;
}

/**
 * The cards this page holds, in the order the dashboard draws them.
 *
 * The registry's order, not the page's list: `sort` is declared on the widget
 * because placement is the widget's business, so a page naming three of them
 * gets those three where they belong among the rest rather than in the order
 * somebody happened to type.
 */
export async function buildRoster(
  widgets: WidgetRegistry,
  named: readonly string[],
  root: string,
  user: unknown,
): Promise<readonly WidgetCard[]> {
  if (named.length === 0) return [];

  const wanted = new Set(named);
  const roster: WidgetCard[] = [];

  for (const widget of widgets.all()) {
    if (!wanted.has(widget.metadata.name)) continue;
    if (!(await mayReach(widget.instance.can, user))) continue;

    roster.push({
      name: widget.metadata.name,
      href: `${root}/api/widget/${encodeURIComponent(widget.metadata.name)}`,
      ...(widget.metadata.columnSpan === undefined
        ? {}
        : { columnSpan: widget.metadata.columnSpan }),
    });
  }

  return roster;
}
