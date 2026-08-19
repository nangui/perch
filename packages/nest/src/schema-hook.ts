/**
 * How a module extends a form it does not own.
 *
 * Milestone A4, and the one thing PRD 11 says cannot be retrofitted: an
 * architecture that did not plan for extension never becomes extensible, it
 * gets forked. So the contract exists in v0.1 even though the plugin API
 * around it does not.
 *
 * A hook is a function of a schema, not a mutation of one. Builders are
 * immutable everywhere else here, and a hook that reached into a form and
 * changed it would be the one place a resource could stop meaning what it
 * says.
 *
 * It sees the resource it is extending, because "add `createdBy` to everything
 * auditable" is the shape these actually take — an audit module has no list of
 * the resources it is meant to touch, only a rule for recognising them.
 */
import type { Schema } from "@perchjs/core";
import type { ResourceMetadata } from "./resource.js";

export type SchemaHook = (resource: ResourceMetadata, schema: Schema) => Schema;

/** What `PanelModule.forRoot({ extend })` is handed. */
export const PANEL_SCHEMA_HOOKS = Symbol("PANEL_SCHEMA_HOOKS");
