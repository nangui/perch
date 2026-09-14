/**
 * `POST {path}/api/page/:page` and its `/state`.
 *
 * The same two doors a resource's form goes through, for a page that has no
 * rows. The browser cannot tell the difference and does not have to: it was
 * handed a base address and asks the same questions of it, which is why a
 * dependent `Select` on a settings page works without a line of code written
 * for pages anywhere in the bundle.
 *
 * Under `api/page/` rather than beside the resources: a page and a resource
 * share the panel's own path, and a page whose API sat at `api/{path}` would
 * be one rename away from answering a resource's questions.
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
import type { FormState, SchemaPayload } from "@perchjs/core";
import { resolveSchema, serialise } from "@perchjs/core";
import { admit } from "./admission.js";
import { mayReach } from "./authorization.js";
import { CustomPageRegistry } from "./custom-page-registry.js";
import type { RegisteredPage } from "./custom-page-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

/**
 * What a page's save answers with, which is the shape a resource's answers.
 *
 * The browser has one way of reading a save, and a page that answered its own
 * shape would be a page the bundle needed code for.
 */
export interface PageSaveAnswer {
  readonly errors?: Record<string, string>;
  readonly payload?: SchemaPayload;
  readonly redirect?: string;
  readonly notification?: string;
}

interface StateBody {
  readonly state?: unknown;
  readonly dirtyPath?: unknown;
}

@Controller("api/page/:page")
export class CustomPageController {
  readonly #pages: CustomPageRegistry;
  readonly #users: UserResolver;

  constructor(
    pages: CustomPageRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
  ) {
    this.#pages = pages;
    this.#users = users;
  }

  @Post("state")
  // Nest answers 201 to a POST by default; this creates nothing.
  @HttpCode(200)
  async state(
    @Param("page") path: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<SchemaPayload> {
    const { page, user } = await this.#reach(path, request);
    const schema = page.instance.schema();
    const decoded = decode(body);

    const { accepted, tree } = await admit({
      schema,
      state: decoded.state,
      operation: OPERATION,
      user,
      // No row behind a page, which is the whole of what makes it one.
      record: null,
    });
    const next = await resolveSchema(schema, accepted, {
      operation: OPERATION,
      ...(decoded.dirtyPath === undefined ? {} : { dirtyPath: decoded.dirtyPath }),
      user,
      previous: tree,
    });

    return serialise(next);
  }

  /**
   * What pressing save does, and what the reader is told about it.
   *
   * Answers the shape a resource's save answers, because the browser has one
   * way of reading that answer: errors with the tree they belong to, or
   * whatever the page said to do next. A page that returns nothing gets a
   * message rather than silence — a form that accepts a save and says nothing
   * is one a reader presses twice.
   */
  @Post()
  @HttpCode(200)
  async submit(
    @Param("page") path: string,
    @Body() body: unknown,
    @Req() request: unknown,
  ): Promise<PageSaveAnswer> {
    const { page, user } = await this.#reach(path, request);
    if (page.instance.submit === undefined) {
      // A page that shows and does not submit. Refused rather than quietly
      // accepted: a save that answers yes and writes nothing is the worst of
      // the three things this could do.
      throw new NotFoundException();
    }

    // What survived the boundary, never what was sent: the state was replayed
    // against this page's own schema, and a path no field admits was dropped
    // before anything here saw it.
    const { accepted, tree } = await admit({
      schema: page.instance.schema(),
      state: decode(body).state,
      operation: OPERATION,
      user,
      record: null,
    });

    // Before the submit, not after. A page whose form has errors runs nothing:
    // whatever `submit` does is the write, and running it on a state the form
    // itself refuses is the one order that cannot be undone.
    if (Object.keys(tree.errors).length > 0) {
      return { errors: tree.errors, payload: serialise(tree) };
    }

    const said = await page.instance.submit(accepted);
    // What the page said to do next, if it said anything. A page that returns
    // nothing still owes the reader an acknowledgement.
    const answer = said === undefined || said === null ? {} : (said as PageSaveAnswer);
    return "notification" in answer || "redirect" in answer
      ? answer
      : { ...answer, notification: `${page.metadata.label} saved.` };
  }

  /**
   * The page, if this reader may have it.
   *
   * The same answer whether it is absent or forbidden, so that asking after
   * one tells a caller nothing about which pages exist.
   */
  async #reach(
    path: string,
    request: unknown,
  ): Promise<{ page: RegisteredPage; user: unknown }> {
    const page = this.#pages.get(path);
    if (page === undefined) throw new NotFoundException();

    const user = this.#users.resolve(request);
    if (!(await mayReach(page.instance.can, user))) throw new NotFoundException();

    return { page, user };
  }
}

/**
 * A page resolves as an edit.
 *
 * The page and its values exist already and submitting changes them, which is
 * what `edit` means to every resolver that reads it. `create` would tell a
 * field asking whether this is a creation that a settings screen is one.
 */
const OPERATION = "edit" as const;

function decode(body: unknown): {
  readonly state: FormState;
  readonly dirtyPath?: string;
} {
  const said = (typeof body === "object" && body !== null ? body : {}) as StateBody;
  const state =
    typeof said.state === "object" && said.state !== null
      ? (said.state as FormState)
      : {};
  return {
    state,
    ...(typeof said.dirtyPath === "string" ? { dirtyPath: said.dirtyPath } : {}),
  };
}
