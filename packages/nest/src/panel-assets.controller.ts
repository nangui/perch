/**
 * `GET {path}/assets/:file`.
 *
 * The manifest is the allowlist, not a lookup table: only a name it carries is
 * served, so there is no path to traverse. `StreamableFile` rather than
 * `res.sendFile` keeps the package free of `@nestjs/platform-express`, which a
 * Fastify adapter would need gone later.
 */
import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  StreamableFile,
} from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PanelAssets } from "./panel-assets.js";
import { PANEL_ASSETS } from "./panel-assets.js";

/** Safe only because the names are content-hashed. */
const IMMUTABLE = "public, max-age=31536000, immutable";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

interface Asset {
  readonly bytes: Buffer;
  readonly type: string;
}

@Controller("assets")
export class PanelAssetsController {
  readonly #assets: ReadonlyMap<string, Asset>;

  /** Read once, at bootstrap, so the handler stays free of I/O. */
  constructor(@Inject(PANEL_ASSETS) assets: PanelAssets) {
    const loaded = new Map<string, Asset>();
    // The named entries and the chunks alike: the browser asks for a chunk by
    // the name the entry imports it under, which is a filename and not a
    // logical name. Left out, a form with a rich editor on it fetches a 404.
    for (const file of [...Object.values(assets.entries), ...assets.chunks]) {
      const type = CONTENT_TYPES[extensionOf(file)];
      // Serving bytes under the wrong type is how a stylesheet becomes a script.
      if (type === undefined) continue;
      loaded.set(file, { bytes: readFileSync(join(assets.directory, file)), type });
    }
    this.#assets = loaded;
  }

  @Get(":file")
  @Header("Cache-Control", IMMUTABLE)
  read(@Param("file") file: string): StreamableFile {
    const asset = this.#assets.get(file);
    if (asset === undefined) throw new NotFoundException();

    return new StreamableFile(asset.bytes, { type: asset.type });
  }
}

function extensionOf(file: string): string {
  const dot = file.lastIndexOf(".");
  return dot === -1 ? "" : file.slice(dot);
}
