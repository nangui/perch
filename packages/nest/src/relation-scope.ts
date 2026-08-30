/**
 * Which children belong to which parent.
 *
 * One column, derived once. It is not a convenience: every read and every write
 * a relation manager makes is narrowed by it, so a wrong one is a page of
 * somebody else's rows and a create that hands a child to the wrong owner.
 *
 * Derived rather than declared because the IR already holds it, and the copy
 * that drifts is always the one that stops constraining. Derived from the
 * *child's* side because the parent's holds nothing: a to-many records no
 * foreign key, and the model that owns the column is the one pointing back.
 */
import type { Ir, ModelMeta, RelationMeta } from "@perchjs/core";
import { findModel } from "@perchjs/core";

/**
 * A child that carries its parent's key in a column of its own.
 *
 * The ordinary shape: a to-many one side, a to-one with a foreign key on the
 * other. The column narrows every read and fills every create.
 */
export interface OwnedScope {
  readonly kind: "owned";
  /** The model whose rows the manager lists. */
  readonly model: string;
  /** The column on that model holding the parent's key. */
  readonly foreignKey: string;
  /** The parent column it points at — not always the primary key. */
  readonly parentKey: string;
}

/**
 * A child joined to its parent through a table neither model owns.
 *
 * A many-to-many is a to-many on both sides with a foreign key on neither, so
 * there is no column to narrow by and none to fill. The narrowing names the
 * relation back to the parent instead — and because there is nothing to fill,
 * such a manager attaches and detaches rather than creating and deleting.
 */
export interface JoinedScope {
  readonly kind: "joined";
  readonly model: string;
  /** The to-many on the child pointing back at the parent. */
  readonly back: string;
  /** The parent column the join compares — not always the primary key. */
  readonly parentKey: string;
}

export type RelationScope = OwnedScope | JoinedScope;

export class ScopeError extends Error {}

/**
 * The column that narrows a manager to one parent, or a refusal.
 *
 * Loud, and at boot: a manager whose scope cannot be worked out is a manager
 * that would have to guess, and the wrong guess is not visible on the page it
 * produces. Every other reading of a declaration here gets the same treatment.
 */
export function relationScope(ir: Ir, parent: string, relation: string): RelationScope {
  const owner = findModel(ir, parent);
  if (owner === undefined) {
    throw new ScopeError(`\`${parent}\` is not a model this schema has.`);
  }

  const declared = owner.relations.find((one) => one.name === relation);
  if (declared === undefined) {
    throw new ScopeError(
      `\`${parent}\` has no relation named \`${relation}\`, so there is nothing to manage.`,
    );
  }
  if (!declared.isList) {
    throw new ScopeError(
      `\`${parent}.${relation}\` holds one row, not many. A relation manager lists ` +
        "children; a to-one belongs in the form as a `Select`.",
    );
  }

  const target = findModel(ir, declared.targetModel);
  if (target === undefined) {
    throw new ScopeError(
      `\`${parent}.${relation}\` points at \`${declared.targetModel}\`, which this schema has not.`,
    );
  }

  const back = pointingBack(target, parent, declared);
  if (back.length === 0) {
    // No column on either side is the shape of a join table, not a mistake.
    // Narrowed by the relation instead, and managed with the verbs that shape
    // allows: a row exists on its own and is joined, or it is not.
    const joined = joinedBack(target, parent, declared);
    if (joined.length === 1) {
      const inverse = joined[0] as RelationMeta;
      return {
        kind: "joined",
        model: declared.targetModel,
        back: inverse.name,
        parentKey: primaryKeyOf(owner),
      };
    }
    if (joined.length > 1) {
      const names = joined.map((one) => one.name).join("`, `");
      throw new ScopeError(
        `\`${declared.targetModel}\` is joined to \`${parent}\` more than once — ` +
          `\`${names}\`. Which join narrows \`${relation}\` is not something to ` +
          "guess at.",
      );
    }

    throw new ScopeError(
      `\`${declared.targetModel}\` neither holds a \`${parent}\` nor is joined to ` +
        "one, so its rows cannot be narrowed to a parent at all.",
    );
  }
  if (back.length > 1) {
    // Two ways back is two possible pages, and the wrong one looks exactly like
    // the right one.
    const names = back.map((one) => one.name).join("`, `");
    throw new ScopeError(
      `\`${declared.targetModel}\` points back at \`${parent}\` more than once — ` +
        `\`${names}\`. Which one narrows \`${relation}\` is not something to guess at.`,
    );
  }

  const inverse = back[0] as RelationMeta;
  const foreignKey = inverse.foreignKeyFields[0];
  const parentKey = inverse.referencedFields[0];
  if (foreignKey === undefined || parentKey === undefined) {
    throw new ScopeError(
      `\`${declared.targetModel}.${inverse.name}\` names no column, so it cannot ` +
        "narrow anything. That is what a join table looks like from here.",
    );
  }

  return { kind: "owned", model: declared.targetModel, foreignKey, parentKey };
}

/**
 * The to-many on the child that is the other half of a join.
 *
 * Matched on the name both sides share, like its to-one counterpart: two joins
 * between the same pair of models are told apart by nothing else.
 */
function joinedBack(
  child: ModelMeta,
  parent: string,
  declared: RelationMeta,
): readonly RelationMeta[] {
  return child.relations.filter(
    (one) =>
      one.isList &&
      one.targetModel === parent &&
      one.relationName === declared.relationName,
  );
}

/** What a join compares on the parent's side, there being no column to read. */
function primaryKeyOf(owner: ModelMeta): string {
  return owner.primaryKey.name;
}

/**
 * The to-one relation on the child that is the other half of this one.
 *
 * Matched on the name both sides share rather than on the models alone. Two
 * relations between the same pair — a post's comments and the one it pins —
 * are told apart by nothing else, and matching on the models would refuse both
 * as ambiguous while the schema says exactly which is which.
 *
 * To-one only: a to-many pointing back is the other half of a join, and a join
 * has no column for this to read.
 */
function pointingBack(
  child: ModelMeta,
  parent: string,
  declared: RelationMeta,
): readonly RelationMeta[] {
  return child.relations.filter(
    (one) =>
      !one.isList &&
      one.targetModel === parent &&
      one.relationName === declared.relationName &&
      one.foreignKeyFields.length > 0,
  );
}
