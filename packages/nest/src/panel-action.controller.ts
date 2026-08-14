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
import type { Action, DataAdapter, Id, NotificationState, Row } from "@perchjs/core";
import {
  DeleteAction,
  admittedRecords,
  declaredActions,
  runAction,
} from "@perchjs/core";
import { loadSelection, readSelection } from "./action-selection.js";
import { authorize } from "./authorization.js";
import type { Permission } from "./authorization.js";
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
}

@Controller("api/:resource")
export class PanelActionController {
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

    return await this.#carry(data, model, action, allowed, user, refused);
  }

  /**
   * One transaction around the whole thing, so a batch that fails partway
   * leaves nothing behind. It wraps one record the same way it wraps fifty:
   * what rolls back must not depend on how many were ticked.
   */
  async #carry(
    data: DataAdapter,
    model: string,
    action: Action,
    rows: readonly Row[],
    user: unknown,
    refusedAlready: number,
  ): Promise<ActionAnswer> {
    // Read once, not once per row. `meta` is documented as resolved at
    // bootstrap and never called on a hot path, and five hundred rows is one.
    const primaryKey = data.meta(model).primaryKey.name;
    const key = (row: Row): Id => row[primaryKey] as Id;

    return await data.transaction(async (tx) => {
      if (action instanceof DeleteAction) {
        // Carried out by the framework rather than by a callback, and still
        // asked of every record: the guard decides which rows this may touch.
        // Fifty rows are one statement, not fifty.
        const admitted = await admittedRecords(action, rows, user);
        const refused = refusedAlready + (rows.length - admitted.length);
        if (admitted.length === 0) return { processed: 0, refused };

        const processed = await tx.delete(model, admitted.map(key));
        return { processed, refused };
      }

      // Nothing from the request body reaches the callback. A modal's fields
      // would have to be replayed against its schema first, the way form state
      // is, and there is no modal and so no schema to replay against — so an
      // author who reads `data` finds it empty rather than finds it trusted.
      const outcome = await runAction({ action, records: rows, user });
      return { ...outcome, refused: outcome.refused + refusedAlready };
    });
  }
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
 * Which policy an action is held to.
 *
 * Deleting asks the delete policy; everything else asks the one for changing a
 * row. An action that only reads would be held to more than it needs — it has
 * no way to say so yet, and saying so is worth a method rather than a guess.
 */
function permissionFor(action: Action): Permission {
  return action instanceof DeleteAction ? "delete" : "edit";
}
