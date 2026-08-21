/**
 * Serves the browser half of a field the framework does not ship.
 *
 * The panel puts the address in a `<script>` tag and nothing else: who answers
 * there is the application's business, which is why this file is here and not
 * in `@perchjs/nest`. A panel that also served it would be a second static file
 * server with a second set of rules about what may be read from disk.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Controller, Get, Header } from "@nestjs/common";

const HERE = dirname(fileURLToPath(import.meta.url));

@Controller("plugin")
export class PluginController {
  @Get("stars.js")
  @Header("content-type", "text/javascript; charset=utf-8")
  @Header("cache-control", "no-store")
  stars(): string {
    // Read per request, so editing it and reloading shows the change. A real
    // deployment serves a built file with a hash in its name and caches it.
    return readFileSync(join(HERE, "..", "public", "stars.js"), "utf8");
  }
}
