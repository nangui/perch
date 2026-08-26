/**
 * What a read has to load for an infolist to have something to say.
 *
 * Its own module because two routes need it and neither owns it: the View page
 * draws a record's infolist, and a view opened in a dialog draws the same one.
 * Living in one of the two controllers made the other import a page.
 */
import type { EntryRelation, IncludePlan, Ir, Schema } from "@perchjs/core";
import { buildIncludePlan, entryPaths, entryRelations, findModel } from "@perchjs/core";

/**
 * The relations an infolist names, as one plan.
 *
 * Refuses to throw, like the table's own plan does: a path that does not
 * resolve stops the boot, so a running panel never reaches here with one, and
 * taking a page down over it would be out of proportion to what a plan is for.
 */
export function includeFor(
  ir: Ir,
  model: string,
  infolist: Schema,
): IncludePlan | undefined {
  try {
    const plan = planFor(ir, model, infolist);
    // Nothing to load is no plan, not an empty one: the adapter is asked for the
    // row and nothing else.
    return Object.keys(plan).length === 0 ? undefined : plan;
  } catch {
    return undefined;
  }
}

/**
 * One level of the plan, and the levels its rows hold.
 *
 * A to-many is asked for by name. It cannot be part of a path — one note is not
 * one column of the person — so the plan builder never sees it, and the paths
 * its rows read are resolved against the note's own model.
 */
function planFor(ir: Ir, model: string, schema: Schema): IncludePlan {
  const plan: Record<string, true | IncludePlan> = {
    ...buildIncludePlan(ir, model, entryPaths(schema)),
  };
  for (const relation of entryRelations(schema)) {
    plan[relation.relation] = branchFor(ir, model, relation);
  }
  return plan;
}

/**
 * One relation: what its rows read, and what their own rows read.
 *
 * `true` where there is nothing under it, which is what the plan means by "load
 * this and nothing further".
 */
function branchFor(ir: Ir, model: string, entry: EntryRelation): true | IncludePlan {
  const target = relationTarget(ir, model, entry.relation);
  if (target === undefined) return true;

  const inner: Record<string, true | IncludePlan> = {
    ...buildIncludePlan(ir, target, entry.paths),
  };
  for (const nested of entry.relations) {
    inner[nested.relation] = branchFor(ir, target, nested);
  }
  return Object.keys(inner).length === 0 ? true : inner;
}

/** Which model a relation leads to, or nothing where it is not one. */
function relationTarget(ir: Ir, model: string, relation: string): string | undefined {
  return findModel(ir, model)?.relations.find((one) => one.name === relation)
    ?.targetModel;
}
