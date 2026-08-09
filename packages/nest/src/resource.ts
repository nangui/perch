/**
 * The decorator carries the resource's metadata and makes the class
 * `@Injectable`: instantiating through the container is what lets a resolver
 * inject a business service and call `this.cities.byCountry(…)`.
 */
import type { Schema } from "@perchjs/core";
import type { Authorization } from "./authorization.js";
import type { RedirectAfterCreate } from "./redirect.js";
import { Injectable, SetMetadata } from "@nestjs/common";

export const PANEL_RESOURCE = Symbol("PERCH_PANEL_RESOURCE");

export interface PanelResourceOptions {
  /** The Prisma model this resource edits. */
  readonly model: string;
  /** URL segment. Defaults to the kebab-case plural of the model. */
  readonly slug?: string;
  readonly label?: string;
  readonly pluralLabel?: string;
  readonly navigationGroup?: string;
  readonly navigationSort?: number;
  readonly icon?: string;
}

/** What the registry holds once the defaults are filled in. */
export interface ResourceMetadata {
  readonly model: string;
  readonly slug: string;
  readonly label: string;
  readonly pluralLabel: string;
  readonly navigationGroup?: string;
  readonly navigationSort?: number;
  readonly icon?: string;
}

/** One `form()` serves Create and Edit, told apart by `operation`. */
export interface PanelResource {
  form: () => Schema;
  /** Absent means allowed: the panel already sits behind the guards. */
  can?: Authorization;
  /** Overrides the panel's own choice for this resource alone. */
  redirectAfterCreate?: RedirectAfterCreate;
  /** Last chance to shape what is written — hashing a password, say. */
  mutateFormDataBeforeCreate?: (
    data: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  mutateFormDataBeforeSave?: (
    data: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

export function PanelResource(options: PanelResourceOptions): ClassDecorator {
  const metadata = withDefaults(options);
  return (target) => {
    Injectable()(
      target as unknown as Parameters<ClassDecorator>[0] & (new () => unknown),
    );
    SetMetadata(PANEL_RESOURCE, metadata)(target);
  };
}

export function resourceMetadata(target: unknown): ResourceMetadata | undefined {
  if (typeof target !== "function") return undefined;
  return Reflect.getMetadata(PANEL_RESOURCE, target) as ResourceMetadata | undefined;
}

function withDefaults(options: PanelResourceOptions): ResourceMetadata {
  const label = options.label ?? spaced(options.model);
  return {
    model: options.model,
    slug: options.slug ?? kebab(plural(options.model)),
    label,
    pluralLabel: options.pluralLabel ?? plural(label),
    ...(options.navigationGroup === undefined
      ? {}
      : { navigationGroup: options.navigationGroup }),
    ...(options.navigationSort === undefined
      ? {}
      : { navigationSort: options.navigationSort }),
    ...(options.icon === undefined ? {} : { icon: options.icon }),
  };
}

/**
 * Deliberately naive — `y → ies`, `s/x/z/ch/sh → es`, otherwise `s`. It is a
 * default for a URL, not a linguistics engine: anything it gets wrong is fixed
 * by writing `slug` down, which is clearer than a rule nobody can predict.
 */
function plural(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

function kebab(word: string): string {
  return word
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function spaced(word: string): string {
  return word.replace(/([a-z\d])([A-Z])/g, "$1 $2");
}
