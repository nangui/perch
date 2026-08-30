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
import { declaredActions, resolveSchema, serialise } from "@perchjs/core";
import type { ActionAnswer, ActionTarget } from "./action-run.js";
import { carryAction, reachAction } from "./action-run.js";
import { ReplayGuard, readReplayKey } from "./replay-guard.js";
import { admit } from "./admission.js";
import { readSelection } from "./action-selection.js";
import { includeFor } from "./infolist-plan.js";
import { authorize } from "./authorization.js";
import { reachManager } from "./relation-reach.js";
import { withOptions } from "./relationship-options.js";
import { permissionFor } from "./authorization.js";
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
   * Both policies are asked about the parent rather than the child: seeing the
   * parent is what reaching a manager costs, the manager's own policy says
   * whether this action may run, and a rule about which child belongs to the
   * action's own guard, which runs per record anyway.
   */
  async #onChildren(
    slug: string,
    id: string,
    relation: string,
    name: string,
    user: unknown,
  ): Promise<ActionTarget> {
    // Resolved on the way past, so the allowlist is read once: the permission
    // to ask and the action to run are the same lookup.
    let declared: Action | undefined;
    const { data, scope, owner } = await reachManager({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation,
      user,
      needs: (one) => {
        declared = declaredActions(one.state.table).get(name);
        // Deleting a child asks about deleting, not about editing.
        return declared === undefined ? undefined : permissionFor(declared);
      },
    });
    if (declared === undefined) throw new NotFoundException();

    // No table and no policy: the manager's table is what declared the action
    // above, and the manager's own policy has already been asked about the
    // parent, so nothing further is asked per row here.
    // An action on a joined manager's row would run against a row that belongs
    // to nobody in particular — there is no column narrowing the selection it
    // was given, so `loadSelection` could not tell this parent's rows from any
    // others. The boot refuses such a manager's actions; this is the door.
    if (scope.kind !== "owned") throw new NotFoundException();
    return {
      data,
      model: scope.model,
      action: declared,
      scope: { column: scope.foreignKey, value: owner },
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
  /**
   * `POST {path}/api/:resource/actions/:action/content`.
   *
   * What a view opened in place shows: the resource's infolist, resolved
   * against the record, which is the same tree the View page draws.
   *
   * Its own reach rather than the run route's, because that one refuses
   * anything it cannot carry out and this is the one thing not meant to be
   * carried out at all. Widening it would make a `show` action runnable, which
   * is a route answering 200 to a press that did nothing.
   *
   * The refusals are the read's: a resource nobody may reach, an action nobody
   * declared, a row that is not there, and a policy saying this reader may not
   * see this record. All of them 404, which is what they say on the page.
   */
  @Post("actions/:action/content")
  @HttpCode(200)
  async content(
    @Param("resource") slug: string,
    @Param("action") name: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const data = this.#data;
    if (data === null) throw new NotFoundException();

    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    // Read off the declaration, so a name nobody declared reaches nothing — the
    // same oracle the run route uses, asked for the one trigger it turns away.
    const table = resource.instance.table?.();
    const action = table === undefined ? undefined : declaredActions(table).get(name);
    if (action === undefined || action.trigger !== "show") {
      throw new NotFoundException();
    }

    const infolist = this.#registry.infolistFor(resource);
    if (infolist === undefined) throw new NotFoundException();

    const model = resource.metadata.model;
    const { keys } = readSelection(data, model, body);
    // One row. A dialog reading a record reads one of them, and a body naming
    // fifty is not a request this answers by picking one.
    const key = keys.length === 1 ? keys[0] : undefined;
    if (key === undefined) throw new NotFoundException();

    const plan = includeFor(data.ir(), model, infolist);
    const record = await data.findOne(model, key, {
      ...(plan === undefined ? {} : { include: plan }),
    });
    if (record === null) throw new NotFoundException();

    const user = this.#users.resolve(request);
    // After the row, never before it: the policy is asked about a record, and
    // asking it without one would be authorising at render time.
    if ((await authorize(resource.instance.can, "view", user, record)) !== "allowed") {
      throw new NotFoundException();
    }

    return serialise(
      await resolveSchema(
        infolist,
        {},
        {
          operation: "view",
          user,
          record,
          ...withOptions(data, model),
        },
      ),
    );
  }

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
