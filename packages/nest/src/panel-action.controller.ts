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
import type { Action, DataAdapter, FormState, SchemaPayload } from "@perchjs/core";
import { declaredActions, serialise } from "@perchjs/core";
import type { ActionAnswer, ActionTarget } from "./action-run.js";
import { carryAction, reachAction } from "./action-run.js";
import { ReplayGuard, readReplayKey } from "./replay-guard.js";
import { admit } from "./admission.js";
import { recordId } from "./record-id.js";
import { relationScope } from "./relation-scope.js";
import { withOptions } from "./relationship-options.js";
import { authorize, permissionFor } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

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
    const user = this.#users.resolve(request);
    return await this.#run(this.#onResource(slug), slug, name, body, user);
  }

  /**
   * `POST {path}/api/:resource/:id/relations/:name/actions/:action`.
   *
   * A manager's own actions, on a manager's own rows. Its table declares them,
   * so the resource's list is not an allowlist here — and the selection is
   * narrowed by the derived column before anything is carried out, because a
   * child of another parent is a perfectly valid row of the same model.
   */
  @Post(":id/relations/:relation/actions/:action")
  @HttpCode(200)
  async runOnChild(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("relation") relation: string,
    @Param("action") name: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<ActionAnswer> {
    const user = this.#users.resolve(request);
    const target = await this.#onChildren(slug, id, relation, name, user);
    return await this.#run(target, `${slug}/${id}/${relation}`, name, body, user);
  }

  async #run(
    target: ActionTarget,
    prefix: string,
    name: string,
    body: unknown,
    user: unknown,
  ): Promise<ActionAnswer> {
    const { action, allowed, refused } = await reachAction(target, name, body, user);

    // After every refusal, never before them. The key is the caller's own
    // invention, so answering from memory first would hand whoever sends it
    // next the first caller's answer, with nobody asked whether they may have
    // it. A replay costs one load; that is what correctness costs here.
    //
    // Scoped by what the intent actually is — this action, on these rows —
    // rather than by the name alone. A name reused over another selection is
    // another intent, and answering it from memory would tell that caller their
    // rows were dealt with when they were not. The parent is in the prefix for
    // the same reason: the same action on the same keys under another parent is
    // another intent.
    const key = readReplayKey(body);
    const primaryKey = target.data.meta(target.model).primaryKey.name;
    const scoped =
      key === undefined
        ? undefined
        : `${prefix}/${name}/${allowed.map((row) => String(row[primaryKey])).join(",")}/${key}`;
    const now = Date.now();
    if (scoped !== undefined) {
      const already = this.#replays.recall(scoped, now);
      if (already !== undefined) return already;
    }

    // What a modal collected, replayed against the schema that modal was drawn
    // from — the same boundary form state crosses. An action with no form
    // collects nothing, and a body that carries something anyway is dropped
    // without a word.
    const collected = await this.#collected(action, body, user, target.model);
    // A form that did not validate changed nothing, so there is nothing to
    // recognise later: the reader is meant to fix it and send it again.
    if ("refused" in collected) {
      return { ...collected.refused, processed: 0, refused };
    }

    const answer = await carryAction({
      data: target.data,
      model: target.model,
      action,
      rows: allowed,
      user,
      refusedAlready: refused,
      collected: collected.accepted,
    });
    if (scoped !== undefined) this.#replays.remember(scoped, answer, now);
    return answer;
  }

  /** The resource's own rows, with its own policy asked per record. */
  #onResource(slug: string): ActionTarget {
    const data = this.#data;
    if (data === null) throw new NotFoundException();

    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    const table = resource.instance.table?.();
    return {
      data,
      model: resource.metadata.model,
      ...(table === undefined ? {} : { table }),
      ...(resource.instance.can === undefined ? {} : { can: resource.instance.can }),
    };
  }

  /**
   * A manager's rows, reached through the parent and narrowed to it.
   *
   * Both policies are asked about the parent rather than the child: managing a
   * record's children is a thing done to the record, and a rule about which
   * child belongs to the action's own guard, which runs per record anyway.
   */
  async #onChildren(
    slug: string,
    id: string,
    relation: string,
    name: string,
    user: unknown,
  ): Promise<ActionTarget> {
    const data = this.#data;
    if (data === null) throw new NotFoundException();

    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    const model = resource.metadata.model;
    const key = recordId(data, model, id);
    if (key === null) throw new NotFoundException();

    // The parent, and the policy about it, before the relation is looked at.
    const parent = await data.findOne(model, key);
    if (parent === null) throw new NotFoundException();
    if ((await authorize(resource.instance.can, "edit", user, parent)) !== "allowed") {
      throw new NotFoundException();
    }

    const manager = (resource.instance.relations?.() ?? []).find(
      (one) => one.state.relation === relation,
    );
    if (manager === undefined) throw new NotFoundException();

    // The manager's own policy, never the child resource's, and asked for what
    // this action actually is: deleting a child asks about deleting.
    const declared = declaredActions(manager.state.table).get(name);
    if (declared === undefined) throw new NotFoundException();
    const permission = permissionFor(declared);
    if ((await authorize(manager.state.can, permission, user, parent)) !== "allowed") {
      throw new NotFoundException();
    }

    const scope = relationScope(data.ir(), model, relation);
    return {
      data,
      model: scope.model,
      table: manager.state.table,
      scope: { column: scope.foreignKey, value: parent[scope.parentKey] },
    };
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
    const user = this.#users.resolve(request);
    return await this.#form(this.#onResource(slug), name, body, user);
  }

  @Post(":id/relations/:relation/actions/:action/form")
  @HttpCode(200)
  async childForm(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("relation") relation: string,
    @Param("action") name: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const user = this.#users.resolve(request);
    const target = await this.#onChildren(slug, id, relation, name, user);
    return await this.#form(target, name, body, user);
  }

  async #form(
    target: ActionTarget,
    name: string,
    body: unknown,
    user: unknown,
  ): Promise<SchemaPayload> {
    const { action } = await reachAction(target, name, body, user);
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
      ...withOptions(this.#data, target.model),
    });
    return serialise(tree);
  }
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
