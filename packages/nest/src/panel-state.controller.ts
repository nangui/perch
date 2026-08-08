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
  ResolveResult,
  Row,
  Schema,
  SchemaPayload,
} from "@perchjs/core";
import { resolveSchema, sanitize, serialise } from "@perchjs/core";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
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

    const { accepted, tree } = await admit(schema, decoded, user, record);
    const next = await resolveSchema(schema, accepted, {
      operation: decoded.operation,
      dirtyPath: decoded.dirtyPath,
      user,
      ...(record === null ? {} : { record }),
      previous: tree,
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

  const row = await data.findOne(model, request.id);
  if (row === null) throw new NotFoundException();
  return row;
}

/** Same bound as the resolution cycle, and the same posture past it. */
const MAX_ADMISSION_PASSES = 5;

/**
 * Gates that contradict each other never settle: two fields each visible only
 * while the other is empty admit both, then neither, then both again. Stopping
 * at the bound would answer with whichever set the last pass happened to
 * produce, so it fails instead. The message stays server-side — Nest answers a
 * plain 500 — because it names fields.
 */
export class AdmissionCycleError extends Error {
  readonly paths: readonly string[];

  constructor(paths: readonly string[]) {
    super(
      `Client state did not settle after ${String(MAX_ADMISSION_PASSES)} passes. ` +
        `Fields still changing: ${paths.join(", ")}.`,
    );
    this.name = "AdmissionCycleError";
    this.paths = paths;
  }
}

/**
 * A field is admitted only if the tree resolved from the values already admitted
 * says it may be. Nothing the client sent is ever what decides its own fate, so
 * a hidden field cannot be unlocked except by a field that is itself editable —
 * and the cascade starts from the record, which the client never touched.
 *
 * One pass is not enough. `cityId` becomes visible because `countryId` was
 * admitted, and both arrive together: judging them against a tree that knows
 * neither would discard the city on every round trip.
 */
async function admit(
  schema: Schema,
  request: StateRequest,
  user: unknown,
  record: Row | null,
): Promise<{ accepted: FormState; tree: ResolveResult }> {
  // Every pass carries the same principal and the same record. A tree resolved
  // without them decides visibility for nobody, about nothing, and admits a
  // field reserved for somebody.
  const options = {
    operation: request.operation,
    user,
    ...(record === null ? {} : { record }),
  };
  let accepted: FormState = {};
  let tree = await resolveSchema(schema, accepted, options);

  for (let pass = 0; pass < MAX_ADMISSION_PASSES; pass += 1) {
    const clean = sanitize(tree, request.state);
    if (sameKeys(clean.state, accepted)) return { accepted, tree };

    accepted = clean.state;
    tree = await resolveSchema(schema, accepted, options);
  }

  throw new AdmissionCycleError(
    unsettled(sanitize(tree, request.state).state, accepted),
  );
}

/** The paths one more pass would have changed its mind about. */
function unsettled(next: FormState, accepted: FormState): string[] {
  const keys = new Set([...Object.keys(next), ...Object.keys(accepted)]);
  return [...keys].filter((key) => key in next !== key in accepted);
}

function sameKeys(a: FormState, b: FormState): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b);
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
