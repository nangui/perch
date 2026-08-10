/**
 * The component registry.
 *
 * A renderer is keyed by the `type` string the server put on the node, never by
 * a class: `@perchjs/ui` receives types from core and no values, so
 * `instanceof` is not available and would not survive JSON anyway.
 *
 * This is also extension point E3: a plugin registers its own field under its
 * own key, through the same call the built-in fields use.
 */
import type { ComponentType } from "react";
import type { NodeProps } from "./node-props.js";

const RENDERERS = new Map<string, ComponentType<NodeProps>>();

export function registerComponent(
  type: string,
  renderer: ComponentType<NodeProps>,
): void {
  RENDERERS.set(type, renderer);
}

export function lookupComponent(type: string): ComponentType<NodeProps> | undefined {
  return RENDERERS.get(type);
}

/** Test seam: a registration would otherwise leak between suites. */
export function resetRegistry(): void {
  RENDERERS.clear();
}
