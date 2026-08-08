/**
 * Routing, the configured prefix and `setGlobalPrefix` are Nest's job and need an
 * HTTP test — `@nestjs/testing` and a platform adapter are not installed. What is
 * below is the controller itself.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { PanelAssetsController } from "./panel-assets.controller.js";
import type { PanelAssets } from "./panel-assets.js";

const JS = "panel-abc12345.js";
const CSS = "panel-def67890.css";

let assets: PanelAssets;
let controller: PanelAssetsController;

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), "perch-assets-"));
  writeFileSync(join(directory, JS), "export const panel = 1;\n");
  writeFileSync(join(directory, CSS), ".perch-root { color: red }\n");
  // Exists, and no entry names it.
  writeFileSync(join(directory, "secret.js"), "const key = 1;\n");

  assets = { directory, entries: { "panel.js": JS, "panel.css": CSS } };
  controller = new PanelAssetsController(assets);
});

describe("serving what the manifest names", () => {
  it("returns the script with a JavaScript content type", () => {
    const file = controller.read(JS);

    expect(file.options.type).toBe("text/javascript; charset=utf-8");
    expect(Buffer.from(file.getStream().read() as Uint8Array).toString()).toContain(
      "export const panel",
    );
  });

  it("returns the stylesheet with a CSS content type", () => {
    expect(controller.read(CSS).options.type).toBe("text/css; charset=utf-8");
  });
});

describe("refusing everything else", () => {
  it.each([
    ["a file that exists but is not named", "secret.js"],
    ["a logical name rather than the hashed one", "panel.js"],
    ["a traversal", "../../../etc/passwd"],
    ["an absolute path", "/etc/passwd"],
    ["an empty segment", ""],
    ["the directory itself", "."],
    ["a name that only differs by case", JS.toUpperCase()],
  ])("refuses %s", (_, file) => {
    expect(() => controller.read(file)).toThrow(NotFoundException);
  });

  it("refuses a named entry whose extension it cannot type", () => {
    // Fires when a future entry type arrives with no content type decided.
    writeFileSync(join(assets.directory, "panel-x.wasm"), "\0asm");
    const odd = new PanelAssetsController({
      directory: assets.directory,
      entries: { "panel.js": JS, "panel.css": CSS, "panel.wasm": "panel-x.wasm" },
    });

    expect(() => odd.read("panel-x.wasm")).toThrow(NotFoundException);
  });
});

describe("reading from disk", () => {
  it("does not touch the filesystem to answer a request", () => {
    // Deleting the directory: a handler that still read would fail here.
    rmSync(assets.directory, { recursive: true, force: true });

    expect(controller.read(JS).options.type).toBe("text/javascript; charset=utf-8");
  });

  it("fails at construction when a named file cannot be read", () => {
    expect(
      () =>
        new PanelAssetsController({
          directory: assets.directory,
          entries: { "panel.js": "panel-missing.js", "panel.css": CSS },
        }),
    ).toThrow();
  });
});
