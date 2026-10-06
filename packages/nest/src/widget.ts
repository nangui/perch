/**
 * A card, or a row of them, with no model behind it.
 *
 * A widget is declared the way a resource and a page are: a class the
 * container builds, so it can inject whatever holds its numbers. A widget that
 * cannot reach the service with the figures in it is a widget that cannot do
 * its one job, which is the argument `custom-page.ts` already makes for a
 * settings page.
 *
 * Its kind is the interface it implements, and the decorator says only where
 * it sits. `StatsWidget` answers cards; a later kind answers something else,
 * and neither needs the decorator to grow a word for it.
 */
import type { Stat } from "@perchjs/core";
import { Injectable, SetMetadata } from "@nestjs/common";
import type { Authorization } from "./authorization.js";

export const PANEL_WIDGET = Symbol("PERCH_PANEL_WIDGET");

export interface PanelWidgetOptions {
  /**
   * What a request calls it, under the panel's own path.
   *
   * Explicit rather than taken from the class, because a class name is
   * something minification is entitled to change and an address is not.
   */
  readonly name: string;
  /** Where it sits among the others. Absent sorts after everything numbered. */
  readonly sort?: number;
  /**
   * How many columns of the dashboard's grid it asks for.
   *
   * A count, and what a count means against a grid is the renderer's to
   * settle: the server's business is that it is a sane number of columns, not
   * how wide one is.
   */
  readonly columnSpan?: number;
}

export interface WidgetMetadata {
  readonly name: string;
  readonly sort?: number;
  readonly columnSpan?: number;
}

/** A widget that answers cards. */
export interface StatsWidget {
  /**
   * The cards, worked out when somebody asks.
   *
   * Per request rather than at boot, which is why nothing about a card is
   * checked at boot: these numbers do not exist until this runs. What cannot
   * be drawn is refused when it is answered, and that is one card's failure.
   */
  stats: () => readonly Stat[] | Promise<readonly Stat[]>;
  /**
   * Who may ask for them. Absent means allowed, as for a page: the panel is
   * already behind the guards.
   *
   * Only `viewAny` is read. A widget is about no record, so the per-record
   * questions have nothing to be asked about.
   */
  can?: Pick<Authorization, "viewAny">;
}

export function PanelWidget(options: PanelWidgetOptions): ClassDecorator {
  const metadata: WidgetMetadata = {
    name: options.name,
    ...(options.sort === undefined ? {} : { sort: options.sort }),
    ...(options.columnSpan === undefined ? {} : { columnSpan: options.columnSpan }),
  };

  return (target) => {
    Injectable()(
      target as unknown as Parameters<ClassDecorator>[0] & (new () => unknown),
    );
    SetMetadata(PANEL_WIDGET, metadata)(target);
  };
}

export function widgetMetadata(target: unknown): WidgetMetadata | undefined {
  if (typeof target !== "function") return undefined;
  return Reflect.getMetadata(PANEL_WIDGET, target) as WidgetMetadata | undefined;
}
