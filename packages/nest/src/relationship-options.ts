/**
 * Loading what a `Select.relationship()` declares.
 *
 * Core says what it needs and cannot fetch it; this answers, because it holds
 * the IR and an adapter. Everything here comes from code — a relation name and
 * a label field written by the developer, never from a request — so a mistake
 * is named out loud rather than swallowed. The silence the trust boundary owes
 * a client is owed to nobody here.
 */
import type {
  Clause,
  DataAdapter,
  FieldMeta,
  ModelMeta,
  Option,
  OptionsRequest,
  RelationMeta,
  Row,
} from "@perchjs/core";
import { findField, findModel, findRelation } from "@perchjs/core";

export type OptionLoader = (request: OptionsRequest) => Promise<readonly Option[]>;

/** What the declaration resolves to, once the IR has been consulted. */
interface Target {
  readonly relation: RelationMeta;
  readonly model: ModelMeta;
  readonly valueField: string;
  readonly labelField: string;
}

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
  const lists = new Map<string, Promise<readonly Option[]>>();
  const singles = new Map<string, Promise<Option | undefined>>();

  return async ({ relationship, limit, selected }) => {
    const key = `${relationship.name}|${relationship.labelField}|${String(limit)}`;
    const options = await memo(lists, key, () => list(relationship, limit));

    // A select carries its value in a URL and gets it back as text, so `2` and
    // `"2"` are the same choice here. Comparing them strictly would fetch a row
    // already on the list and show the reader two of it.
    if (typeof selected !== "string" && typeof selected !== "number") return options;
    // A cleared select holds `""`, which is the absence of a choice and not a
    // key to go looking for. Whitespace counts as cleared for the same reason.
    if (typeof selected === "string" && selected.trim() === "") return options;
    if (options.some((option) => String(option.value) === String(selected)))
      return options;

    // The cap made the list a window, and this row is outside it. Without this
    // the select renders holding a value its own options do not contain, the
    // browser shows whatever came first, and saving rewrites a field the reader
    // never touched.
    const found = await memo(
      singles,
      `${relationship.name}|${relationship.labelField}|${String(selected)}`,
      () => one(relationship, selected),
    );
    return found === undefined ? options : [found, ...options];
  };

  async function list(
    relationship: OptionsRequest["relationship"],
    limit: number,
  ): Promise<readonly Option[]> {
    const target = resolve(relationship);
    const page = await adapter.findMany({
      model: target.relation.targetModel,
      take: limit,
      sort: [{ path: target.labelField, direction: "asc" }],
    });
    return page.rows.flatMap((row) => option(row, target));
  }

  /** The one row the window left out, fetched by the value the form holds. */
  async function one(
    relationship: OptionsRequest["relationship"],
    selected: string | number,
  ): Promise<Option | undefined> {
    const target = resolve(relationship);
    const clause: Clause = {
      path: target.valueField,
      operator: "equals",
      value: coerce(selected, findField(target.model, target.valueField)),
    };
    const page = await adapter.findMany({
      model: target.relation.targetModel,
      clauses: [clause],
      take: 1,
    });
    const row = page.rows[0];
    return row === undefined ? undefined : option(row, target)[0];
  }

  function resolve(relationship: OptionsRequest["relationship"]): Target {
    const owner = expect(
      findModel(adapter.ir(), model),
      `Model \`${model}\` is not in the IR`,
    );
    const relation = expect(
      findRelation(owner, relationship.name),
      `\`${model}\` declares no relation \`${relationship.name}\``,
    );
    // The relation's own shape first: a composite key is wrong whatever the
    // target turns out to be.
    const valueField = single(relation, model);
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

    return {
      relation,
      model: target,
      valueField,
      labelField: relationship.labelField,
    };
  }

  function option(row: Row, target: Target): readonly Option[] {
    const id = row[target.valueField];
    // A row with no key is nothing a reader could pick, and it is the only case
    // here that is the data's doing rather than the declaration's.
    if (id === null || id === undefined) return [];
    if (typeof id !== "string" && typeof id !== "number") {
      throw new Error(
        `\`${target.relation.targetModel}.${target.valueField}\` is not a string ` +
          `or a number, and a select carries its value in a URL`,
      );
    }

    // An empty label leaves the key, which at least identifies the row.
    const label = row[target.labelField];
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
      `\`${target.relation.targetModel}.${target.labelField}\` holds no text, ` +
        `and \`${model}.${target.relation.name}\` labels its options by it`,
    );
  }
}

/**
 * Back to what the column holds.
 *
 * A form returns `"2"` for a key the database stores as `2`, and an Int column
 * compared against text matches nothing — which would read as "that row is
 * gone" and quietly drop the value being edited. Blank never reaches here: an
 * empty select is no selection, and is turned away before the lookup.
 */
function coerce(
  selected: string | number,
  field: FieldMeta | undefined,
): string | number {
  if (typeof selected === "number") return selected;
  // Int only: a BigInt key past 2^53 does not survive the trip through
  // `Number`, and a rounded key finds the wrong row or none at all.
  if (field?.type !== "Int") return selected;
  const parsed = Number(selected);
  return Number.isInteger(parsed) ? parsed : selected;
}

function memo<T>(
  store: Map<string, Promise<T>>,
  key: string,
  make: () => Promise<T>,
): Promise<T> {
  const known = store.get(key);
  if (known !== undefined) return known;
  const asked = make();
  store.set(key, asked);
  return asked;
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
