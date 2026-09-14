/**
 * A page with a schema and no model behind it.
 *
 * Settings, an import screen, a business dashboard: things a panel has to show
 * that are not the CRUD of a table. It is a resource in every way except the
 * one that matters — nothing is read from a row and nothing is written to one,
 * so what it does with what it was given is its own business.
 *
 * Instantiated by the container, like a resource and for the same reason: a
 * settings page that cannot inject the service holding the settings is a page
 * that cannot do its one job.
 */
import type { FormState, IconName, Schema } from "@perchjs/core";
import type { Authorization } from "./authorization.js";
import { Injectable, SetMetadata } from "@nestjs/common";

export const PANEL_PAGE = Symbol("PERCH_PANEL_PAGE");

export interface PanelPageOptions {
  /** The URL segment, under the panel's own path. `settings`, `import`. */
  readonly path: string;
  /** What the menu calls it. The path, spaced and capitalised, unless told. */
  readonly label?: string;
  readonly navigationGroup?: string;
  readonly navigationSort?: number;
  readonly icon?: IconName;
}

export interface PageMetadata {
  readonly path: string;
  readonly label: string;
  readonly navigationGroup?: string;
  readonly navigationSort?: number;
  readonly icon?: IconName;
}

export interface PanelPage {
  /** The tree the page draws. Rebuilt per request, like a resource's form. */
  schema: () => Schema;
  /**
   * What the form starts with.
   *
   * A settings page that opens empty is a settings page that wipes the
   * settings the first time somebody presses save, so this is how the current
   * values get in. Absent means a page that starts blank, which is what an
   * import screen wants.
   */
  state?: () => FormState | Promise<FormState>;
  /**
   * What pressing save does.
   *
   * Handed the state that survived the boundary: what crossed was replayed
   * against this schema, and anything a field did not admit was dropped before
   * it got here. Absent means a page that shows and does not submit — a
   * dashboard — and the panel draws no save button for it.
   */
  submit?: (state: FormState) => unknown;
  /**
   * Who may reach it. Absent means allowed, as for a resource: the panel is
   * already behind the guards.
   *
   * Only `viewAny` is read. A page has no rows, so the per-record questions
   * have nothing to be asked about.
   */
  can?: Pick<Authorization, "viewAny">;
}

export function PanelPage(options: PanelPageOptions): ClassDecorator {
  const metadata = withDefaults(options);
  return (target) => {
    Injectable()(
      target as unknown as Parameters<ClassDecorator>[0] & (new () => unknown),
    );
    SetMetadata(PANEL_PAGE, metadata)(target);
  };
}

export function pageMetadata(target: unknown): PageMetadata | undefined {
  if (typeof target !== "function") return undefined;
  return Reflect.getMetadata(PANEL_PAGE, target) as PageMetadata | undefined;
}

function withDefaults(options: PanelPageOptions): PageMetadata {
  return {
    path: options.path,
    label: options.label ?? titled(options.path),
    ...(options.navigationGroup === undefined
      ? {}
      : { navigationGroup: options.navigationGroup }),
    ...(options.navigationSort === undefined
      ? {}
      : { navigationSort: options.navigationSort }),
    ...(options.icon === undefined ? {} : { icon: options.icon }),
  };
}

/** `import-orders` → `Import orders`, which is what a menu reads. */
function titled(path: string): string {
  const words = path.replaceAll("-", " ").trim();
  return words === "" ? path : words.charAt(0).toUpperCase() + words.slice(1);
}
