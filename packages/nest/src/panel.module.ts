/**
 * The panel's entry point. Serves the assets today; the protocol routes and the
 * HTML shell arrive with the resources that fill them.
 *
 * The prefix goes through `RouterModule` because `@Controller` fixes its path at
 * declaration while `path` is configuration — and it leaves `setGlobalPrefix`
 * and versioning to Nest.
 */
import type { CanActivate, DynamicModule, Type } from "@nestjs/common";
import type { DataAdapter } from "@perchjs/core";
import { Module, UseGuards } from "@nestjs/common";
import { RouterModule } from "@nestjs/core";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import { PanelUploadSweep } from "./upload-sweep.js";
import type { RedirectAfterCreate } from "./redirect.js";
import { PANEL_REDIRECT_AFTER_CREATE } from "./redirect.js";
import { PanelActionController } from "./panel-action.controller.js";
import { PanelAssetsController } from "./panel-assets.controller.js";
import { PanelOptionsController } from "./panel-options.controller.js";
import { PanelUploadController } from "./panel-upload.controller.js";
import { PanelPageController } from "./panel-page.controller.js";
import { PanelRecordsController } from "./panel-records.controller.js";
import { PanelSaveController } from "./panel-save.controller.js";
import { PanelStateController } from "./panel-state.controller.js";
import type { PanelAssets } from "./panel-assets.js";
import { loadPanelAssets, PANEL_ASSETS } from "./panel-assets.js";
import { PANEL_NAVIGATION_GROUPS } from "./navigation.js";
import type { ResourceClass } from "./resource-registry.js";
import { PANEL_RESOURCE_TYPES, ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER, RequestUserResolver } from "./user-resolver.js";

export interface PanelModuleOptions {
  /** Where the panel lives, e.g. `/admin`. */
  readonly path: string;
  /**
   * The order navigation groups appear in. A group a resource names and this
   * does not still appears, after these and alphabetically — an order nobody
   * stated should at least be stable.
   */
  readonly navigationGroups?: readonly string[];
  /** Registered explicitly; discovery by folder scan comes later. */
  readonly resources?: readonly ResourceClass[];
  /**
   * The disks a `FileUpload` may name, by the names it names them by.
   *
   * A record rather than one adapter, because a panel may keep avatars on one
   * store and invoices on another. Absent is fine until a form asks for one,
   * and then the audit says so at boot.
   */
  readonly disks?: PanelDisks;
  /**
   * Modules whose providers the resources inject. Resources are instantiated
   * here, so their dependencies have to be visible here.
   */
  readonly imports?: NonNullable<DynamicModule["imports"]>;
  /**
   * Applied to every panel route — the page, the assets and the API. Perch
   * provides no authentication of its own; these are the host's own Nest
   * guards, and they are what stands between the panel and the internet.
   */
  readonly guards?: readonly Type<CanActivate>[];
  /**
   * Turns the request the guards let through into the `user` a resolver reads.
   * Defaults to `request.user`, which is where Passport and most Nest guards
   * leave it. Built by the container, so it may inject.
   */
  readonly userResolver?: Type<UserResolver>;
  /**
   * Where records come from. Without one the panel serves create forms and
   * nothing else: an edit has no record to authorise against, and a save has
   * nowhere to go.
   */
  readonly dataAdapter?: Type<DataAdapter>;
  /**
   * Where a create lands. `index` and `view` are named by the design and have
   * no route yet, so `edit` is what there is; `none` stays put.
   */
  readonly redirectAfterCreate?: RedirectAfterCreate;
  /** Resolved from `@perchjs/ui` when absent; passing it is for tests. */
  readonly assets?: PanelAssets;
}

@Module({})
export class PanelModule {
  /** Assets resolve once, so a bad manifest stops the boot rather than a request. */
  static forRoot(options: PanelModuleOptions): DynamicModule {
    const assets = options.assets ?? loadPanelAssets();
    const guards = options.guards ?? [];

    return {
      module: PanelModule,
      imports: [
        ...(options.imports ?? []),
        RouterModule.register([{ path: normalise(options.path), module: PanelModule }]),
      ],
      // The page route is last: its `:resource/create` would otherwise swallow
      // `assets/:file` and `api/:resource/state`.
      controllers: [
        guarded(PanelAssetsController, guards),
        guarded(PanelActionController, guards),
        guarded(PanelStateController, guards),
        guarded(PanelOptionsController, guards),
        guarded(PanelUploadController, guards),
        guarded(PanelRecordsController, guards),
        guarded(PanelSaveController, guards),
        guarded(PanelPageController, guards),
      ],
      providers: [
        { provide: PANEL_ASSETS, useValue: assets },
        { provide: PANEL_NAVIGATION_GROUPS, useValue: options.navigationGroups ?? [] },
        { provide: PANEL_RESOURCE_TYPES, useValue: options.resources ?? [] },
        {
          provide: PANEL_USER_RESOLVER,
          useClass: options.userResolver ?? RequestUserResolver,
        },
        options.dataAdapter === undefined
          ? { provide: PANEL_DATA_ADAPTER, useValue: null }
          : { provide: PANEL_DATA_ADAPTER, useClass: options.dataAdapter },
        {
          // Empty is legitimate: a panel with no `FileUpload` needs no disk,
          // and the audit is what stops a form naming one that is not there.
          provide: PANEL_STORAGE,
          useValue: options.disks ?? {},
        },
        {
          provide: PANEL_REDIRECT_AFTER_CREATE,
          useValue: options.redirectAfterCreate ?? "edit",
        },
        ...(options.resources ?? []),
        ...guards,
        ResourceRegistry,
        PanelUploadSweep,
      ],
      // The sweep is exported because the host is the one that schedules it:
      // a panel does not get to start a timer in a process it does not own.
      exports: [ResourceRegistry, PanelUploadSweep],
    };
  }
}

/**
 * Guards go on a subclass rather than on the controller itself. The controller
 * classes are module-level singletons: decorating them would leave the guards
 * behind for the next `forRoot`, so a second panel — or the next test — would
 * inherit whatever the first one asked for.
 */
function guarded<T extends Type<object>>(
  controller: T,
  guards: readonly Type<CanActivate>[],
): T {
  if (guards.length === 0) return controller;

  const scoped = class extends controller {};
  Object.defineProperty(scoped, "name", { value: controller.name });
  UseGuards(...guards)(scoped);
  return scoped;
}

/** `/admin`, `admin` and `/admin/` all mean the same place. */
function normalise(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}
