/**
 * `POST {path}/api/:resource/state`.
 *
 * Build the tree, confront the incoming state with it, run the resolution cycle,
 * serialise. The confrontation is the trust boundary: an unknown path, or one
 * belonging to a field that is invisible, disabled or read-only, is dropped
 * without a word — naming the reason would tell an attacker which fields exist
 * and which are protected.
 *
 * The tree it is confronted with is never resolved from what arrived — that
 * would be asking the attacker to mark their own work. It starts from the
 * record and grows only by what has already been admitted.
 */
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type {
  DataAdapter,
  FormState,
  Operation,
  Row,
  SchemaPayload,
} from "@perchjs/core";
import { resolveSchema, serialise } from "@perchjs/core";
import { withOptions } from "./relationship-options.js";
import { admit } from "./admission.js";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { recordId } from "./record-id.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

const OPERATIONS = new Set<Operation>(["create", "edit", "view"]);

export interface StateRequest {
  readonly state: FormState;
  readonly dirtyPath: string;
  readonly operation: Operation;
  readonly id?: string | number;
}

@Controller("api/:resource")
export class PanelStateController {
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

  @Post("state")
  // Nest answers 201 to a POST by default; this creates nothing.
  @HttpCode(200)
  async state(
    @Param("resource") slug: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const resource = this.#registry.get(slug);
    // Same answer whether the resource is absent or forbidden, so enumerating
    // them tells a caller nothing.
    if (resource === undefined) throw new NotFoundException();

    const decoded = decode(body);
    const user = this.#users.resolve(request);
    const record = await loadRecord(this.#data, resource.metadata.model, decoded);
    const verdict = await authorize(
      resource.instance.can,
      decoded.operation,
      user,
      record ?? undefined,
    );
    if (verdict !== "allowed") throw new NotFoundException();

    const schema = resource.instance.form();

    // One loader for both resolutions: memoised, so the admission passes and
    // the answer share a single query rather than repeating it.
    const options = withOptions(this.#data, resource.metadata.model);

    const { accepted, tree } = await admit({
      schema,
      state: decoded.state,
      operation: decoded.operation,
      user,
      record,
      ...options,
    });
    const next = await resolveSchema(schema, accepted, {
      operation: decoded.operation,
      dirtyPath: decoded.dirtyPath,
      user,
      ...(record === null ? {} : { record }),
      previous: tree,
      ...options,
    });

    return serialise(next);
  }
}

/**
 * An edit is about a row. Without an adapter there is none to be about, and
 * without an id the request has not said which — both refuse rather than
 * quietly editing nothing.
 */
async function loadRecord(
  data: DataAdapter | null,
  model: string,
  request: StateRequest,
): Promise<Row | null> {
  if (request.operation === "create") return null;
  if (data === null || request.id === undefined) throw new NotFoundException();

  const key = recordId(data, model, request.id);
  if (key === null) throw new NotFoundException();

  const row = await data.findOne(model, key);
  if (row === null) throw new NotFoundException();
  return row;
}

/**
 * A malformed body is a bad request, not a 500. This is the only place a message
 * is explicit: it is about the envelope, which tells an attacker nothing about
 * the form inside it.
 */
function decode(body: unknown): StateRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new NotFoundException();
  }
  const { state, dirtyPath, operation, id } = body as Record<string, unknown>;

  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    throw new NotFoundException();
  }
  if (typeof dirtyPath !== "string" || dirtyPath.length === 0) {
    throw new NotFoundException();
  }
  if (typeof operation !== "string" || !OPERATIONS.has(operation as Operation)) {
    throw new NotFoundException();
  }

  return {
    state: state as FormState,
    dirtyPath,
    operation: operation as Operation,
    ...(typeof id === "string" || typeof id === "number" ? { id } : {}),
  };
}
