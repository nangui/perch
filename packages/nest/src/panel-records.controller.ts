/**
 * `GET {path}/api/:resource/records?page&perPage&sort&search&filters`.
 *
 * PRD 03 freezes the answer as `{ rows, total, columns }`, and all three are
 * here. A resource that declares no `table()` still lists — with no columns,
 * and the narrow default sort of `records-query.ts`.
 *
 * What a resource declares per row cannot be honoured by a list, and this
 * refuses rather than pretending — see `listable` below.
 */
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import type { ColumnTree, DataAdapter, Row } from "@perchjs/core";
import { serialiseTable } from "@perchjs/core";
import type { Authorization } from "./authorization.js";
import { mayReach } from "./authorization.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { RawQuery } from "./records-query.js";
import { readQuery } from "./records-query.js";
import { project, visibleKeys } from "./row-projection.js";
import { ResourceRegistry } from "./resource-registry.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";

export interface RecordsResponse {
  readonly rows: readonly Row[];
  readonly total: number;
  /** PRD 03's `ColumnTree`. Empty for a resource that declares no table. */
  readonly columns: ColumnTree;
}

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
    @Req() request: unknown,
  ): Promise<RecordsResponse> {
    const resource = this.#registry.get(slug);
    // One answer for absent, forbidden and unlistable alike: enumerating
    // resources tells a caller nothing.
    if (resource === undefined || this.#data === null) throw new NotFoundException();

    const user = this.#users.resolve(request);
    const can = resource.instance.can;
    if (!(await mayReach(can, user)) || !listable(can)) throw new NotFoundException();

    const table = resource.instance.table?.();
    const page = await this.#data.findMany(
      readQuery(resource.metadata.model, this.#data.ir(), query, table),
    );
    const ir = this.#data.ir();
    return {
      rows: project(page.rows, visibleKeys(resource.metadata.model, ir, table)),
      total: page.total,
      columns: table === undefined ? { columns: [] } : serialiseTable(table),
    };
  }
}

/**
 * A resource that decides visibility row by row cannot be listed yet.
 *
 * `can.view` is asked about one record, and a list has none in hand. Answering
 * it after the fact would be worse than not asking: the page would come back
 * short, the total would lie, and rows the caller may not open would already
 * have crossed the wire. The scoping that answers this properly belongs to the
 * adapter (PRD 04 §9) and does not exist.
 *
 * So it fails closed. A resource with a row-level `view` returns the same 404
 * as one that is not there, and gains its list when scoping arrives.
 */
function listable(can: Authorization | undefined): boolean {
  return can?.view === undefined;
}
