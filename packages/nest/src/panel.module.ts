/**
 * `PanelModule` — PRD 04. The asset half of §4 today; the protocol routes and
 * the shell arrive with the resources that fill them (PRD 05).
 *
 * The prefix goes through `RouterModule` because `@Controller` fixes its path at
 * declaration while `path` is configuration — and it leaves `setGlobalPrefix`
 * and versioning to Nest.
 */
import type { DynamicModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { RouterModule } from "@nestjs/core";
import { PanelAssetsController } from "./panel-assets.controller.js";
import type { PanelAssets } from "./panel-assets.js";
import { loadPanelAssets, PANEL_ASSETS } from "./panel-assets.js";

export interface PanelModuleOptions {
  /** Where the panel lives, e.g. `/admin`. PRD 04 §2. */
  readonly path: string;
  /** Resolved from `@perchjs/ui` when absent; passing it is for tests. */
  readonly assets?: PanelAssets;
}

@Module({})
export class PanelModule {
  /** Assets resolve once (PRD 04 §3), so a bad manifest stops the boot. */
  static forRoot(options: PanelModuleOptions): DynamicModule {
    const assets = options.assets ?? loadPanelAssets();

    return {
      module: PanelModule,
      imports: [
        RouterModule.register([{ path: normalise(options.path), module: PanelModule }]),
      ],
      controllers: [PanelAssetsController],
      providers: [{ provide: PANEL_ASSETS, useValue: assets }],
    };
  }
}

/** `/admin`, `admin` and `/admin/` all mean the same place. */
function normalise(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}
