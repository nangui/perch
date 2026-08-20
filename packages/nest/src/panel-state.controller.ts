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
  Action,
  DataAdapter,
  FormState,
  Operation,
  Row,
  ResolveOptions,
  Schema,
  SchemaPayload,
} from "@perchjs/core";
import { declaredActions, resolveSchema, serialise } from "@perchjs/core";
import { fileUrls } from "./file-urls.js";
import { withOptions } from "./relationship-options.js";
import { admit } from "./admission.js";
import { authorize, permissionFor } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import { recordId } from "./record-id.js";
import { reachManager } from "./relation-reach.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { RegisteredResource } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

const OPERATIONS = new Set<Operation>(["create", "edit", "view"]);

export interface StateRequest {
  readonly state: FormState;
  readonly dirtyPath: string;
  readonly operation: Operation;
  readonly id?: string | number;
  /** Names a modal's schema instead of the resource's own form. */
  readonly action?: string;
}

@Controller("api/:resource")
export class PanelStateController {
  readonly #registry: ResourceRegistry;
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  readonly #urls: Pick<ResolveOptions, "fileUrl">;

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
  ) {
    this.#registry = registry;
    this.#users = users;
    this.#data = data;
    this.#urls = fileUrls(disks);
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

    // A modal's schema belongs to its action, so the action's permission is
    // what gates it — not the operation the request named. Otherwise a caller
    // picks the operation it can pass and reads the schema of one it cannot:
    // the form route refuses that, and a guard only one of two doors goes
    // through is decoration.
    const named =
      decoded.action === undefined ? undefined : actionOf(resource, decoded.action);
    const verdict = await authorize(
      resource.instance.can,
      named === undefined ? decoded.operation : permissionFor(named),
      user,
      record ?? undefined,
    );
    if (verdict !== "allowed") throw new NotFoundException();

    // A modal's schema is a schema like any other, so the cycle that makes a
    // dependent `Select` work on a page works inside one. Which schema is read
    // off the declaration, never off the request: a name nobody declared, or an
    // action with no form, reaches nothing.
    const schema =
      named === undefined ? this.#registry.formFor(resource) : formOf(named);

    // One loader for both resolutions: memoised, so the admission passes and
    // the answer share a single query rather than repeating it.
    const options = {
      ...withOptions(this.#data, resource.metadata.model),
      ...this.#urls,
    };

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

  /**
   * `POST {path}/api/:resource/:id/relations/:relation/state`.
   *
   * A modal opened over a manager's rows takes round trips like any other
   * schema — a dependent `Select` inside one has to work, or the cycle stops
   * at a door it was never told about.
   *
   * Only an action's form is reachable here. The manager's own form is written
   * through its own route, where the child being edited is known; a modal
   * answers to no single row, so the tree resolves against none.
   */
  @Post(":id/relations/:relation/state")
  @HttpCode(200)
  async childState(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("relation") relation: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const decoded = decode(body);
    if (decoded.action === undefined) throw new NotFoundException();
    const user = this.#users.resolve(request);

    let named: Action | undefined;
    const { scope } = await reachManager({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation,
      user,
      needs: (manager) => {
        named = declaredActions(manager.state.table).get(decoded.action as string);
        return named === undefined ? undefined : permissionFor(named);
      },
    });
    if (named === undefined) throw new NotFoundException();

    // Read against the child's model, which is whose columns the modal's fields
    // declare. The parent's would offer a dropdown of the wrong table.
    const schema = formOf(named);
    const options = { ...withOptions(this.#data, scope.model), ...this.#urls };
    const { accepted, tree } = await admit({
      schema,
      state: decoded.state,
      operation: decoded.operation,
      user,
      record: null,
      ...options,
    });
    const next = await resolveSchema(schema, accepted, {
      operation: decoded.operation,
      dirtyPath: decoded.dirtyPath,
      user,
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

  const { action } = body as Record<string, unknown>;

  return {
    state: state as FormState,
    dirtyPath,
    operation: operation as Operation,
    ...(typeof id === "string" || typeof id === "number" ? { id } : {}),
    ...(typeof action === "string" && action.length > 0 ? { action } : {}),
  };
}

/** The action a request named, and only one the table declared. */
function actionOf(resource: RegisteredResource, name: string): Action {
  const table = resource.instance.table?.();
  const action = table === undefined ? undefined : declaredActions(table).get(name);
  if (action === undefined) throw new NotFoundException();
  return action;
}

/** The schema it collects with, or nothing at all. */
function formOf(action: Action): Schema {
  const schema = action.state.form;
  if (schema === undefined) throw new NotFoundException();
  return schema;
}
