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
import { readQuery } from "./records-query.js";
import type { RegisteredResource } from "./resource-registry.js";
import { project, visibleKeys } from "./row-projection.js";

export interface RecordsResponse {
  readonly rows: readonly Row[];
  readonly total: number;
  /** PRD 03's `ColumnTree`. Empty for a resource that declares no table. */
  readonly columns: ColumnTree;
  /**
   * The order actually applied, which is not always the one that was asked for
   * — an undeclared column is dropped in silence. The client draws its sort
   * indicator from this rather than from what it requested, or it shows a state
   * the server never agreed to.
   */
  readonly sort?: Sort;
  /**
   * What the model calls its primary key, and where its pages live. Together
   * they are how a row action addresses one row: `${editPath}/${row[recordKey]}`.
   * Sent rather than assumed — a model keyed on `uuid` had the client falling
   * back to a positional index.
   *
   * `editPath` is absent when the root it was built from is not one this origin
   * owns, and then a row offers no action rather than a link off the site.
   */
  readonly recordKey: string;
  readonly editPath?: string;
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
  const page = await data.findMany(query);
  const applied = query.sort?.[0];

  return {
    rows: project(page.rows, visibleKeys(model, ir, table)),
    total: page.total,
    columns: table === undefined ? { columns: [], actions: [] } : serialiseTable(table),
    recordKey: data.meta(model).primaryKey.name,
    ...editPathOf(root, resource.metadata.slug),
    ...(applied === undefined ? {} : { sort: applied }),
  };
}

/**
 * The path a row action points at, or nothing.
 *
 * The root comes from the request, so it is attacker-shaped: a URL beginning
 * `//evil.com` makes `rootOf` return `//evil.com/admin`, and a link built from
 * that is protocol-relative — it leaves the site. `sameOrigin` is the guard the
 * redirect after a create already uses, and this is the same hole one route to
 * the left.
 */
function editPathOf(root: string, slug: string): { editPath?: string } {
  const path = sameOrigin(`${root}/${slug}`);
  return path === undefined ? {} : { editPath: path };
}
