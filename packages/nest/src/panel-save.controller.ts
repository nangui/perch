/**
 * `POST {path}/api/:resource` and `PATCH {path}/api/:resource/:id`.
 *
 * The request that actually writes, so the trust boundary matters most here.
 * Incoming state is admitted in waves exactly as `/state` admits it, and what
 * reaches the database is what the engine dehydrates from the admitted tree —
 * never the payload. An invisible field leaves no value behind, and neither
 * does one the form marked as not dehydrated.
 *
 * Validation runs before the write, not after it: a form with errors answers
 * with them and touches nothing.
 */
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type {
  DataAdapter,
  FieldErrors,
  NotificationState,
  Row,
  WriteTree,
  SchemaPayload,
} from "@perchjs/core";
import type { DehydratedWrite } from "@perchjs/core";
import { dehydrate, serialise } from "@perchjs/core";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import { admit } from "./admission.js";
import { commitUploads, dropReplaced, undoCommitted } from "./commit-uploads.js";
import { fileUrls } from "./file-urls.js";
import { withOptions } from "./relationship-options.js";
import type { IncomingUrl } from "./panel-root.js";
import { rootOf } from "./panel-root.js";
import { resourcePath } from "./records.js";
import { recordId } from "./record-id.js";
import { projectOne } from "./row-projection.js";
import type { RedirectAfterCreate } from "./redirect.js";
import { PANEL_REDIRECT_AFTER_CREATE } from "./redirect.js";
import type { RegisteredResource } from "./resource-registry.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

export interface SaveResponse {
  /** Absent when the write happened. */
  readonly errors?: FieldErrors;
  readonly record?: Row;
  /** Returned with the errors, so the form can show them where they belong. */
  readonly payload?: SchemaPayload;
  /**
   * Where to go now. The server names it because the server owns the routes —
   * a client guessing them would have to know the panel's own layout.
   */
  readonly redirect?: string;
  /**
   * What to tell the reader. Present only when the write happened.
   *
   * It has to survive the redirect above, which is the client's to carry: the
   * message is already made here, and carrying it across a navigation the
   * client performs is not a decision it takes.
   */
  readonly notification?: NotificationState;
}

@Controller("api/:resource")
export class PanelSaveController {
  readonly #registry: ResourceRegistry;
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  readonly #disks: PanelDisks;
  readonly #redirect: RedirectAfterCreate;

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
    @Inject(PANEL_REDIRECT_AFTER_CREATE) redirect: RedirectAfterCreate,
  ) {
    this.#registry = registry;
    this.#users = users;
    this.#data = data;
    this.#disks = disks;
    this.#redirect = redirect;
  }

  @Post()
  @HttpCode(200)
  async create(
    @Param("resource") slug: string,
    @Body() body: unknown,
    @Req() request: IncomingUrl,
  ): Promise<SaveResponse> {
    const { resource, data, user } = this.#context(slug, request);
    if ((await authorize(resource.instance.can, "create", user)) !== "allowed") {
      throw new NotFoundException();
    }

    const written = await this.#write(resource, body, user, null);
    if ("refused" in written) return written.refused;

    const mutate = resource.instance.mutateFormDataBeforeCreate?.bind(
      resource.instance,
    );
    // The hook and the upload commit both deal in columns. A repeater's rows
    // are not columns, so they ride alongside rather than through.
    const mutated = (await mutate?.({ ...written.write.set })) ?? written.write.set;
    // Files first, the row last (ADR 0016): a failure between them leaves a
    // file nobody points at rather than a row pointing at nothing.
    const { values, committed } = await commitUploads(
      resource.instance.form(),
      mutated,
      null,
      this.#disks,
    );

    let record: Row;
    try {
      // In a transaction, because a row and its repeater's rows are one write.
      // Prisma's nested write is already one statement and would roll back on
      // its own; asking here is what makes the guarantee the adapter's contract
      // rather than a property one adapter happens to have.
      record = await data.transaction(async (tx) =>
        tx.create(resource.metadata.model, {
          set: values,
          ...relationsOf(written.write),
        }),
      );
    } catch (error) {
      await undoCommitted(committed, this.#disks);
      throw error;
    }
    await dropReplaced(committed, this.#disks);

    const where = this.#where(resource, request, slug, data, record);
    const shown = identity(data, resource.metadata.model, record);
    // Said by the server, because the wording is the server's: a panel in
    // another language does not want a sentence this file's caller invented.
    const said = saved(resource, "created");
    return where === undefined
      ? { record: shown, notification: said }
      : { record: shown, redirect: where, notification: said };
  }

  @Patch(":id")
  async update(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SaveResponse> {
    const { resource, data, user } = this.#context(slug, request);
    const model = resource.metadata.model;

    const key = recordId(data, model, id);
    if (key === null) throw new NotFoundException();
    const record = await data.findOne(model, key);
    if (record === null) throw new NotFoundException();

    if ((await authorize(resource.instance.can, "edit", user, record)) !== "allowed") {
      throw new NotFoundException();
    }

    const written = await this.#write(resource, body, user, record);
    if ("refused" in written) return written.refused;

    const mutate = resource.instance.mutateFormDataBeforeSave?.bind(resource.instance);
    const mutated = (await mutate?.({ ...written.write.set })) ?? written.write.set;
    const { values, committed } = await commitUploads(
      resource.instance.form(),
      mutated,
      record,
      this.#disks,
    );

    let updated: Row;
    try {
      updated = await data.transaction(async (tx) =>
        tx.update(model, key, { set: values, ...relationsOf(written.write) }),
      );
    } catch (error) {
      await undoCommitted(committed, this.#disks);
      throw error;
    }
    // Only now: an attachment the row no longer points at, and only because it
    // has stopped pointing at it.
    await dropReplaced(committed, this.#disks);

    return {
      record: identity(data, model, updated),
      notification: saved(resource, "saved"),
    };
  }

  /**
   * A create leaves the page it was made on. Staying there shows a form that
   * has already been used, offering to do it again, which is how the same row
   * gets written twice.
   */
  #where(
    resource: RegisteredResource,
    request: IncomingUrl,
    slug: string,
    data: DataAdapter,
    record: Row,
  ): string | undefined {
    const target = resource.instance.redirectAfterCreate ?? this.#redirect;
    if (target === "none") return undefined;

    const root = rootOf(request, `api/${slug}`);
    // The same guard, and the same function, every other link in the panel
    // goes through.
    const list = resourcePath(root, slug);
    if (list === undefined) return undefined;
    if (target === "index") return list;

    const key = record[data.meta(resource.metadata.model).primaryKey.name];
    // Anything else is not a key this panel can put in a URL, so it stays put
    // rather than sending the browser somewhere invented.
    if (typeof key !== "string" && typeof key !== "number") return undefined;

    return `${list}/${encodeURIComponent(String(key))}/edit`;
  }

  #context(
    slug: string,
    request: unknown,
  ): { resource: RegisteredResource; data: DataAdapter; user: unknown } {
    const resource = this.#registry.get(slug);
    // A panel with nowhere to write is a panel with no such route, as far as a
    // caller can tell.
    if (resource === undefined || this.#data === null) throw new NotFoundException();
    return { resource, data: this.#data, user: this.#users.resolve(request) };
  }

  /** Errors, or the values the engine says may be written. */
  async #write(
    resource: RegisteredResource,
    body: unknown,
    user: unknown,
    record: Row | null,
  ): Promise<{ refused: SaveResponse } | { write: DehydratedWrite }> {
    const operation = record === null ? "create" : "edit";
    const { tree } = await admit({
      schema: resource.instance.form(),
      state: readState(body),
      operation,
      user,
      record,
      ...withOptions(this.#data, resource.metadata.model),
      ...fileUrls(this.#disks),
    });

    // Before the write, not after: a form with errors touches nothing, and the
    // answer carries the tree so the client can put them where they belong.
    if (Object.keys(tree.errors).length > 0) {
      return { refused: { errors: tree.errors, payload: serialise(tree) } };
    }

    return {
      write: dehydrate(tree, {
        operation,
        user,
        ...(record === null ? {} : { record }),
      }),
    };
  }
}

function readState(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new NotFoundException();
  }
  const { state } = body as Record<string, unknown>;
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    throw new NotFoundException();
  }
  return state as Record<string, unknown>;
}

/**
 * What a save answers with: the key of the row it wrote, and nothing else.
 *
 * It used to be the whole row, which carries every column the model has, and
 * nothing on the client reads any of them. `/records` learned this for a table;
 * a save is the same wire and the same rule.
 *
 * The key alone, rather than the fields the form declared. That narrower rule
 * was tried first and does not hold: `mutateFormDataBeforeCreate` hashes a
 * password *under the field's own name*, so "what the form declared" hands the
 * hash back to the browser that supplied the plaintext. The key is what the
 * redirect already contains, so it says nothing new.
 */
function identity(data: DataAdapter, model: string, row: Row): Row {
  return projectOne(row, new Set([data.meta(model).primaryKey.name]));
}

/** What a save says when it worked. Named after the resource, not the model. */
function saved(
  resource: RegisteredResource,
  what: "created" | "saved",
): NotificationState {
  return {
    title: `${resource.metadata.label} ${what}`,
    tone: "success",
  };
}

/** The rows a repeater asked for, where it asked for any. */
function relationsOf(write: DehydratedWrite): Pick<WriteTree, "relations"> {
  return write.relations === undefined ? {} : { relations: write.relations };
}
