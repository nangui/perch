/**
 * `GET {path}/api/:resource/records?page&perPage&sort&search&filters`.
 *
 * The controller is the thin half: it resolves who is asking and hands the rest
 * to `records.ts`, which the list page calls too.
 */
import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { IncomingUrl } from "./panel-root.js";
import { rootOf } from "./panel-root.js";
import type { DataAdapter } from "@perchjs/core";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { RawQuery } from "./records-query.js";
import type { RecordsResponse } from "./records.js";
import { listRecords } from "./records.js";
import { listChildren } from "./relation-records.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

@Controller("api/:resource")
export class PanelRecordsController {
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
    );
  }

  /**
   * `GET {path}/api/:resource/:id/relations/:name/records`.
   *
   * The parent's key is in the address and nowhere else. A relation manager is
   * narrowed by a column the server derives, and a request that could name the
   * parent could name somebody else's.
   */
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
    });
  }
}
