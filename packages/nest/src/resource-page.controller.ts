/**
 * `POST {path}/api/:resource/:id/page/:page` and its `/state`.
 *
 * The same two doors a record's form goes through, for a page about that
 * record. The browser was handed a base address and asks the same questions of
 * it, which is why a dependent `Select` works on a statistics screen with
 * nothing written for these pages in the bundle.
 *
 * The row is loaded and the resource's own `view` is asked about it before
 * anything else happens. A page under a record is not a way around the policy
 * on that record.
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
import type { DataAdapter, FormState, Row, SchemaPayload } from "@perchjs/core";
import { resolveSchema, serialise } from "@perchjs/core";
import { admit } from "./admission.js";
import { authorize, mayReach } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import { recordId } from "./record-id.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { PanelResourcePage } from "./resource-page.js";
import { resourcePageMetadata } from "./resource-page.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

/**
 * A record page resolves as an edit.
 *
 * The row exists and a submit changes it, which is what `edit` means to every
 * resolver that reads it.
 */
const OPERATION = "edit" as const;

export interface ResourcePageAnswer {
  readonly errors?: Record<string, string>;
  readonly payload?: SchemaPayload;
  readonly redirect?: string;
  readonly notification?: string;
}

interface Reached {
  readonly page: PanelResourcePage;
  readonly label: string;
  readonly record: Row;
  readonly user: unknown;
}

@Controller("api/:resource")
export class ResourcePageController {
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

  @Post(":id/page/:page")
  @HttpCode(200)
  async submit(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("page") path: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<ResourcePageAnswer> {
    const { page, label, record, user } = await this.#reach(slug, id, path, request);
    if (page.submit === undefined) {
      // A page that shows and does not submit. Refused rather than quietly
      // accepted: a save that answers yes and writes nothing is the worst of
      // the three things this could do.
      throw new NotFoundException();
    }

    const { accepted, tree } = await admit({
      schema: page.schema(),
      state: decode(body).state,
      operation: OPERATION,
      user,
      record,
    });

    // Before the submit, not after. Whatever it does is the write, and running
    // it on a state the form itself refuses is the one order that cannot be
    // undone.
    if (Object.keys(tree.errors).length > 0) {
      return { errors: tree.errors, payload: serialise(tree) };
    }

    const said = await page.submit(record, accepted);
    const answer =
      said === undefined || said === null ? {} : (said as ResourcePageAnswer);
    return "notification" in answer || "redirect" in answer
      ? answer
      : { ...answer, notification: `${label} saved.` };
  }

  @Post(":id/page/:page/state")
  @HttpCode(200)
  async state(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("page") path: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const { page, record, user } = await this.#reach(slug, id, path, request);
    const schema = page.schema();
    const decoded = decode(body);

    const { accepted, tree } = await admit({
      schema,
      state: decoded.state,
      operation: OPERATION,
      user,
      record,
    });
    const next = await resolveSchema(schema, accepted, {
      operation: OPERATION,
      ...(decoded.dirtyPath === undefined ? {} : { dirtyPath: decoded.dirtyPath }),
      user,
      record,
      previous: tree,
    });

    return serialise(next);
  }

  /**
   * The page and its row, if this reader may have both.
   *
   * One answer for every refusal, so that asking after one tells a caller
   * nothing — which resource exists, which row exists, which page it has.
   */
  async #reach(
    slug: string,
    id: string,
    path: string,
    request: unknown,
  ): Promise<Reached> {
    const resource = this.#registry.get(slug);
    if (resource === undefined || this.#data === null) throw new NotFoundException();

    const declared = resource.metadata.pages.find(
      (type) => resourcePageMetadata(type)?.path === path,
    );
    if (declared === undefined) throw new NotFoundException();

    const key = recordId(this.#data, resource.metadata.model, id);
    if (key === null) throw new NotFoundException();
    const record = await this.#data.findOne(resource.metadata.model, key, {});
    if (record === null) throw new NotFoundException();

    // After the row, never before it: the policy is asked about a record, and
    // asking it without one would be authorising at render time.
    const user = this.#users.resolve(request);
    if ((await authorize(resource.instance.can, "view", user, record)) !== "allowed") {
      throw new NotFoundException();
    }

    const page = this.#registry.pageInstance(declared);
    // The page's own gate, on top of the record's. For one narrower than the
    // record it belongs to — an audit trail only an administrator reads.
    if (!(await mayReach(page.can, user))) throw new NotFoundException();

    return {
      page,
      label: resourcePageMetadata(declared)?.label ?? path,
      record,
      user,
    };
  }
}

function decode(body: unknown): {
  readonly state: FormState;
  readonly dirtyPath?: string;
} {
  const said = (typeof body === "object" && body !== null ? body : {}) as {
    state?: unknown;
    dirtyPath?: unknown;
  };
  const state =
    typeof said.state === "object" && said.state !== null
      ? (said.state as FormState)
      : {};
  return {
    state,
    ...(typeof said.dirtyPath === "string" ? { dirtyPath: said.dirtyPath } : {}),
  };
}
