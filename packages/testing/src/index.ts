/**
 * `@perchjs/testing` — helpers that drive a panel the way a browser does.
 *
 * Through its own routes, its own resolution cycle and its own trust
 * boundary. Nothing here reaches inside: every assertion is made against what
 * crossed the wire, which is the only thing a reader ever sees.
 */
export type { Wire } from "./wire.js";
export type { PanelTestOptions } from "./harness.js";
export { createPanelTest, PanelTest } from "./harness.js";
export { ResourceTest } from "./resource.js";
export { FormTest } from "./form.js";
