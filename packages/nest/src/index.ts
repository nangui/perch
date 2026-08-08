/**
 * `@perchjs/nest` — inbound adapter: PanelModule, routing, guards, navigation.
 *
 * May import `@perchjs/core`. May never import `@perchjs/prisma`: data access
 * goes through the `DataAdapter` port (PRD 04 §7, ARCH 12 §1).
 *
 * To be built here: PRD 04, and stages 1, 2 and 9 of the nine-stage pipeline.
 */

export type { PanelAssets } from "./panel-assets.js";
export { loadPanelAssets, SUPPORTED_MANIFEST_VERSION } from "./panel-assets.js";

export const PERCH_NEST_STATUS = "pre-implementation" as const;
