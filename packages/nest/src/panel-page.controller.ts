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
import type {
  DataAdapter,
  EntryRelation,
  FormState,
  IncludePlan,
  Ir,
  ModelMeta,
  ResolveOptions,
  Row,
  Schema,
} from "@perchjs/core";
import { buildNavigation, PANEL_NAVIGATION_GROUPS } from "./navigation.js";
import { listRecords, resourcePath } from "./records.js";
import {
  buildIncludePlan,
  entryPaths,
  entryRelations,
  findModel,
  resolveSchema,
  serialise,
} from "@perchjs/core";
import { fileUrls } from "./file-urls.js";
import { withOptions } from "./relationship-options.js";
import type { PanelAssets } from "./panel-assets.js";
import { PANEL_ASSETS, PANEL_SCRIPTS } from "./panel-assets.js";
import { renderShell } from "./panel-shell.js";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import type { IncomingUrl } from "./panel-root.js";
import { rootOf } from "./panel-root.js";
import { recordId } from "./record-id.js";
import type { ManagedRelation } from "./relation-records.js";
import { managedRelations } from "./relation-records.js";
import type { RawQuery } from "./records-query.js";
import type { RegisteredResource } from "./resource-registry.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

@Controller()
export class PanelPageController {
  readonly #registry: ResourceRegistry;
  readonly #assets: PanelAssets;
  readonly #scripts: readonly string[];
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  readonly #groups: readonly string[];
  readonly #urls: Pick<ResolveOptions, "fileUrl">;

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_ASSETS) assets: PanelAssets,
    @Inject(PANEL_SCRIPTS) scripts: readonly string[],
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_NAVIGATION_GROUPS) groups: readonly string[],
    @Inject(PANEL_STORAGE) disks: PanelDisks,
  ) {
    this.#groups = groups;
    this.#registry = registry;
    this.#assets = assets;
    this.#scripts = scripts;
    this.#users = users;
    this.#data = data;
    this.#urls = fileUrls(disks);
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
      ...(this.#scripts.length === 0 ? {} : { scripts: this.#scripts }),
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
      schema: this.#registry.formFor(resource),
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
      schema: this.#registry.formFor(resource),
      request,
      suffix: `${slug}/${id}/edit`,
      operation: "edit",
      id,
      title: `Edit ${resource.metadata.label}`,
      // Only on an edit: a manager is scoped by the parent's key, and a record
      // that has not been written has none to scope by.
      relations: managedRelations(resource.instance.relations?.() ?? []),
      // The whole row. `serialise` keeps only the paths the tree makes visible,
      // so a column the form does not carry never reaches the browser.
      state: record,
      record,
    });
  }

  /**
   * `GET {path}/:resource/:id` — the record, read-only.
   *
   * Declared after `:resource/create` and `:resource/:id/edit`, both of which
   * this would otherwise swallow: `create` is not an id and `edit` is not one
   * either.
   *
   * The relations the entries name are loaded with the row, in its own query,
   * so the page costs what a page costs and not what a page times its relations
   * costs.
   */
  @Get(":resource/:id")
  @Header("content-type", "text/html; charset=utf-8")
  @Header("cache-control", "no-store")
  async view(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Req() request: IncomingUrl,
  ): Promise<string> {
    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();
    if (this.#data === null) throw new NotFoundException();

    // No infolist, no View page. Answered like a resource that does not exist,
    // because that is what it is from outside.
    const infolist = this.#registry.infolistFor(resource);
    if (infolist === undefined) throw new NotFoundException();

    const model = resource.metadata.model;
    const key = recordId(this.#data, model, id);
    if (key === null) throw new NotFoundException();

    const plan = includeFor(this.#data.ir(), model, infolist);
    const record = await this.#data.findOne(model, key, plan);
    if (record === null) throw new NotFoundException();

    // After the row, never before it: the policy is asked about a record, and
    // asking it without one would be authorising at render time.
    const user = this.#users.resolve(request);
    if ((await authorize(resource.instance.can, "view", user, record)) !== "allowed") {
      throw new NotFoundException();
    }

    return await this.#render({
      resource,
      schema: infolist,
      request,
      suffix: `${slug}/${id}`,
      operation: "view",
      id,
      // What a reader calls the row, where the model says which column that is.
      // `Post 1` names the URL back at them; the label names the thing.
      title:
        titleOf(this.#data.meta(model), record) ?? `${resource.metadata.label} ${id}`,
      // Nothing: an entry reads the record, and the state map is what a client
      // may write to.
      state: {},
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
    /** The tree this page draws: a form, or the infolist a View page reads. */
    schema: Schema;
    request: IncomingUrl;
    suffix: string;
    operation: "create" | "edit" | "view";
    id?: string;
    title: string;
    state: FormState;
    record?: Row;
    relations?: readonly ManagedRelation[];
  }): Promise<string> {
    const root = rootOf(page.request, page.suffix);
    const resolved = await resolveSchema(page.schema, page.state, {
      operation: page.operation,
      user: this.#users.resolve(page.request),
      ...(page.record === undefined ? {} : { record: page.record }),
      ...withOptions(this.#data, page.resource.metadata.model),
      ...this.#urls,
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
      ...(page.relations === undefined || page.relations.length === 0
        ? {}
        : { relations: page.relations }),
      payload: serialise(resolved),
      scriptFile: entry(this.#assets, "panel.js"),
      ...(this.#scripts.length === 0 ? {} : { scripts: this.#scripts }),
      styleFile: entry(this.#assets, "panel.css"),
    });
  }
}

/** The row's own label, where it has one that is text. */
function titleOf(meta: ModelMeta, record: Row): string | undefined {
  const label = record[meta.labelField];
  return typeof label === "string" && label !== "" ? label : undefined;
}

/**
 * The relations an infolist names, as one plan.
 *
 * Refuses to throw, like the table's own plan does: a path that does not
 * resolve stops the boot, so a running panel never reaches here with one, and
 * taking a page down over it would be out of proportion to what a plan is for.
 */
function includeFor(ir: Ir, model: string, infolist: Schema): IncludePlan | undefined {
  try {
    const plan = planFor(ir, model, infolist);
    // Nothing to load is no plan, not an empty one: the adapter is asked for the
    // row and nothing else.
    return Object.keys(plan).length === 0 ? undefined : plan;
  } catch {
    return undefined;
  }
}

/**
 * One level of the plan, and the levels its rows hold.
 *
 * A to-many is asked for by name. It cannot be part of a path — one note is not
 * one column of the person — so the plan builder never sees it, and the paths
 * its rows read are resolved against the note's own model.
 */
function planFor(ir: Ir, model: string, schema: Schema): IncludePlan {
  const plan: Record<string, true | IncludePlan> = {
    ...buildIncludePlan(ir, model, entryPaths(schema)),
  };
  for (const relation of entryRelations(schema)) {
    plan[relation.relation] = branchFor(ir, model, relation);
  }
  return plan;
}

/**
 * One relation: what its rows read, and what their own rows read.
 *
 * `true` where there is nothing under it, which is what the plan means by "load
 * this and nothing further".
 */
function branchFor(ir: Ir, model: string, entry: EntryRelation): true | IncludePlan {
  const target = relationTarget(ir, model, entry.relation);
  if (target === undefined) return true;

  const inner: Record<string, true | IncludePlan> = {
    ...buildIncludePlan(ir, target, entry.paths),
  };
  for (const nested of entry.relations) {
    inner[nested.relation] = branchFor(ir, target, nested);
  }
  return Object.keys(inner).length === 0 ? true : inner;
}

/** Which model a relation leads to, or nothing where it is not one. */
function relationTarget(ir: Ir, model: string, relation: string): string | undefined {
  return findModel(ir, model)?.relations.find((one) => one.name === relation)
    ?.targetModel;
}

function entry(assets: PanelAssets, name: string): string {
  const file = assets.entries[name];
  // The manifest reader already requires both; this is what stops a rename
  // reaching a browser as a broken tag.
  if (file === undefined) throw new Error(`the asset manifest names no "${name}".`);
  return file;
}
