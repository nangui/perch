/**
 * `GET {path}/:resource/create` — the create page.
 *
 * The panel root is taken from the request rather than from configuration: the
 * host may add a global prefix and a version segment, and neither is visible to
 * a controller. Stripping the suffix this route serves off the URL that reached
 * it gives the only root that is right in every case.
 */
import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Req,
} from "@nestjs/common";
import { resolveSchema, serialise } from "@perchjs/core";
import type { PanelAssets } from "./panel-assets.js";
import { PANEL_ASSETS } from "./panel-assets.js";
import { renderShell } from "./panel-shell.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

/** Both platforms Nest supports name it, and neither shares a type. */
interface IncomingUrl {
  readonly originalUrl?: string;
  readonly url?: string;
}

@Controller()
export class PanelPageController {
  readonly #registry: ResourceRegistry;
  readonly #assets: PanelAssets;
  readonly #users: UserResolver;

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_ASSETS) assets: PanelAssets,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
  ) {
    this.#registry = registry;
    this.#assets = assets;
    this.#users = users;
  }

  @Get(":resource/create")
  @Header("content-type", "text/html; charset=utf-8")
  // The shell embeds one record's state; a shared cache would serve it to the
  // next visitor.
  @Header("cache-control", "no-store")
  async create(
    @Param("resource") slug: string,
    @Req() request: IncomingUrl,
  ): Promise<string> {
    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    const root = rootOf(request, `${slug}/create`);
    const resolved = await resolveSchema(
      resource.instance.form(),
      {},
      { operation: "create", user: this.#users.resolve(request) },
    );

    return renderShell({
      root,
      api: `${root}/api/${slug}`,
      title: `New ${resource.metadata.label}`,
      payload: serialise(resolved),
      scriptFile: entry(this.#assets, "panel.js"),
      styleFile: entry(this.#assets, "panel.css"),
    });
  }
}

function entry(assets: PanelAssets, name: string): string {
  const file = assets.entries[name];
  // The manifest reader already requires both; this is what stops a rename
  // reaching a browser as a broken tag.
  if (file === undefined) throw new Error(`the asset manifest names no "${name}".`);
  return file;
}

/**
 * The URL is decoded first: a request for `/%70eople/create` routes here with a
 * slug of `people`, and matching against the raw form would miss. Not finding
 * the suffix at all leaves no root that is right, so it fails rather than
 * serving a page whose every link points at the wrong place.
 */
function rootOf(request: IncomingUrl, suffix: string): string {
  const raw = (request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
  const end = decodePath(raw).replace(/\/+$/, "");
  const cut = end.lastIndexOf(`/${suffix}`);
  if (cut === -1) throw new NotFoundException();
  return end.slice(0, cut);
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
