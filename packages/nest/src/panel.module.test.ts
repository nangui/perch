/**
 * What `forRoot` puts together, read off the description it returns. Whether
 * those routes land where they should, under `setGlobalPrefix` too, is
 * acceptance criterion 5 of PRD 04 and needs an HTTP test.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

describe("PanelModule.forRoot", () => {
  it("registers the assets controller under the configured path", () => {
    const module = PanelModule.forRoot({ path: "/admin", assets: assets() });

    expect(module.controllers).toContain(PanelAssetsController);
    expect(module.controllers).toContain(PanelStateController);
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
    // PRD 04 §3: resolved at bootstrap, so a bad manifest stops the boot.
    const given = assets();
    const module = PanelModule.forRoot({ path: "/admin", assets: given });
    const provider = module.providers?.find(
      (p) => (p as { provide?: unknown }).provide === PANEL_ASSETS,
    );

    expect((provider as { useValue?: unknown }).useValue).toBe(given);
  });
});
