/**
 * The panel's entry point. Serves the assets today; the protocol routes and the
 * HTML shell arrive with the resources that fill them.
 *
 * The prefix goes through `RouterModule` because `@Controller` fixes its path at
 * declaration while `path` is configuration — and it leaves `setGlobalPrefix`
 * and versioning to Nest.
 */
import type { DynamicModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { RouterModule } from "@nestjs/core";
import { PanelAssetsController } from "./panel-assets.controller.js";
import { PanelPageController } from "./panel-page.controller.js";
import { PanelStateController } from "./panel-state.controller.js";
import type { PanelAssets } from "./panel-assets.js";
import { loadPanelAssets, PANEL_ASSETS } from "./panel-assets.js";
import type { ResourceClass } from "./resource-registry.js";
import { PANEL_RESOURCE_TYPES, ResourceRegistry } from "./resource-registry.js";

export interface PanelModuleOptions {
  /** Where the panel lives, e.g. `/admin`. */
  readonly path: string;
  /** Registered explicitly; discovery by folder scan comes later. */
  readonly resources?: readonly ResourceClass[];
  /**
   * Modules whose providers the resources inject. Resources are instantiated
   * here, so their dependencies have to be visible here.
   */
  readonly imports?: NonNullable<DynamicModule["imports"]>;
  /** Resolved from `@perchjs/ui` when absent; passing it is for tests. */
  readonly assets?: PanelAssets;
}

@Module({})
export class PanelModule {
  /** Assets resolve once, so a bad manifest stops the boot rather than a request. */
  static forRoot(options: PanelModuleOptions): DynamicModule {
    const assets = options.assets ?? loadPanelAssets();

    return {
      module: PanelModule,
      imports: [
        ...(options.imports ?? []),
        RouterModule.register([{ path: normalise(options.path), module: PanelModule }]),
      ],
      // The page route is last: its `:resource/create` would otherwise swallow
      // `assets/:file` and `api/:resource/state`.
      controllers: [PanelAssetsController, PanelStateController, PanelPageController],
      providers: [
        { provide: PANEL_ASSETS, useValue: assets },
        { provide: PANEL_RESOURCE_TYPES, useValue: options.resources ?? [] },
        ...(options.resources ?? []),
        ResourceRegistry,
      ],
      exports: [ResourceRegistry],
    };
  }
}

/** `/admin`, `admin` and `/admin/` all mean the same place. */
function normalise(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}
