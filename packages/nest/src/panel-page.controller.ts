/**
 * The panel's HTML pages: `GET {path}/:resource`, `/:resource/create` and
 * `/:resource/:id/edit`.
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
  Query,
  Req,
} from "@nestjs/common";
import type { DataAdapter, FormState, Row } from "@perchjs/core";
import { buildNavigation, PANEL_NAVIGATION_GROUPS } from "./navigation.js";
import { listRecords, resourcePath } from "./records.js";
import { resolveSchema, serialise } from "@perchjs/core";
import { withOptions } from "./relationship-options.js";
import type { PanelAssets } from "./panel-assets.js";
import { PANEL_ASSETS } from "./panel-assets.js";
import { renderShell } from "./panel-shell.js";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { IncomingUrl } from "./panel-root.js";
import { rootOf } from "./panel-root.js";
import { recordId } from "./record-id.js";
import type { RawQuery } from "./records-query.js";
import type { RegisteredResource } from "./resource-registry.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

@Controller()
export class PanelPageController {
  readonly #registry: ResourceRegistry;
  readonly #assets: PanelAssets;
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  readonly #groups: readonly string[];

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_ASSETS) assets: PanelAssets,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_NAVIGATION_GROUPS) groups: readonly string[],
  ) {
    this.#groups = groups;
    this.#registry = registry;
    this.#assets = assets;
    this.#users = users;
    this.#data = data;
  }

  /**
   * Registered after the two-segment routes, though Express would not confuse
   * them: `:resource` alone cannot match `posts/create`.
   *
   * The first page of records is embedded rather than fetched. The form pages
   * embed their resolved tree for the same reason — a panel that renders empty
   * and then fills in has a visible seam, and one round trip is one round trip.
   */
  @Get(":resource")
  @Header("content-type", "text/html; charset=utf-8")
  @Header("cache-control", "no-store")
  async list(
    @Param("resource") slug: string,
    @Query() query: RawQuery,
    @Req() request: IncomingUrl,
  ): Promise<string> {
    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    const root = rootOf(request, slug);
    const records = await listRecords(
      this.#data,
      resource,
      query,
      this.#users.resolve(request),
      root,
    );

    return renderShell({
      root,
      api: `${root}/api/${resource.metadata.slug}`,
      title: resource.metadata.pluralLabel,
      operation: "list",
      payload: records,
      navigation: await this.#navigation(request, root, slug),
      scriptFile: entry(this.#assets, "panel.js"),
      styleFile: entry(this.#assets, "panel.css"),
    });
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

    const user = this.#users.resolve(request);
    if ((await authorize(resource.instance.can, "create", user)) !== "allowed") {
      throw new NotFoundException();
    }

    return await this.#render({
      resource,
      request,
      suffix: `${slug}/create`,
      operation: "create",
      title: `New ${resource.metadata.label}`,
      state: {},
    });
  }

  @Get(":resource/:id/edit")
  @Header("content-type", "text/html; charset=utf-8")
  @Header("cache-control", "no-store")
  async edit(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Req() request: IncomingUrl,
  ): Promise<string> {
    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();
    if (this.#data === null) throw new NotFoundException();

    const model = resource.metadata.model;
    const key = recordId(this.#data, model, id);
    if (key === null) throw new NotFoundException();

    const record = await this.#data.findOne(model, key);
    if (record === null) throw new NotFoundException();

    const user = this.#users.resolve(request);
    if ((await authorize(resource.instance.can, "edit", user, record)) !== "allowed") {
      throw new NotFoundException();
    }

    return await this.#render({
      resource,
      request,
      suffix: `${slug}/${id}/edit`,
      operation: "edit",
      id,
      title: `Edit ${resource.metadata.label}`,
      // The whole row. `serialise` keeps only the paths the tree makes visible,
      // so a column the form does not carry never reaches the browser.
      state: record,
      record,
    });
  }

  /** Rebuilt per request: two users see two different panels. */
  async #navigation(
    request: IncomingUrl,
    root: string,
    currentSlug: string,
  ): Promise<unknown> {
    return await buildNavigation(
      this.#registry.all(),
      this.#users.resolve(request),
      root,
      this.#groups,
      currentSlug,
    );
  }

  async #render(page: {
    resource: RegisteredResource;
    request: IncomingUrl;
    suffix: string;
    operation: "create" | "edit";
    id?: string;
    title: string;
    state: FormState;
    record?: Row;
  }): Promise<string> {
    const root = rootOf(page.request, page.suffix);
    const resolved = await resolveSchema(page.resource.instance.form(), page.state, {
      operation: page.operation,
      user: this.#users.resolve(page.request),
      ...(page.record === undefined ? {} : { record: page.record }),
      ...withOptions(this.#data, page.resource.metadata.model),
    });

    // The same guard, and the same function, the row actions go through.
    const list = resourcePath(root, page.resource.metadata.slug);
    const navigation = await this.#navigation(
      page.request,
      root,
      page.resource.metadata.slug,
    );

    return renderShell({
      navigation,
      root,
      api: `${root}/api/${page.resource.metadata.slug}`,
      title: page.title,
      operation: page.operation,
      ...(list === undefined
        ? {}
        : { listPath: list, listLabel: page.resource.metadata.pluralLabel }),
      ...(page.id === undefined ? {} : { id: page.id }),
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
