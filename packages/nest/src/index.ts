/**
 * `@perchjs/nest` — inbound adapter: PanelModule, routing, guards, navigation.
 *
 * May import `@perchjs/core`. May never import `@perchjs/prisma`: data access
 * goes through the `DataAdapter` port (PRD 04 §7, ARCH 12 §1).
 *
 * Holds PRD 04 and stages 1, 2 and 9 of the nine-stage pipeline.
 */

export type { PanelAssets } from "./panel-assets.js";
export {
  loadPanelAssets,
  PANEL_ASSETS,
  SUPPORTED_MANIFEST_VERSION,
} from "./panel-assets.js";
export { PanelAssetsController } from "./panel-assets.controller.js";
export type { StateRequest } from "./panel-state.controller.js";
export { PanelStateController } from "./panel-state.controller.js";
export { PanelPageController } from "./panel-page.controller.js";
export type { SaveResponse } from "./panel-save.controller.js";
export { PanelSaveController } from "./panel-save.controller.js";
export type { Admission, Admitted } from "./admission.js";
export { admit, AdmissionCycleError } from "./admission.js";
export type { ShellOptions } from "./panel-shell.js";
export { renderShell } from "./panel-shell.js";
export type { Authorization, Verdict } from "./authorization.js";
export { authorize, mayReach } from "./authorization.js";
export { recordId } from "./record-id.js";
export type { IncomingUrl } from "./panel-root.js";
export { rootOf, sameOrigin } from "./panel-root.js";
export type { RedirectAfterCreate } from "./redirect.js";
export { PANEL_REDIRECT_AFTER_CREATE } from "./redirect.js";
export type { UserResolver } from "./user-resolver.js";
export { PANEL_USER_RESOLVER, RequestUserResolver } from "./user-resolver.js";
export type { PanelModuleOptions } from "./panel.module.js";
export type { RecordsResponse } from "./panel-records.controller.js";
export { PanelRecordsController } from "./panel-records.controller.js";
export type { RawQuery } from "./records-query.js";
export {
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  MAX_SKIP,
  readQuery,
} from "./records-query.js";
export { project, projectOne, visibleKeys } from "./row-projection.js";
export { PanelModule } from "./panel.module.js";
export type { PanelResourceOptions, ResourceMetadata } from "./resource.js";
export { PANEL_RESOURCE, PanelResource, resourceMetadata } from "./resource.js";
export type { RegisteredResource, ResourceClass } from "./resource-registry.js";
export { PANEL_RESOURCE_TYPES, ResourceRegistry } from "./resource-registry.js";
