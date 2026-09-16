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
  Redirect,
  Req,
} from "@nestjs/common";
import type {
  DataAdapter,
  FormState,
  ModelMeta,
  ResolveOptions,
  Row,
  Schema,
} from "@perchjs/core";
import { buildNavigation, PANEL_NAVIGATION_GROUPS } from "./navigation.js";
import { buildUserMenu, PANEL_USER_MENU } from "./user-menu.js";
import { CustomPageRegistry } from "./custom-page-registry.js";
import { mayReach } from "./authorization.js";
import { resourcePageMetadata } from "./resource-page.js";
import type { UserMenu } from "./user-menu.js";
import { listRecords, resourcePath } from "./records.js";
import { resolveSchema, serialise } from "@perchjs/core";
import { includeFor } from "./infolist-plan.js";
import { fileUrls } from "./file-urls.js";
import { withOptions } from "./relationship-options.js";
import type { PanelAssets } from "./panel-assets.js";
import { PANEL_ASSETS, PANEL_SCRIPTS, PANEL_STYLES } from "./panel-assets.js";
import { renderShell } from "./panel-shell.js";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import type { IncomingUrl } from "./panel-root.js";
import { rootHere, rootOf } from "./panel-root.js";
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
  readonly #pages: CustomPageRegistry;
  readonly #assets: PanelAssets;
  readonly #scripts: readonly string[];
  readonly #styles: readonly string[];
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  readonly #groups: readonly string[];
  readonly #userMenu: UserMenu | undefined;
  readonly #urls: Pick<ResolveOptions, "fileUrl">;
  readonly #disks: PanelDisks;

  constructor(
    registry: ResourceRegistry,
    pages: CustomPageRegistry,
    @Inject(PANEL_ASSETS) assets: PanelAssets,
    @Inject(PANEL_SCRIPTS) scripts: readonly string[],
    @Inject(PANEL_STYLES) styles: readonly string[],
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_NAVIGATION_GROUPS) groups: readonly string[],
    @Inject(PANEL_USER_MENU) userMenu: UserMenu | undefined,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
  ) {
    this.#groups = groups;
    this.#userMenu = userMenu;
    this.#registry = registry;
    this.#pages = pages;
    this.#assets = assets;
    this.#scripts = scripts;
    this.#styles = styles;
    this.#users = users;
    this.#data = data;
    this.#urls = fileUrls(disks);
    this.#disks = disks;
  }

  /**
   * The panel's own address, which until now answered nothing.
   *
   * Every other page route names a resource, so a reader who mounted a panel
   * at `/admin` and opened `/admin` met a 404 while the documentation told
   * them the panel was there. It is the address an application advertises and
   * the one somebody pastes into a message.
   *
   * A redirect rather than a page of its own. What a panel's front door should
   * show is a question with several defensible answers and no default, and the
   * one thing that is certainly right is that a reader wants to be looking at
   * something. So it sends them to the first thing the menu offers them.
   *
   * Theirs, not the first declared. The navigation is built per request and
   * filtered by what this reader may reach, so two readers can land in two
   * places and a reader who may reach nothing lands nowhere: 404, the same
   * answer every other refusal here gives, because a panel that says "there is
   * nothing here for you" has still said there is a panel.
   *
   * Never cached. The target depends on who asked, and a shared cache holding
   * one reader's would send the next one to a page they may not open.
   */
  @Get()
  @Header("cache-control", "no-store")
  @Redirect()
  async enter(
    @Req() request: IncomingUrl,
  ): Promise<{ url: string; statusCode: number }> {
    const root = rootHere(request);
    const groups = await buildNavigation(
      this.#registry.all(),
      this.#users.resolve(request),
      root,
      this.#groups,
      undefined,
      this.#pages.all(),
    );

    // Already an address of this origin, and not because it is trusted: the
    // navigation builds every entry through the same check the row actions go
    // through, and drops the ones that do not pass. Asking again here would be
    // the same question twice on the same value, which is how two answers come
    // to differ.
    const url = groups.flatMap((group) => group.items)[0]?.href;
    if (url === undefined) throw new NotFoundException();

    // Found, not moved: which page this is depends on the reader, so nothing
    // may remember it.
    return { url, statusCode: 302 };
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
    // Not a resource: a custom page may answer at this address instead. The
    // resource wins where both exist, and the boot refuses that arrangement,
    // so nothing is being chosen here that somebody did not already declare.
    if (resource === undefined) return await this.#page(slug, request);

    const root = rootOf(request, slug);
    const records = await listRecords(
      this.#data,
      resource,
      query,
      this.#users.resolve(request),
      root,
      this.#disks,
    );

    return renderShell({
      root,
      api: `${root}/api/${resource.metadata.slug}`,
      title: resource.metadata.pluralLabel,
      operation: "list",
      payload: records,
      navigation: await this.#navigation(request, root, slug),
      ...(await this.#user(request)),
      scriptFile: entry(this.#assets, "panel.js"),
      ...(this.#scripts.length === 0 ? {} : { scripts: this.#scripts }),
      ...(this.#styles.length === 0 ? {} : { styles: this.#styles }),
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
      relations: managedRelations(resource.instance.relations?.() ?? [], {
        ir: this.#data.ir(),
        model: resource.metadata.model,
      }),
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
    // `{ include: plan }`, not the plan itself. The third argument is
    // `ReadOptions`, and a plan handed over bare lands as an object with no
    // `include` on it — so every relation the infolist named went unloaded and
    // read as empty, which looks exactly like a record that has none.
    const record = await this.#data.findOne(model, key, {
      // Absent rather than present and empty: nothing to load is no plan, and
      // an adapter asked for `undefined` would be asked for something.
      ...(plan === undefined ? {} : { include: plan }),
    });
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

  /**
   * A page about one record, beside the ones the panel generates.
   *
   * Declared last of the record routes: `edit` is matched before this, so a
   * page can never take it. The row is loaded and the resource's `view` is
   * asked about it first — a page under a record is not a way around the
   * policy on that record.
   */
  @Get(":resource/:id/:page")
  @Header("content-type", "text/html; charset=utf-8")
  @Header("cache-control", "no-store")
  async recordPage(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("page") path: string,
    @Req() request: IncomingUrl,
  ): Promise<string> {
    const resource = this.#registry.get(slug);
    if (resource === undefined || this.#data === null) throw new NotFoundException();

    const declared = resource.metadata.pages.find(
      (type) => resourcePageMetadata(type)?.path === path,
    );
    if (declared === undefined) throw new NotFoundException();

    const key = recordId(this.#data, resource.metadata.model, id);
    if (key === null) throw new NotFoundException();
    const record = await this.#data.findOne(resource.metadata.model, key, {});
    if (record === null) throw new NotFoundException();

    const user = this.#users.resolve(request);
    if ((await authorize(resource.instance.can, "view", user, record)) !== "allowed") {
      throw new NotFoundException();
    }

    const page = this.#registry.pageInstance(declared);
    if (!(await mayReach(page.can, user))) throw new NotFoundException();

    const metadata = resourcePageMetadata(declared);
    const root = rootOf(request, `${slug}/${id}/${path}`);
    // The row itself unless the page says otherwise, which is what a form
    // does: fields named after columns show what those columns hold.
    const state = ((await page.state?.(record)) ?? record) as Record<string, unknown>;
    const resolved = await resolveSchema(page.schema(), state, {
      operation: "edit",
      user,
      record,
    });
    const list = resourcePath(root, slug);

    return renderShell({
      root,
      api: `${root}/api/${encodeURIComponent(slug)}/${encodeURIComponent(id)}/page/${encodeURIComponent(path)}`,
      title: metadata?.label ?? path,
      operation: "edit",
      payload: serialise(resolved),
      navigation: await this.#navigation(request, root, slug),
      ...(await this.#user(request)),
      ...(list === undefined
        ? {}
        : { listPath: list, listLabel: resource.metadata.pluralLabel }),
      recordPages: await this.#recordPages(resource, id, root, user, path),
      scriptFile: entry(this.#assets, "panel.js"),
      ...(this.#scripts.length === 0 ? {} : { scripts: this.#scripts }),
      ...(this.#styles.length === 0 ? {} : { styles: this.#styles }),
      styleFile: entry(this.#assets, "panel.css"),
    });
  }

  /**
   * The strip of links a record carries, so its pages are reachable.
   *
   * The generated ones and the declared ones together. A strip holding only
   * the custom pages would leave a reader on one of them with no way back to
   * the form, and a record with no page of its own has no strip at all —
   * there is nothing to choose between.
   */
  async #recordPages(
    resource: RegisteredResource,
    id: string,
    root: string,
    user: unknown,
    current: string,
  ): Promise<
    readonly { label: string; href: string; icon?: string; current?: true }[]
  > {
    if (resource.metadata.pages.length === 0) return [];

    const base = resourcePath(root, resource.metadata.slug);
    if (base === undefined) return [];
    const at = `${base}/${encodeURIComponent(id)}`;
    const strip: { label: string; href: string; icon?: string; current?: true }[] = [];

    // The view, where the resource has one at all.
    if (this.#registry.infolistFor(resource) !== undefined) {
      strip.push({
        label: "View",
        href: at,
        ...(current === "" ? { current: true } : {}),
      });
    }
    strip.push({
      label: "Edit",
      href: `${at}/edit`,
      ...(current === "edit" ? { current: true as const } : {}),
    });

    const declared = [...resource.metadata.pages]
      .map((type) => ({ type, metadata: resourcePageMetadata(type) }))
      .sort((a, b) => (a.metadata?.sort ?? 0) - (b.metadata?.sort ?? 0));
    for (const { type, metadata } of declared) {
      if (metadata === undefined) continue;
      // The same refusal the route makes, so a link is never drawn to a page
      // that would answer 404.
      if (!(await mayReach(this.#registry.pageInstance(type).can, user))) continue;
      strip.push({
        label: metadata.label,
        href: `${at}/${encodeURIComponent(metadata.path)}`,
        ...(metadata.icon === undefined ? {} : { icon: metadata.icon }),
        ...(metadata.path === current ? { current: true as const } : {}),
      });
    }
    return strip;
  }

  /**
   * A page with a schema and no model behind it.
   *
   * The same shell every other page is served as, pointed at the page's own
   * API: the bundle asks the same two questions of whatever base it was given,
   * so a dependent `Select` on a settings screen works with nothing written
   * for pages in the browser at all.
   */
  async #page(path: string, request: IncomingUrl): Promise<string> {
    const page = this.#pages.get(path);
    // The same answer whether it is absent or forbidden: asking after one
    // tells a caller nothing about which pages exist.
    if (page === undefined) throw new NotFoundException();

    const user = this.#users.resolve(request);
    if (!(await mayReach(page.instance.can, user))) throw new NotFoundException();

    const root = rootOf(request, path);
    const state = (await page.instance.state?.()) ?? {};
    const resolved = await resolveSchema(page.instance.schema(), state, {
      // The page and its values exist already and submitting changes them,
      // which is what `edit` means to every resolver that reads it.
      operation: "edit",
      user,
    });

    return renderShell({
      root,
      api: `${root}/api/page/${encodeURIComponent(path)}`,
      title: page.metadata.label,
      operation: "edit",
      payload: serialise(resolved),
      navigation: await this.#navigation(request, root, path),
      ...(await this.#user(request)),
      scriptFile: entry(this.#assets, "panel.js"),
      ...(this.#scripts.length === 0 ? {} : { scripts: this.#scripts }),
      ...(this.#styles.length === 0 ? {} : { styles: this.#styles }),
      styleFile: entry(this.#assets, "panel.css"),
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
      this.#pages.all(),
    );
  }

  /**
   * Rebuilt per request, for the reason the navigation is: two readers are two
   * menus, and one kept across them is one reader's menu shown to another.
   */
  async #user(request: IncomingUrl): Promise<{ userMenu?: unknown }> {
    const menu = await buildUserMenu(this.#userMenu, this.#users.resolve(request));
    return menu === undefined ? {} : { userMenu: menu };
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

    // On the form and the view too, not only on the pages themselves: a strip
    // a reader can only see once they are already on a custom page is a strip
    // that never got them there.
    const strip =
      page.id === undefined
        ? []
        : await this.#recordPages(
            page.resource,
            page.id,
            root,
            this.#users.resolve(page.request),
            page.operation === "edit" ? "edit" : "",
          );

    return renderShell({
      navigation,
      ...(await this.#user(page.request)),
      ...(strip.length === 0 ? {} : { recordPages: strip }),
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
      ...(this.#styles.length === 0 ? {} : { styles: this.#styles }),
      styleFile: entry(this.#assets, "panel.css"),
    });
  }
}

/** The row's own label, where it has one that is text. */
function titleOf(meta: ModelMeta, record: Row): string | undefined {
  const label = record[meta.labelField];
  return typeof label === "string" && label !== "" ? label : undefined;
}

function entry(assets: PanelAssets, name: string): string {
  const file = assets.entries[name];
  // The manifest reader already requires both; this is what stops a rename
  // reaching a browser as a broken tag.
  if (file === undefined) throw new Error(`the asset manifest names no "${name}".`);
  return file;
}
