/**
 * `POST {path}/api/:resource/options`.
 *
 * What a `.searchable()` select asks when the reader types. `optionsLimit`
 * makes the rendered list a window; this is how the rest of the relation is
 * reached, and filtering 10,000 options in the browser is the bug it exists to
 * avoid.
 *
 * The trust boundary is the same one the live route holds, asked a narrower
 * question. A term is only ever run against a field that declared itself
 * searchable, on the label field that field declared, in a tree resolved from
 * the record rather than from what arrived. Anything else answers with an empty
 * list — not an error, which would say that the field exists, that it is a
 * relation, or that it is protected.
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
  Option,
  Row,
  Schema,
  SchemaPayload,
} from "@perchjs/core";
import { dehydrate, Select, serialise } from "@perchjs/core";
import { admit } from "./admission.js";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { recordId } from "./record-id.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import { commitUploads, dropReplaced, undoCommitted } from "./commit-uploads.js";
import { fileUrls } from "./file-urls.js";
// The same cap the list search uses: a term is a term, and two constants that
// mean one thing drift.
import { MAX_TERM } from "./records-query.js";
import type { OptionLoader } from "./relationship-options.js";
import { optionLoader, optionTarget, withOptions } from "./relationship-options.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

const OPERATIONS = new Set<Operation>(["create", "edit", "view"]);

export interface OptionsBody {
  readonly state: FormState;
  readonly operation: Operation;
  readonly path: string;
  readonly term: string;
  readonly id?: string | number;
}

export interface OptionsAnswer {
  readonly options: readonly Option[];
}

@Controller("api/:resource")
export class PanelOptionsController {
  readonly #registry: ResourceRegistry;
  readonly #users: UserResolver;
  readonly #data: DataAdapter | null;
  readonly #disks: PanelDisks;

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
  ) {
    this.#registry = registry;
    this.#users = users;
    this.#data = data;
    this.#disks = disks;
  }

  @Post("options")
  @HttpCode(200)
  async options(
    @Param("resource") slug: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<OptionsAnswer> {
    const resource = this.#registry.get(slug);
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

    const load = optionLoader(this.#data, resource.metadata.model);
    if (load === undefined) return { options: [] };

    // Resolved before the field is looked up, because whether a field is there
    // at all is something the resolution decides.
    //
    // Without the loader, deliberately: this tree is read for its flags and
    // never for its options, so supplying one would load the window of every
    // relationship select on the form and throw all of them away — on every
    // keystroke.
    const { tree } = await admit({
      schema: this.#registry.formFor(resource),
      state: decoded.state,
      operation: decoded.operation,
      user,
      record,
    });

    const found = tree.nodes.find(
      (node): node is typeof node & { component: Select } =>
        node.component instanceof Select && node.component.name === decoded.path,
    );
    if (found === undefined) return { options: [] };
    const select = found.component;

    // A field the reader cannot use is a field they cannot search. Invisible,
    // disabled and read-only each mean the answer is none of their business,
    // and saying which one would be saying it exists.
    if (!found.visible || found.disabled || found.readOnly) return { options: [] };
    if (!select.state.searchable || select.state.relationship === undefined) {
      return { options: [] };
    }

    // An empty term is not a search: it is the reader clearing the box, and the
    // answer is the window they started from.
    const term = decoded.term.trim().slice(0, MAX_TERM);
    const options = await load({
      relationship: select.state.relationship,
      limit: select.state.optionsLimit,
      ...(term === "" ? {} : { term }),
    });

    return { options };
  }

  /**
   * `POST {path}/api/:resource/options/form` — what the dialog draws.
   *
   * Fetched when it opens rather than serialised into every page that might
   * open it, so it is resolved for the reader who asked and at the moment they
   * asked. Its fields belong to the model the relation points at, so its
   * options are loaded against that model — the host's would offer dropdowns of
   * the wrong table.
   */
  @Post("options/form")
  @HttpCode(200)
  async optionForm(
    @Param("resource") slug: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const { form, target } = await this.#reachCreator(slug, body, request);
    const { tree } = await admit({
      schema: form,
      state: readState(body),
      operation: "create",
      user: this.#users.resolve(request),
      // A row that does not exist yet reads no record.
      record: null,
      ...withOptions(this.#data, target.model),
      ...fileUrls(this.#disks),
    });
    return serialise(tree);
  }

  /**
   * `POST {path}/api/:resource/options/create` — the row, and the option for it.
   *
   * The same write every other form gets: admitted, validated, dehydrated, and
   * refused whole if anything in it is wrong. What comes back is one option,
   * built by the same code that builds every other one, so a value the select
   * cannot carry is impossible rather than unlikely.
   */
  @Post("options/create")
  @HttpCode(200)
  async createOption(
    @Param("resource") slug: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<CreatedOption> {
    const { form, target, select, load, host } = await this.#reachCreator(
      slug,
      body,
      request,
    );
    const user = this.#users.resolve(request);
    const data = this.#data;
    if (data === null) throw new NotFoundException();

    const { tree } = await admit({
      schema: form,
      state: readState(body),
      operation: "create",
      user,
      record: null,
      ...withOptions(data, target.model),
      ...fileUrls(this.#disks),
    });

    // Before the write, not after: a form with errors touches nothing.
    if (Object.keys(tree.errors).length > 0) {
      return { errors: tree.errors, payload: serialise(tree) };
    }

    const written = dehydrate(tree, { operation: "create", user });
    // Files first, the row last: a failure between them leaves a file nobody
    // points at rather than a row pointing at nothing.
    const { write, committed } = await commitUploads(form, written, null, this.#disks);

    let saved: Row;
    try {
      saved = await data.transaction(async (tx) => tx.create(target.model, write));
    } catch (error) {
      await undoCommitted(committed, this.#disks);
      throw error;
    }
    await dropReplaced(committed, this.#disks);

    // Asked for by the key just written, through the loader every other option
    // comes from. A row outside the window is fetched by that path, which is
    // exactly where a row created a second ago sits when the list is sorted by
    // label.
    const relationship = select.state.relationship;
    if (relationship === undefined || load === undefined) throw new NotFoundException();
    const chosen = saved[target.valueField];
    if (typeof chosen !== "string" && typeof chosen !== "number") {
      throw new NotFoundException();
    }
    const options = await load({
      relationship,
      limit: select.state.optionsLimit,
      selected: chosen,
    });
    const option = options.find((one) => String(one.value) === String(chosen));
    if (option === undefined) throw new NotFoundException();

    // The host form again, resolved with the choice already in it.
    //
    // Not a value for the client to apply itself. A select's list is a window
    // onto a table, and a row created a second ago is not in the window that
    // was sent — so a browser setting the value on its own would hold a choice
    // its own list cannot show, and a select control answers that by clearing
    // itself. The server owns both the list and the state, so it sends both.
    const { tree: after } = await admit({
      schema: host.schema,
      state: { ...host.state, [host.path]: chosen },
      operation: host.operation,
      user,
      record: host.record,
      ...withOptions(data, host.model),
      ...fileUrls(this.#disks),
    });

    // No notification: a create through a dialog leaves the reader where they
    // were, and the only thing this panel can say in place is said by the field
    // itself — which now holds the row and shows its name. A message the client
    // has nowhere to draw is a message nobody reads.
    return { option, payload: serialise(after) };
  }

  /**
   * The select a request names, and the dialog behind it — or nothing at all.
   *
   * The same boundary the search route holds, asked once more. Everything is
   * read off the resolved tree rather than off what arrived: which field,
   * whether the reader may see it, whether it offers this at all. And one thing
   * the search route has no reason to ask — whether this reader may create a
   * row in the other table, which is that resource's `can()` to answer and not
   * this one's. A form reached through a select is still a form.
   */
  async #reachCreator(slug: string, body: unknown, request: unknown): Promise<Creator> {
    const resource = this.#registry.get(slug);
    if (resource === undefined) throw new NotFoundException();

    const decoded = decodeHost(body);
    const user = this.#users.resolve(request);
    const record = await loadRecord(this.#data, resource.metadata.model, decoded);
    const host = await authorize(
      resource.instance.can,
      decoded.operation,
      user,
      record ?? undefined,
    );
    if (host !== "allowed") throw new NotFoundException();

    const { tree } = await admit({
      schema: this.#registry.formFor(resource),
      state: decoded.state,
      operation: decoded.operation,
      user,
      record,
    });

    const found = tree.nodes.find(
      (node): node is typeof node & { component: Select } =>
        node.component instanceof Select && node.component.name === decoded.path,
    );
    if (found === undefined) throw new NotFoundException();
    const select = found.component;
    if (!found.visible || found.disabled || found.readOnly)
      throw new NotFoundException();

    const form = select.state.createOptionForm;
    const relationship = select.state.relationship;
    if (form === undefined || relationship === undefined) throw new NotFoundException();
    if (this.#data === null) throw new NotFoundException();

    const target = optionTarget(this.#data, resource.metadata.model, relationship.name);
    // The permission that matters is the other model's. Checked here rather
    // than only where the button is drawn, because a request does not need a
    // button — and refused the same way a missing resource is, so a caller
    // cannot tell one from the other.
    const [owner] = this.#registry.forModel(target.model);
    if (owner === undefined) throw new NotFoundException();
    const mayCreate = await authorize(owner.instance.can, "create", user);
    if (mayCreate !== "allowed") throw new NotFoundException();

    return {
      form,
      target,
      select,
      load: optionLoader(this.#data, resource.metadata.model),
      host: {
        schema: this.#registry.formFor(resource),
        state: decoded.state,
        operation: decoded.operation,
        record,
        model: resource.metadata.model,
        path: decoded.path,
      },
    };
  }
}

interface Creator {
  readonly form: Schema;
  readonly target: { readonly model: string; readonly valueField: string };
  readonly select: Select;
  readonly load: OptionLoader | undefined;
  /** What the host form was resolved from, to resolve it again with the choice. */
  readonly host: {
    readonly schema: Schema;
    readonly state: FormState;
    readonly operation: Operation;
    readonly record: Row | null;
    readonly model: string;
    readonly path: string;
  };
}

/** Either the option that now exists, or why the form was refused. */
export type CreatedOption =
  | {
      readonly option: Option;
      /** The host form, resolved with the new option chosen in it. */
      readonly payload: SchemaPayload;
    }
  | {
      readonly errors: Readonly<Record<string, string>>;
      readonly payload: SchemaPayload;
    };

/** The dialog's own values, which arrive beside the form's. */
function readState(body: unknown): FormState {
  if (typeof body !== "object" || body === null) return {};
  const { data } = body as Record<string, unknown>;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  return data as FormState;
}

async function loadRecord(
  data: DataAdapter | null,
  model: string,
  request: Omit<OptionsBody, "term">,
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
 * Which field, on which form, for which reader.
 *
 * Everything three routes need to find one select and decide whether it may be
 * touched. A malformed envelope is refused; what is inside it is answered in
 * silence.
 */
function decodeHost(body: unknown): Omit<OptionsBody, "term"> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new NotFoundException();
  }
  const { state, operation, path, id } = body as Record<string, unknown>;

  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    throw new NotFoundException();
  }
  if (typeof path !== "string" || path.length === 0) throw new NotFoundException();
  if (typeof operation !== "string" || !OPERATIONS.has(operation as Operation)) {
    throw new NotFoundException();
  }

  return {
    state: state as FormState,
    operation: operation as Operation,
    path,
    ...(typeof id === "string" || typeof id === "number" ? { id } : {}),
  };
}

/** The search route's, which is the same question plus what was typed. */
function decode(body: unknown): OptionsBody {
  const host = decodeHost(body);
  const { term } = body as Record<string, unknown>;
  if (typeof term !== "string") throw new NotFoundException();
  return { ...host, term };
}
