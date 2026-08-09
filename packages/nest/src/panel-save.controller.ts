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
import type { DataAdapter, FieldErrors, Row, SchemaPayload } from "@perchjs/core";
import { dehydrate, serialise } from "@perchjs/core";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { admit } from "./admission.js";
import { recordId } from "./record-id.js";
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
}

@Controller("api/:resource")
export class PanelSaveController {
  readonly #registry: ResourceRegistry;
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
  ) {
    this.#registry = registry;
    this.#users = users;
    this.#data = data;
  }

  @Post()
  @HttpCode(200)
  async create(
    @Param("resource") slug: string,
    @Body() body: unknown,
    @Req() request: unknown,
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
    const values = (await mutate?.(written.values)) ?? written.values;
    return { record: await data.create(resource.metadata.model, { set: values }) };
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
    const values = (await mutate?.(written.values)) ?? written.values;
    return { record: await data.update(model, key, { set: values }) };
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
  ): Promise<{ refused: SaveResponse } | { values: Record<string, unknown> }> {
    const operation = record === null ? "create" : "edit";
    const { tree } = await admit({
      schema: resource.instance.form(),
      state: readState(body),
      operation,
      user,
      record,
    });

    // Before the write, not after: a form with errors touches nothing, and the
    // answer carries the tree so the client can put them where they belong.
    if (Object.keys(tree.errors).length > 0) {
      return { refused: { errors: tree.errors, payload: serialise(tree) } };
    }

    return {
      values: dehydrate(tree, {
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
