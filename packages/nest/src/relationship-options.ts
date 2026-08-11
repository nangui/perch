/**
 * Loading what a `Select.relationship()` declares.
 *
 * Core says what it needs and cannot fetch it; this answers, because it holds
 * the IR and an adapter. Everything here comes from code — a relation name and
 * a label field written by the developer, never from a request — so a mistake
 * is named out loud rather than swallowed. The silence the trust boundary owes
 * a client is owed to nobody here.
 */
import type { DataAdapter, Option, OptionsRequest } from "@perchjs/core";
import { findField, findModel, findRelation } from "@perchjs/core";

export type OptionLoader = (request: OptionsRequest) => Promise<readonly Option[]>;

/**
 * One query per relationship field, listing the target rows by label.
 *
 * `optionsLimit` caps it: a relation with 50k rows is not a dropdown, and
 * loading it to render one would be the same mistake as filtering it in the
 * browser. Narrowing past that cap is what `.searchable()` is for.
 */
export function optionLoader(
  data: DataAdapter | null,
  model: string,
): OptionLoader | undefined {
  if (data === null) return undefined;
  const adapter = data;

  // Scoped to one request, and no wider. Admission resolves the same form up
  // to five times before it settles, and the live route resolves it again to
  // answer; every one of those passes wants the same list, and asking the
  // database each time would spend five queries to receive one answer.
  const answered = new Map<string, Promise<readonly Option[]>>();

  return async ({ relationship, limit }) => {
    const key = `${relationship.name}|${relationship.labelField}|${String(limit)}`;
    const known = answered.get(key);
    if (known !== undefined) return known;
    const asked = load({ relationship, limit });
    answered.set(key, asked);
    return asked;
  };

  async function load({
    relationship,
    limit,
  }: OptionsRequest): Promise<readonly Option[]> {
    const owner = expect(
      findModel(adapter.ir(), model),
      `Model \`${model}\` is not in the IR`,
    );
    const relation = expect(
      findRelation(owner, relationship.name),
      `\`${model}\` declares no relation \`${relationship.name}\``,
    );

    const value = single(relation, model);
    const target = expect(
      findModel(adapter.ir(), relation.targetModel),
      `Model \`${relation.targetModel}\` is not in the IR`,
    );
    // Checked before the query rather than after: sorting on a column that is
    // not there fails in the database, and that error names the driver rather
    // than the line that has the typo in it.
    expect(
      findField(target, relationship.labelField),
      `\`${relation.targetModel}\` has no field \`${relationship.labelField}\`, ` +
        `which \`${model}.${relationship.name}\` labels its options by`,
    );

    const page = await adapter.findMany({
      model: relation.targetModel,
      take: limit,
      sort: [{ path: relationship.labelField, direction: "asc" }],
    });

    return page.rows.flatMap((row) => {
      const id = row[value];
      // A row with no key is nothing a reader could pick, and it is the only
      // case here that is the data's doing rather than the declaration's.
      if (id === null || id === undefined) return [];
      if (typeof id !== "string" && typeof id !== "number") {
        throw new Error(
          `\`${relation.targetModel}.${value}\` is not a string or a number, ` +
            `and a select carries its value in a URL`,
        );
      }

      // An empty label leaves the key, which at least identifies the row; a
      // label that is not text at all means the declaration points at a Json
      // column or a relation, and `[object Object]` in a dropdown is not an
      // answer to give a reader.
      const label = row[relationship.labelField];
      if (label === null || label === undefined)
        return [{ value: id, label: String(id) }];
      // Named rather than excluded: `symbol` throws when stringified and a
      // function prints its own source, so the accepted shapes are listed.
      if (typeof label === "string") return [{ value: id, label }];
      if (
        typeof label === "number" ||
        typeof label === "boolean" ||
        typeof label === "bigint"
      ) {
        return [{ value: id, label: String(label) }];
      }
      throw new Error(
        `\`${relation.targetModel}.${relationship.labelField}\` holds no text, ` +
          `and \`${model}.${relationship.name}\` labels its options by it`,
      );
    });
  }
}

/** A composite key has no single value a `<select>` could carry. */
function single(
  relation: { referencedFields: readonly string[]; name: string },
  model: string,
): string {
  const [first, ...rest] = relation.referencedFields;
  if (first === undefined || rest.length > 0) {
    throw new Error(
      `\`${model}.${relation.name}\` points at ${String(relation.referencedFields.length)} ` +
        `fields, and a select carries one value`,
    );
  }
  return first;
}

function expect<T>(found: T | undefined, message: string): T {
  if (found === undefined) throw new Error(message);
  return found;
}

/** Spreadable at a `resolveSchema` call: nothing when there is no adapter. */
export function withOptions(
  data: DataAdapter | null,
  model: string,
): { loadOptions?: OptionLoader } {
  const load = optionLoader(data, model);
  return load === undefined ? {} : { loadOptions: load };
}
