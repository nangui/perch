/**
 * What `forRoot` puts together, read off the description it returns. Whether
 * those routes land where they should, under `setGlobalPrefix` too, needs an
 * HTTP test.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DynamicModule, Type } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PanelAssetsController } from "./panel-assets.controller.js";
import { PanelStateController } from "./panel-state.controller.js";
import type { PanelAssets } from "./panel-assets.js";
import { PANEL_ASSETS } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-module-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

/** The paths RouterModule was told to mount the module under. */
function routedPaths(module: ReturnType<typeof PanelModule.forRoot>): string[] {
  return (module.imports ?? []).flatMap((imported) => {
    const providers =
      (imported as { providers?: { useValue?: unknown }[] }).providers ?? [];
    return providers.flatMap((p) =>
      Array.isArray(p.useValue)
        ? (p.useValue as { path: string }[]).map((r) => r.path)
        : [],
    );
  });
}

/** Whether a controller, or a subclass standing in for it, is on the module. */
function mounts(module: DynamicModule, controller: Type<object>): boolean {
  return (module.controllers ?? []).some(
    (mounted) =>
      mounted === controller || Object.getPrototypeOf(mounted) === controller,
  );
}

describe("PanelModule.forRoot", () => {
  it("registers the assets controller under the configured path", () => {
    const module = PanelModule.forRoot({ path: "/admin", assets: assets() });

    // By descent rather than by identity: every controller is subclassed so the
    // panel's own guard can be put on it without leaving it on the class for
    // the next `forRoot`. The subclass keeps the name and the prototype, which
    // is what says it is the controller asked for rather than one like it.
    expect(mounts(module, PanelAssetsController)).toBe(true);
    expect(mounts(module, PanelStateController)).toBe(true);
    expect(routedPaths(module)).toEqual(["admin"]);
  });

  it.each(["/admin", "admin", "/admin/", "//admin//"])(
    "reads %s as the same place",
    (path) => {
      expect(routedPaths(PanelModule.forRoot({ path, assets: assets() }))).toEqual([
        "admin",
      ]);
    },
  );

  it("mounts at the root when given one", () => {
    expect(routedPaths(PanelModule.forRoot({ path: "/", assets: assets() }))).toEqual([
      "",
    ]);
  });

  it("resolves the assets once, at bootstrap", () => {
    // Resolved at bootstrap, so a bad manifest stops the boot.
    const given = assets();
    const module = PanelModule.forRoot({ path: "/admin", assets: given });
    const provider = module.providers?.find(
      (p) => (p as { provide?: unknown }).provide === PANEL_ASSETS,
    );

    expect((provider as { useValue?: unknown }).useValue).toBe(given);
  });
});
