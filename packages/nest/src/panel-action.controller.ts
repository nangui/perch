/**
 * `POST {path}/api/:resource/actions/:action`.
 *
 * The one place an action is carried out. Pressing a button is a request like
 * any other, so everything the button showed is re-established here rather than
 * believed: the action has to be one the table declared, the principal has to
 * be allowed the resource, and the action's own guard has to admit the record.
 * A hidden button is not a protection.
 *
 * A refusal is a 404, the same one an unknown resource gets. Telling "you may
 * not" apart from "there is no such thing" is how a caller maps what exists.
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
  Id,
  NotificationState,
  Row,
  SchemaPayload,
} from "@perchjs/core";
import {
  DeleteAction,
  ForceDeleteAction,
  RestoreAction,
  admittedRecords,
  declaredActions,
  runAction,
  serialise,
} from "@perchjs/core";
import { loadSelection, readSelection } from "./action-selection.js";
import { ReplayGuard, readReplayKey } from "./replay-guard.js";
import { admit } from "./admission.js";
import { withOptions } from "./relationship-options.js";
import { authorize, permissionFor } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

export interface ActionAnswer {
  /** How many records it ran against. */
  readonly processed: number;
  /** How many a guard turned down. Never why. */
  readonly refused: number;
  readonly notification?: NotificationState;
  /**
   * A modal whose form does not validate, answered the way a refused save is.
   *
   * Not a 4xx: the request was well formed and the reader is not done with the
   * dialog. The tree comes back with it so the errors land on the fields they
   * are about, rather than as a sentence about a form the client would have to
   * match up itself.
   */
  readonly errors?: Readonly<Record<string, string>>;
  readonly payload?: SchemaPayload;
}

@Controller("api/:resource")
export class PanelActionController {
  readonly #registry: ResourceRegistry;
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  /**
   * One per panel, because a replay is a replay whichever resource it names.
   * The key is the caller's; what it maps to is what this route already said.
   */
  readonly #replays = new ReplayGuard<ActionAnswer>();

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
  ) {
    this.#registry = registry;
    this.#users = users;
    this.#data = data;
  }

  @Post("actions/:action")
  // Nest answers 201 to a POST by default; an action creates nothing in
  // general, and the one that does says so in its own answer.
  @HttpCode(200)
  async run(
    @Param("resource") slug: string,
    @Param("action") name: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<ActionAnswer> {
    const { action, user, model, allowed, refused } = await this.#reach(
      slug,
      name,
      body,
      request,
    );

    // After every refusal, never before them. The key is the caller's own
    // invention, so answering from memory first would hand whoever sends it
    // next the first caller's answer, with nobody asked whether they may have
    // it. A replay costs one load; that is what correctness costs here.
    //
    // Scoped by what the intent actually is — this action, on these rows —
    // rather than by the name alone. A name reused over another selection is
    // another intent, and answering it from memory would tell that caller their
    // rows were dealt with when they were not.
    const key = readReplayKey(body);
    const scoped =
      key === undefined
        ? undefined
        : `${slug}/${name}/${allowed.map((row) => String(row[this.#keyName(model)])).join(",")}/${key}`;
    const now = Date.now();
    if (scoped !== undefined) {
      const already = this.#replays.recall(scoped, now);
      if (already !== undefined) return already;
    }

    // What a modal collected, replayed against the schema that modal was drawn
    // from — the same boundary form state crosses. An action with no form
    // collects nothing, and a body that carries something anyway is dropped
    // without a word.
    const collected = await this.#collected(action, body, user, model);
    // A form that did not validate changed nothing, so there is nothing to
    // recognise later: the reader is meant to fix it and send it again.
    if ("refused" in collected) {
      return { ...collected.refused, processed: 0, refused };
    }

    const answer = await this.#carry(
      action,
      model,
      allowed,
      user,
      refused,
      collected.accepted,
    );
    if (scoped !== undefined) this.#replays.remember(scoped, answer, now);
    return answer;
  }

  /**
   * Everything both routes have to re-establish before they do anything.
   *
   * Pressing a button is a request like any other, so none of what the button
   * showed is believed: the action has to be one the table declared, the
   * principal has to be allowed the resource, and the selection has to name
   * rows that are still there.
   */
  async #reach(
    slug: string,
    name: string,
    body: unknown,
    request: unknown,
  ): Promise<{
    action: Action;
    user: unknown;
    model: string;
    allowed: readonly Row[];
    refused: number;
  }> {
    const data = this.#data;
    if (data === null) throw new NotFoundException();

    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    // The allowlist is read off the declaration, so a name nobody declared
    // reaches nothing — the same oracle sorting, searching and filtering use.
    // A resource with no table declares no actions and so offers none.
    const table = resource.instance.table?.();
    const action = table === undefined ? undefined : declaredActions(table).get(name);
    if (action === undefined) throw new NotFoundException();

    // A link is not something this can carry out. Answering 200 with nothing
    // done would tell the caller it worked, which is the failure mode this
    // route exists to avoid.
    if (!executable(action)) throw new NotFoundException();

    const user = this.#users.resolve(request);
    const model = resource.metadata.model;

    const { keys } = readSelection(data, model, body);
    const rows = await loadSelection(data, model, keys);
    // A key naming nothing is a row somebody deleted between the tick and the
    // press. Naming none at all is a request about nothing.
    if (rows.length === 0) throw new NotFoundException();

    // Asked once without a record first. `viewAny`, `create` and `delete` do not
    // turn on which row, so a selection of five hundred asks them once rather
    // than five hundred times; only a check that needs a record is repeated.
    const permission = permissionFor(action);
    const gate = await authorize(resource.instance.can, permission, user);
    if (gate === "denied") throw new NotFoundException();

    const allowed: Row[] = [];
    let refused = 0;
    for (const row of rows) {
      if (gate === "allowed") {
        allowed.push(row);
        continue;
      }
      const verdict = await authorize(resource.instance.can, permission, user, row);
      if (verdict === "allowed") allowed.push(row);
      else refused += 1;
    }

    // Nothing this principal may touch is answered like a resource that is not
    // there. Telling "you may not" apart from "there is no such thing" is how a
    // caller maps what exists.
    if (allowed.length === 0) throw new NotFoundException();

    return { action, user, model, allowed, refused };
  }

  /**
   * What the modal sent, once it has been through stage 5.
   *
   * An unknown path, or one belonging to a field that is invisible, disabled or
   * read-only, is dropped without a word. Nothing else may reach a callback:
   * the body is the client's to write, and an author reading `data` has to be
   * reading something the schema admitted.
   */
  async #collected(
    action: Action,
    body: unknown,
    user: unknown,
    model: string,
  ): Promise<
    { accepted: FormState } | { refused: Pick<ActionAnswer, "errors" | "payload"> }
  > {
    const schema = action.state.form;
    if (schema === undefined) return { accepted: {} };

    const { accepted, tree } = await admit({
      schema,
      state: readData(body),
      operation: "create",
      user,
      record: null,
      ...withOptions(this.#data, model),
    });
    // A form that does not validate is not run.
    if (Object.keys(tree.errors).length > 0) {
      return { refused: { errors: tree.errors, payload: serialise(tree) } };
    }
    return { accepted };
  }

  /**
   * What the modal shows.
   *
   * Asked for rather than sent with the table: a schema means nothing until it
   * has been resolved against a principal, and a table is serialised once for
   * every reader who lists.
   *
   * The same refusals the run goes through, because opening the modal is where
   * a reader learns whether they may act — and learning it here rather than
   * after filling it in is the only kindness available.
   */
  @Post("actions/:action/form")
  @HttpCode(200)
  async form(
    @Param("resource") slug: string,
    @Param("action") name: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const { action, user, model } = await this.#reach(slug, name, body, request);
    const schema = action.state.form;
    if (schema === undefined) throw new NotFoundException();

    const { tree } = await admit({
      schema,
      state: readData(body),
      operation: "create",
      user,
      // Filled once however many rows were ticked, so it answers to none of
      // them. A field that read a record would have fifty to choose from.
      record: null,
      ...withOptions(this.#data, model),
    });
    return serialise(tree);
  }

  /**
   * One transaction around the whole thing, so a batch that fails partway
   * leaves nothing behind. It wraps one record the same way it wraps fifty:
   * what rolls back must not depend on how many were ticked.
   */
  /** Where the primary key lives on a row of this model. */
  #keyName(model: string): string {
    if (this.#data === null) throw new NotFoundException();
    return this.#data.meta(model).primaryKey.name;
  }

  async #carry(
    action: Action,
    model: string,
    rows: readonly Row[],
    user: unknown,
    refusedAlready: number,
    collected: FormState,
  ): Promise<ActionAnswer> {
    const data = this.#data;
    if (data === null) throw new NotFoundException();
    // Read once, not once per row. `meta` is documented as resolved at
    // bootstrap and never called on a hot path, and five hundred rows is one.
    const primaryKey = data.meta(model).primaryKey.name;
    const key = (row: Row): Id => row[primaryKey] as Id;

    return await data.transaction(async (tx) => {
      // The three the framework carries out itself. Each is still asked of
      // every record — the guard decides which rows it may touch — and each is
      // one statement for fifty rows rather than fifty.
      const port = builtIn(action);
      if (port !== undefined) {
        const admitted = await admittedRecords(action, rows, user);
        const refused = refusedAlready + (rows.length - admitted.length);
        if (admitted.length === 0) return { processed: 0, refused };

        const processed = await tx[port](model, admitted.map(key));
        return { processed, refused };
      }

      // What reaches the callback is what the schema admitted, never what the
      // body carried. An action with no form hands it an empty object.
      const outcome = await runAction({ action, records: rows, user, data: collected });
      return { ...outcome, refused: outcome.refused + refusedAlready };
    });
  }
}

/** Which port method carries this action out, where the framework does. */
function builtIn(action: Action): "delete" | "forceDelete" | "restore" | undefined {
  if (action instanceof ForceDeleteAction) return "forceDelete";
  if (action instanceof RestoreAction) return "restore";
  if (action instanceof DeleteAction) return "delete";
  return undefined;
}

/**
 * Whether this route can carry the action out at all.
 *
 * An author's callback, or one of the ready-made ones this file knows how to
 * perform. `CreateAction` and `EditAction` are neither: they are links, and the
 * browser follows them without asking the server to do anything.
 */
function executable(action: Action): boolean {
  return action.trigger === "run";
}

/**
 * The modal's fields, straight off the body and trusted by nothing.
 *
 * Handed to `admit`, which is what decides whether any of it survives.
 */
function readData(body: unknown): Readonly<Record<string, unknown>> {
  const raw = (body as { data?: unknown } | null)?.data;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Readonly<Record<string, unknown>>;
}
