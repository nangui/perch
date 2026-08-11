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
import type { DataAdapter, FormState, Operation, Option, Row } from "@perchjs/core";
import { Select } from "@perchjs/core";
import { admit } from "./admission.js";
import { authorize } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { recordId } from "./record-id.js";
// The same cap the list search uses: a term is a term, and two constants that
// mean one thing drift.
import { MAX_TERM } from "./records-query.js";
import { optionLoader } from "./relationship-options.js";
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

  constructor(
    registry: ResourceRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
  ) {
    this.#registry = registry;
    this.#users = users;
    this.#data = data;
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
      schema: resource.instance.form(),
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
}

async function loadRecord(
  data: DataAdapter | null,
  model: string,
  request: OptionsBody,
): Promise<Row | null> {
  if (request.operation === "create") return null;
  if (data === null || request.id === undefined) throw new NotFoundException();

  const key = recordId(data, model, request.id);
  if (key === null) throw new NotFoundException();

  const row = await data.findOne(model, key);
  if (row === null) throw new NotFoundException();
  return row;
}

/** A malformed envelope is refused; what is inside it is answered in silence. */
function decode(body: unknown): OptionsBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new NotFoundException();
  }
  const { state, operation, path, term, id } = body as Record<string, unknown>;

  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    throw new NotFoundException();
  }
  if (typeof path !== "string" || path.length === 0) throw new NotFoundException();
  if (typeof term !== "string") throw new NotFoundException();
  if (typeof operation !== "string" || !OPERATIONS.has(operation as Operation)) {
    throw new NotFoundException();
  }

  return {
    state: state as FormState,
    operation: operation as Operation,
    path,
    term,
    ...(typeof id === "string" || typeof id === "number" ? { id } : {}),
  };
}
