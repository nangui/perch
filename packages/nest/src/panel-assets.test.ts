/**
 * Every case below is a way for the two packages to disagree about the
 * manifest, and the point of each is that it surfaces at startup.
 *
 * Fixtures only, so this needs nothing built; the real specifier is
 * `tooling/panel-assets.test.ts`.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadPanelAssets, SUPPORTED_MANIFEST_VERSION } from "./panel-assets.js";

/** Writes a manifest, plus whichever files it should find beside it. */
function fixture(manifest: unknown, files: readonly string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), "perch-manifest-"));
  const path = join(dir, "manifest.json");
  writeFileSync(
    path,
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  for (const file of files) writeFileSync(join(dir, file), "");
  return path;
}

const valid = {
  manifestVersion: SUPPORTED_MANIFEST_VERSION,
  entries: { "panel.js": "panel-abc12345.js", "panel.css": "panel-def67890.css" },
};

describe("reading the asset manifest", () => {
  it("returns the directory and the entries", () => {
    const path = fixture(valid, ["panel-abc12345.js", "panel-def67890.css"]);
    const assets = loadPanelAssets(path);

    expect(assets.entries).toEqual(valid.entries);
    expect(assets.directory).toBe(dirname(path));
  });
});

describe("refusing to start", () => {
  it("rejects a manifest version it does not know", () => {
    const path = fixture({ ...valid, manifestVersion: 99 });

    expect(() => loadPanelAssets(path)).toThrow(/ships asset manifest version 99/);
  });

  it("rejects a manifest with no version at all", () => {
    const path = fixture({ entries: valid.entries });

    expect(() => loadPanelAssets(path)).toThrow(/version undefined/);
  });

  it("rejects an entry whose file is missing", () => {
    // The build guards this too; they are versioned together, installed apart.
    const path = fixture(valid, ["panel-abc12345.js"]);

    expect(() => loadPanelAssets(path)).toThrow(/panel-def67890\.css/);
  });

  it("rejects a manifest that is not JSON", () => {
    expect(() => loadPanelAssets(fixture("{ not json"))).toThrow(/not valid JSON/);
  });

  it("rejects a manifest that is not an object", () => {
    expect(() => loadPanelAssets(fixture("[]"))).toThrow(/not an object/);
  });

  it("rejects a manifest with no entries", () => {
    expect(() =>
      loadPanelAssets(fixture({ manifestVersion: SUPPORTED_MANIFEST_VERSION })),
    ).toThrow(/no entries/);
  });

  it("rejects an entries object that names nothing", () => {
    // Otherwise the panel starts and serves nothing.
    expect(() =>
      loadPanelAssets(
        fixture({ manifestVersion: SUPPORTED_MANIFEST_VERSION, entries: {} }),
      ),
    ).toThrow(/names no "panel\.js"/);
  });

  it("rejects an entries array, which is an object to typeof", () => {
    expect(() =>
      loadPanelAssets(
        fixture({ manifestVersion: SUPPORTED_MANIFEST_VERSION, entries: [] }),
      ),
    ).toThrow(/no entries/);
  });

  it("rejects an entry that names the directory itself", () => {
    // "." passes every shape check and then exists, because it is the directory.
    const path = fixture({ ...valid, entries: { ...valid.entries, "panel.js": "." } });

    expect(() => loadPanelAssets(path)).toThrow(/is not a file in/);
  });

  it("rejects an entry that is not a filename", () => {
    const path = fixture({
      manifestVersion: SUPPORTED_MANIFEST_VERSION,
      entries: { "panel.js": 42 },
    });

    expect(() => loadPanelAssets(path)).toThrow(/not a filename/);
  });
});

describe("an entry may not describe a path", () => {
  // PanelModule joins these onto a directory it serves, so a separator or a
  // climb is refused where it is read rather than where it is used.
  it.each(["../secret.js", "nested/panel.js", "..\\windows.js", ".."])(
    "rejects %s",
    (file) => {
      const path = fixture({
        manifestVersion: SUPPORTED_MANIFEST_VERSION,
        entries: { "panel.js": file },
      });

      expect(() => loadPanelAssets(path)).toThrow(/a path, not a filename/);
    },
  );
});
