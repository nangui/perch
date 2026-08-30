/**
 * `GET {path}/api/:resource/records?page&perPage&sort&search&filters`.
 *
 * The controller is the thin half: it resolves who is asking and hands the rest
 * to `records.ts`, which the list page calls too.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { IncomingUrl } from "./panel-root.js";
import { rootOf } from "./panel-root.js";
import type { DataAdapter, SchemaPayload } from "@perchjs/core";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
import type { RawQuery } from "./records-query.js";
import type { RecordsResponse } from "./records.js";
import { listRecords } from "./records.js";
import { listChildren } from "./relation-records.js";
import type { SaveResponse } from "./panel-save.controller.js";
import type { JoinResponse } from "./relation-join.js";
import { attachChildren, detachChildren } from "./relation-join.js";
import { childForm, saveChild } from "./relation-save.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

@Controller("api/:resource")
export class PanelRecordsController {
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

  @Get("records")
  async records(
    @Param("resource") slug: string,
    @Query() query: RawQuery,
    @Req() request: IncomingUrl,
  ): Promise<RecordsResponse> {
    return await listRecords(
      this.#data,
      this.#registry.get(slug),
      query,
      this.#users.resolve(request),
      // `/admin/api/posts/records` → `/admin`, whatever prefix the host added.
      rootOf(request, "api"),
      this.#disks,
    );
  }

  /**
   * `GET {path}/api/:resource/:id/relations/:name/records`.
   *
   * The parent's key is in the address and nowhere else. A relation manager is
   * narrowed by a column the server derives, and a request that could name the
   * parent could name somebody else's.
   */
  /**
   * `POST` and `PATCH {path}/api/:resource/:id/relations/:name[/:childId]`.
   *
   * One child at a time, which is what separates a manager from a repeater.
   * Both keys are in the address: the parent's because the request may not
   * choose it, and the child's because it is checked against the parent before
   * anything is written.
   */
  @Post(":id/relations/:name")
  @HttpCode(200)
  async createChild(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("name") name: string,
    @Body() body: unknown,
    @Req() request: IncomingUrl,
  ): Promise<SaveResponse> {
    return await saveChild({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation: name,
      body,
      user: this.#users.resolve(request),
      disks: this.#disks,
    });
  }

  /**
   * `POST {path}/api/:resource/:id/relations/:name/attach` and `…/detach`.
   *
   * The two verbs a many-to-many has. The parent is in the address, like every
   * other manager route, because it is the one value a request must not choose;
   * the rows being joined are in the body, because they are the choice.
   */
  @Post(":id/relations/:name/attach")
  @HttpCode(200)
  async attach(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("name") name: string,
    @Body() body: unknown,
    @Req() request: IncomingUrl,
  ): Promise<JoinResponse> {
    return await attachChildren({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation: name,
      body,
      user: this.#users.resolve(request),
    });
  }

  @Post(":id/relations/:name/detach")
  @HttpCode(200)
  async detach(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("name") name: string,
    @Body() body: unknown,
    @Req() request: IncomingUrl,
  ): Promise<JoinResponse> {
    return await detachChildren({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation: name,
      body,
      user: this.#users.resolve(request),
    });
  }

  @Patch(":id/relations/:name/:childId")
  async saveChild(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("name") name: string,
    @Param("childId") childId: string,
    @Body() body: unknown,
    @Req() request: IncomingUrl,
  ): Promise<SaveResponse> {
    return await saveChild({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation: name,
      childId,
      body,
      user: this.#users.resolve(request),
      disks: this.#disks,
    });
  }

  /**
   * `POST {path}/api/:resource/:id/relations/:name/form`.
   *
   * What the modal shows, resolved against this reader. A body naming a child
   * fills it from that row — after the row has been checked against the parent,
   * so reading somebody else's through this is the refusal writing one is.
   */
  @Post(":id/relations/:name/form")
  @HttpCode(200)
  async childForm(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("name") name: string,
    @Body() body: unknown,
    @Req() request: IncomingUrl,
  ): Promise<SchemaPayload> {
    const childId = (body as { childId?: unknown } | null)?.childId;
    return await childForm({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation: name,
      ...(typeof childId === "string" || typeof childId === "number"
        ? { childId: String(childId) }
        : {}),
      user: this.#users.resolve(request),
      disks: this.#disks,
    });
  }

  @Get(":id/relations/:name/records")
  async children(
    @Param("resource") slug: string,
    @Param("id") id: string,
    @Param("name") name: string,
    @Query() query: RawQuery,
    @Req() request: IncomingUrl,
  ): Promise<RecordsResponse> {
    return await listChildren({
      data: this.#data,
      resource: this.#registry.get(slug),
      parentId: id,
      relation: name,
      raw: query,
      user: this.#users.resolve(request),
      disks: this.#disks,
    });
  }
}
