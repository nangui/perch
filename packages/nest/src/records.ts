/**
 * Listing a resource, once, for the two places that do it.
 *
 * The API route answers a fetch and the list page embeds the first page in its
 * shell. Both have to apply the same rules — who may list, which sorts are
 * accepted, which columns leave the server — and a security boundary written
 * twice is a boundary that will diverge.
 */
import { NotFoundException } from "@nestjs/common";
import type { ColumnTree, DataAdapter, Row, Sort } from "@perchjs/core";
import { serialiseTable } from "@perchjs/core";
import type { Authorization } from "./authorization.js";
import { mayReach } from "./authorization.js";
import { sameOrigin } from "./panel-root.js";
import type { RawQuery } from "./records-query.js";
import { DEFAULT_PER_PAGE, readQuery } from "./records-query.js";
import type { RegisteredResource } from "./resource-registry.js";
import { project, visibleKeys } from "./row-projection.js";

export interface RecordsResponse {
  readonly rows: readonly Row[];
  readonly total: number;
  /**
   * The page actually served and its size, which are not always the ones that
   * were asked for: `perPage` is capped and paging is stopped at a depth past
   * which nobody is reading. Read from the query the server built rather than
   * echoed back, for the reason `sort` is — a client that draws its controls
   * from what it requested draws a state the server refused.
   */
  readonly page: number;
  readonly perPage: number;
  /** Empty for a resource that declares no table. */
  readonly columns: ColumnTree;
  /**
   * The order actually applied, which is not always the one that was asked for
   * — an undeclared column is dropped in silence. The client draws its sort
   * indicator from this rather than from what it requested, or it shows a state
   * the server never agreed to.
   */
  readonly sort?: Sort;
  /**
   * The term actually searched for, which is not always the one that was asked
   * for — it is capped, and a resource whose columns declare no search drops it
   * entirely. The box on the client is filled from this for the reason the sort
   * indicator is: showing what was typed after the server refused it is the
   * client inventing a state.
   */
  readonly search?: string;
  /**
   * What the model calls its primary key, and where its pages live. Together
   * they are how a row action addresses one row: `${resourcePath}/${row[recordKey]}`.
   * Sent rather than assumed — a model keyed on `uuid` had the client falling
   * back to a positional index.
   *
   * `resourcePath` is absent when the root it was built from is not one this
   * origin owns, and then an action offers nothing rather than a link off the
   * site.
   */
  readonly recordKey: string;
  readonly resourcePath?: string;
}

/**
 * A resource that decides visibility row by row cannot be listed yet.
 *
 * `can.view` is asked about one record, and a list has none in hand. Answering
 * it after the fact would be worse than not asking: the page would come back
 * short, the total would lie, and rows the caller may not open would already
 * have crossed the wire. The scoping that answers this properly belongs to the
 * adapter and does not exist.
 *
 * So it fails closed, and gains its list when scoping arrives.
 */
export function mayList(can: Authorization | undefined): boolean {
  return can?.view === undefined;
}

/**
 * Throws `NotFoundException` for absent, forbidden and unlistable alike:
 * enumerating resources has to tell a caller nothing.
 */
export async function listRecords(
  data: DataAdapter | null,
  resource: RegisteredResource | undefined,
  raw: RawQuery,
  user: unknown,
  root: string,
): Promise<RecordsResponse> {
  if (resource === undefined || data === null) throw new NotFoundException();

  const can = resource.instance.can;
  if (!(await mayReach(can, user)) || !mayList(can)) throw new NotFoundException();

  const model = resource.metadata.model;
  const table = resource.instance.table?.();
  const ir = data.ir();
  const query = readQuery(model, ir, raw, table);
  const found = await data.findMany(query);
  const applied = query.sort?.[0];
  const perPage = query.take ?? DEFAULT_PER_PAGE;

  return {
    rows: project(found.rows, visibleKeys(model, ir, table)),
    total: found.total,
    page: Math.floor((query.skip ?? 0) / perPage) + 1,
    perPage,
    columns:
      table === undefined
        ? { columns: [], actions: [], headerActions: [] }
        : serialiseTable(table),
    recordKey: data.meta(model).primaryKey.name,
    ...pathOrNothing(resourcePath(root, resource.metadata.slug)),
    ...(applied === undefined ? {} : { sort: applied }),
    ...(query.search === undefined ? {} : { search: query.search.term }),
  };
}

/**
 * The path the resource's pages live under, or nothing.
 *
 * The root comes from the request, so it is attacker-shaped: a URL beginning
 * `//evil.com` makes `rootOf` return `//evil.com/admin`, and a link built from
 * that is protocol-relative — it leaves the site. `sameOrigin` is the guard the
 * redirect after a create already uses, and this is the same hole one route to
 * the left.
 */
export function resourcePath(root: string, slug: string): string | undefined {
  return sameOrigin(`${root}/${slug}`);
}

function pathOrNothing(path: string | undefined): { resourcePath?: string } {
  return path === undefined ? {} : { resourcePath: path };
}
