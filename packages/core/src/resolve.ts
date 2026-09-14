/**
 * The resolution cycle. Seven stages and exactly one loop.
 *
 * The loop is bounded at five passes and exits early when a pass changes
 * nothing. Beyond that it throws naming the fields involved, rather than
 * overflowing the stack somewhere a reader cannot connect to their `set()` call.
 */
import type { Component, Operation, Resolvable, ResolverContext } from "./component.js";
import { isResolver } from "./component.js";
import type { Id, RelationWrite, Row, WriteTree } from "./data-adapter.js";
import { Entry } from "./entry.js";
import { Layout, Schema } from "./layout.js";
import { Image, Prime } from "./prime.js";
import { RepeatableEntry } from "./entries/repeatable-entry.js";
import { safeHref, TextEntry } from "./entries/text-entry.js";
import { IconEntry, markFor } from "./entries/icon-entry.js";
import { ImageEntry } from "./entries/image-entry.js";
import { KeyValueEntry } from "./entries/key-value-entry.js";
import { pairsOf } from "./pairs.js";
import { fileAddress } from "./file-address.js";
import type { ResolvedFlags } from "./field.js";
import { Field, isDehydrated } from "./field.js";
import { FileUpload } from "./fields/file-upload.js";
import { Placeholder } from "./fields/placeholder.js";
import { Repeater } from "./fields/repeater.js";
import { Select } from "./fields/select.js";
import type { Option, OptionsInput } from "./option.js";
import { readPath } from "./path.js";
import { normaliseOptions } from "./option.js";

export type FormState = Readonly<Record<string, unknown>>;
export type FieldErrors = Readonly<Record<string, string>>;

/** Node id → the state paths its resolvers read on the last pass. */
export type DependencyTrace = ReadonlyMap<string, ReadonlySet<string>>;

/** What a `.relationship()` needs loaded, for whoever can run a query. */
export interface OptionsRequest {
  /** The relation on the model being edited, and the field to label rows by. */
  readonly relationship: { readonly name: string; readonly labelField: string };
  /** At most this many rows: a relation with 50k rows is not a dropdown. */
  readonly limit: number;
  /**
   * What the field holds right now, if anything.
   *
   * The cap makes the list a window, and the row being edited may point
   * outside it. A select whose value is absent from its own options shows
   * whatever came first instead, and saving the form then rewrites a field
   * nobody touched — so the loader is told which value it must not omit.
   */
  readonly selected?: unknown;
  /**
   * What the reader typed, when the field was declared `.searchable()`.
   *
   * Absent on every render: a form asks for the window, not for a match. Only
   * the route that exists to answer typing sets it, and only for a field that
   * said it could be searched — otherwise a term is a way to ask which rows a
   * relation holds, one letter at a time.
   *
   * Never asked alongside `selected`. They are two different questions: one
   * wants the window and the value being edited kept in it, the other wants
   * what matched and nothing else.
   */
  readonly term?: string;
}

export interface ResolveOptions {
  readonly operation: Operation;
  readonly user?: unknown;
  readonly record?: Readonly<Record<string, unknown>>;
  /**
   * Loads what a `.relationship()` declares.
   *
   * Core cannot query, so it says what it needs and the caller — which holds
   * the IR and an adapter — answers. Every path that renders a form supplies
   * this; without it a relationship select resolves to no options at all,
   * which is a dropdown a reader cannot choose from.
   */
  readonly loadOptions?: (request: OptionsRequest) => Promise<readonly Option[]>;
  /**
   * Where a stored file can be fetched.
   *
   * A key is not an address: the adapter decides what a key resolves to, and
   * the domain has never heard of either. So the cycle asks, the same way it
   * asks for a relationship's options, and a caller that cannot answer means a
   * field with a file and no picture rather than a broken one.
   */
  readonly fileUrl?: (disk: string, key: string) => string | undefined;
  /** What the client changed. Absent means a first load: resolve everything. */
  readonly dirtyPath?: string;
  /**
   * The previous result for this form. With it and a `dirtyPath`, only the
   * nodes that read the changed path run their resolvers again; every other
   * node is carried forward, so the result stays complete either way.
   */
  readonly previous?: ResolveResult;
}

export interface ResolvedNode {
  readonly id: string;
  readonly component: Component;
  /** Where its value lives. `items.r1.label` for a field inside a row. */
  readonly path: string;
  /**
   * Effective, which is to say inherited: what a layout says applies to what it
   * holds. A field inside a hidden section is hidden, and one inside a disabled
   * group is disabled, whatever it says about itself.
   */
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  /**
   * What this node's own resolvers answered, before anything above it applied.
   *
   * Kept apart because the two are needed at different moments: the effective
   * flags are what every reader wants, and these are what a later pass reuses.
   * A pass that carried the effective ones would keep a child hidden after the
   * section above it came back — the child's own reads never changed, so
   * nothing would recompute it.
   */
  readonly own: { readonly visible: boolean; readonly disabled: boolean };
  readonly label?: string;
  readonly helperText?: string;
  readonly hint?: string;
  readonly hintIcon?: string;
  readonly extraAttributes?: Readonly<Record<string, string>>;
  readonly autofocus?: boolean;
  /** A layout's own line of prose, already resolved. */
  readonly description?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  /** What a `Placeholder` shows. Resolved, so it may read other fields. */
  readonly content?: string;
  /**
   * What an `Entry` found in the record, read at this moment and never put in
   * the state map. An entry the tree does not carry has no value read for it,
   * which is what keeps one authorization removed out of the payload.
   */
  readonly value?: unknown;
  /**
   * Which of the panel's colours an entry takes.
   *
   * Resolved rather than sent as a prop, because it may be chosen from the
   * value — and the wire format carries no functions.
   */
  readonly tone?: string;
  /** The mark an `IconEntry` resolved to, by name. Decided here, never drawn from a rule the client holds. */
  readonly mark?: string;
  /** The addresses an `ImageEntry` resolved to, already read. */
  readonly pictures?: readonly string[];
  /**
   * The rows a `KeyValueEntry` read out of a `Json` column.
   *
   * Absent where the column held something that is not a flat object — which
   * is not the same as absent because it held nothing, and the entry's `value`
   * is what tells the two apart.
   */
  readonly pairs?: readonly (readonly [string, string])[];
  /** Where an entry links to, already built and already checked. */
  readonly href?: string;
  /** Where a `FileUpload`'s stored file can be fetched, if it has one. */
  readonly previewUrl?: string;
  /** Whether this select offers to make the row that is not in the list yet. */
  readonly createsOption?: boolean;
  /** What each of a repeater's rows is called, by row key. */
  readonly itemLabels?: Readonly<Record<string, string>>;
  readonly options?: readonly Option[];
  readonly children: readonly ResolvedNode[];
}

export interface ResolveResult {
  readonly state: FormState;
  /** The tree, in the shape the renderer walks. */
  readonly root: ResolvedNode;
  /** The same nodes, flat, for lookup by id. */
  readonly nodes: readonly ResolvedNode[];
  readonly errors: FieldErrors;
  readonly trace: DependencyTrace;
  readonly passes: number;
  /** Feeds the counter targeted re-evaluation is asserted on. */
  readonly resolverCalls: number;
}

const MAX_PASSES = 5;

export class ResolutionCycleError extends Error {
  /** Declared rather than a parameter property: `erasableSyntaxOnly` is on. */
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(
      `State did not settle after ${String(MAX_PASSES)} passes. ` +
        `Fields still changing: ${fields.join(", ")}.`,
    );
    this.name = "ResolutionCycleError";
    this.fields = fields;
  }
}

export async function resolveSchema(
  root: Component,
  clientState: FormState,
  options: ResolveOptions,
): Promise<ResolveResult> {
  // A repeater's list first, and before the walk, because the walk builds the
  // rows from it. Nothing else in the cycle has an order that matters; this one
  // does, and getting it wrong is not subtle: the form shows no rows, so the
  // client sends none, so the save reads that as "delete them all".
  const seeded = seedRows(root, clientState, options);

  // With the record, because a repeatable entry's rows come from it rather
  // than from anything a client sent.
  const tree = walk(root, seeded, "", 0, "", options.record);
  const flatTree = flattenWalked(tree);
  const state: Record<string, unknown> = { ...seeded };

  // Normalised before anything reads it, so the cycle sees one shape whether
  // the value came from the row or from the last round trip.
  for (const { component, path } of flatTree) {
    if (!(component instanceof Field)) continue;
    if (path === "" || !(path in state)) continue;
    state[path] = component.fromStorage(state[path]);
  }
  const trace = new Map<string, Set<string>>(
    [...(options.previous?.trace ?? [])].map(([id, paths]) => [id, new Set(paths)]),
  );
  const carried = new Map(options.previous?.nodes.map((n) => [n.id, n]) ?? []);
  const counter = { calls: 0 };

  // HYDRATE — a first load fills the blanks from `default()`.
  if (options.dirtyPath === undefined) {
    for (const { id, component, path } of flatTree) {
      if (!(component instanceof Field)) continue;
      if (path === "" || path in state) continue;

      // The row first, for a field no client is allowed to echo back. On an
      // edit its stored value is the server's own answer, and `default()` is
      // for the create where there is no row to ask.
      if (
        !component.acceptsClient &&
        options.record !== undefined &&
        path in options.record
      ) {
        // Through the same normalisation as anything else arriving from the
        // row. This branch fills after the pass that normalises, so without
        // asking the field again a server-owned column would keep the driver's
        // shape all the way to the renderer. No field is both server-owned and
        // converting today, so nothing observes this — it is here because the
        // two entry paths have to agree, not because a test caught it.
        state[path] = component.fromStorage(options.record[path]);
        continue;
      }

      const fallback = component.state.defaultValue;
      if (fallback === undefined) continue;
      const reads = new Set<string>();
      state[path] = await read(fallback, context(state, options, reads));
      counter.calls += 1;
      trace.set(id, reads);
    }
  }

  const full = options.dirtyPath === undefined || options.previous === undefined;
  let changed = new Set<string>(
    options.dirtyPath === undefined ? [] : [options.dirtyPath],
  );
  let resolved: ResolvedNode | undefined;
  let passes = 0;

  while (passes < MAX_PASSES) {
    passes += 1;

    // HOOKS — a hook may `set()` other paths, which become dirty in turn.
    const touched = new Set<string>();
    for (const { component, path } of flatTree) {
      if (!(component instanceof Field)) continue;
      const hook = component.state.afterStateUpdated;
      if (hook === undefined || path === "" || !changed.has(path)) continue;
      await hook({
        ...context(state, options, new Set()),
        set: (path, value) => {
          if (state[path] === value) return;
          state[path] = value;
          touched.add(path);
        },
        value: state[path],
      });
    }

    // RESOLVE — every node, but resolvers run only where they can have changed.
    resolved = await resolveNode(tree, {
      state,
      options,
      trace,
      carried,
      changed,
      full: full || passes > 1,
      counter,
    });

    if (touched.size === 0) break;
    changed = touched;
  }

  if (passes >= MAX_PASSES && changed.size > 0) {
    throw new ResolutionCycleError([...changed]);
  }
  if (resolved === undefined) throw new Error("The resolution loop did not run.");

  // INHERIT — what a layout says applies to what it holds.
  //
  // Last, and over the whole tree, because resolution runs children first and
  // this runs the other way. Recomputed from each node's own answer every time
  // rather than folded in place, so a node carried from the last round trip
  // cannot bring a stale one with it.
  //
  // Without this the flags stopped at the node that declared them: a field
  // inside a hidden section never reached an honest browser — the payload drops
  // the whole subtree — and a forged state naming its path was admitted,
  // validated and written.
  resolved = inherit(resolved, true, false);

  const nodes = flattenResolved(resolved);

  // PRUNE — an invisible field leaves no value behind.
  const pruned = new Set(
    nodes
      .filter((n) => n.component instanceof Field && !n.visible)
      .map((n) => (n.component as Field).name),
  );
  const finalState = Object.fromEntries(
    Object.entries(state).filter(([path]) => !pruned.has(path)),
  );

  // VALIDATE — visible fields only.
  const errors = await validate(nodes, finalState, options);

  return {
    state: finalState,
    root: resolved,
    nodes,
    errors,
    trace,
    passes,
    resolverCalls: counter.calls,
  };
}

/**
 * What is written, from what survived.
 *
 * Walks the tree rather than the flat node list, because a repeater's rows are
 * its children and grouping them is the whole job. Everything else is what it
 * always was: `isDehydrated` decides, `dehydrateStateUsing` shapes.
 */
export interface DehydratedWrite extends WriteTree {
  /** Always present, so a caller reads an answer rather than an absence. */
  readonly set: Readonly<Record<string, unknown>>;
}

export function dehydrate(
  result: ResolveResult,
  options: ResolveOptions,
): DehydratedWrite {
  const written = branch(result.root.children, result, options, options.record);
  return { ...written, set: written.set ?? {} };
}

function branch(
  nodes: readonly ResolvedNode[],
  result: ResolveResult,
  options: ResolveOptions,
  record: Row | undefined,
): WriteTree {
  const set: Record<string, unknown> = {};
  const relations: Record<string, RelationWrite> = {};

  for (const node of nodes) {
    const field = node.component;
    if (!(field instanceof Field)) {
      // A layout holds fields without being one, so its children belong to
      // whatever it sits in rather than to it.
      const inner = branch(node.children, result, options, record);
      Object.assign(set, inner.set);
      Object.assign(relations, inner.relations);
      continue;
    }

    if (field instanceof Repeater) {
      const written = rowsOf(field, node, result, options, record);
      if (written !== undefined)
        relations[field.state.relationship ?? field.name] = written;
      continue;
    }

    let value = field.toStorage(result.state[node.path]);
    const transform = field.state.dehydrateStateUsing;
    if (transform !== undefined) {
      value = transform(value, context(result.state, options, new Set()));
    }
    if (!isDehydrated(field, flagsOf(node), value)) continue;
    // A field the form never carried a value for is absent from the write, not
    // present and empty. `null` is how a column is cleared; `undefined` would
    // leave every adapter to guess which of the two was meant.
    if (value === undefined) continue;
    set[field.name] = value;
  }

  // `set` always, even empty: a write of no columns is a write of no columns,
  // and a caller that has to tell that from "no write at all" would be reading
  // an absence rather than an answer. `relations` only where there are some.
  return {
    set,
    ...(Object.keys(relations).length === 0 ? {} : { relations }),
  };
}

/**
 * A repeater's rows, as creates, updates and deletes.
 *
 * What a key means is decided here, and by the record rather than by the key:
 * the children that were actually loaded are the only ones an update can
 * reach, and every other key is a create whatever it looks like. A client
 * inventing a key that resembles somebody else's id makes a row; it cannot
 * touch one.
 *
 * A child the record has and the list does not is gone, because the list is
 * the membership.
 */
function rowsOf(
  field: Repeater,
  node: ResolvedNode,
  result: ResolveResult,
  options: ResolveOptions,
  record: Row | undefined,
): RelationWrite | undefined {
  if (!isDehydrated(field, flagsOf(node), result.state[node.path])) return undefined;

  const existing = loadedRows(record, field);
  const create: WriteTree[] = [];
  const update: { id: Id; data: WriteTree }[] = [];
  const kept = new Set<string>();

  // Grouped by the key in the path, which is what the walk put there. The
  // walk flattens the rows — its children are every field of every row — so
  // the grouping happens here or a row with two fields becomes two rows.
  const byRow = new Map<string, ResolvedNode[]>();
  for (const child of node.children) {
    const key = rowKeyOf(node.path, child.path);
    if (key === undefined) continue;
    const group = byRow.get(key);
    if (group === undefined) byRow.set(key, [child]);
    else group.push(child);
  }

  for (const [key, fields] of byRow) {
    const data = branch(fields, result, options, existing.get(key));
    const id = existing.get(key)?.[field.state.rowKey ?? DEFAULT_ROW_KEY];
    if (id === undefined) {
      // A row somebody added and never filled in. Writing it makes a child of
      // nothing, which the reader then has to find and delete — so pressing
      // "add" and changing your mind costs nothing, which is what it should.
      if (isEmptyRow(data)) continue;
      create.push(data);
      continue;
    }
    kept.add(key);
    update.push({ id: id as Id, data });
  }

  const remove = [...existing]
    .filter(([key]) => !kept.has(key))
    .map(([, row]) => row[field.state.rowKey ?? DEFAULT_ROW_KEY] as Id);

  return {
    ...(create.length === 0 ? {} : { create }),
    ...(update.length === 0 ? {} : { update }),
    ...(remove.length === 0 ? {} : { delete: remove }),
  };
}

/** Where a loaded child keeps its key, unless the repeater says otherwise. */
/**
 * What a repeater's rows are addressed by unless `.rowKey()` says otherwise.
 *
 * Exported because the upload commit reads a loaded row by the same key when it
 * drops the attachment of a row that was deleted. Two spellings of "id" in two
 * packages is one rename away from a file nobody removes.
 */
export const DEFAULT_ROW_KEY = "id";

/**
 * The children the record actually carried, by the key they are addressed as.
 *
 * The only rows an update may reach. A record with nothing loaded for the
 * relation has no updatable rows, which makes every key a create — the honest
 * reading of "the server never saw one".
 */
function loadedRows(record: Row | undefined, field: Repeater): Map<string, Row> {
  const relation = field.state.relationship ?? field.name;
  const held = record?.[relation];
  if (!Array.isArray(held)) return new Map();

  const key = field.state.rowKey ?? DEFAULT_ROW_KEY;
  const rows = new Map<string, Row>();
  for (const row of held) {
    if (typeof row !== "object" || row === null) continue;
    const id = (row as Row)[key];
    if (typeof id !== "string" && typeof id !== "number") continue;
    rows.set(String(id), row as Row);
  }

  // Rows came back — and there were some — and not one of them has the key an
  // update is addressed by. An empty relation is not that: it is a record with
  // no children, which is ordinary.
  //
  // Left alone this is silent: every row becomes a create, so the save
  // duplicates the relation instead of editing it, once per save, for as long
  // as nobody counts the rows.
  if (rows.size === 0 && held.length > 0) {
    throw new Error(
      `\`${field.name}\` writes \`${relation}\`, whose rows have no ` +
        `\`${key}\`. Name the key with \`.rowKey()\`, or an update would be ` +
        `written as a create and duplicate every row it meant to edit.`,
    );
  }
  return rows;
}

/**
 * One label per row, resolved in that row's own terms.
 *
 * The reads are recorded against the repeater's node, so a label that follows
 * a field is recomputed when that field changes — the same targeting every
 * other resolver gets, at the granularity the tree actually has.
 */
async function rowLabels(
  field: Repeater,
  node: WalkedNode,
  ctx: PassContext,
  count: () => void,
): Promise<Record<string, string>> {
  const labels: Record<string, string> = {};
  for (const key of rowKeys(ctx.state[node.path], field.state.maxItems)) {
    const reads = new Set<string>();
    const scoped = scopedContext(ctx, `${node.path}.${key}.`, reads);
    const label = await value(field.state.itemLabel, scoped, undefined, count);
    if (typeof label === "string" && label !== "") labels[key] = label;
    for (const read of reads) ctx.trace.get(node.id)?.add(read);
  }
  return labels;
}

/**
 * A context that reads inside one row.
 *
 * `get("body")` becomes `get("items.r1.body")`. What it records is still the
 * absolute path, because that is what the dependency trace and the client's
 * dirty path both speak.
 */
function scopedContext(
  ctx: PassContext,
  prefix: string,
  reads: Set<string>,
): ResolverContext {
  const inner = context(ctx.state, ctx.options, reads);
  return { ...inner, get: (path) => inner.get(`${prefix}${path}`) };
}

/**
 * A row with nothing in it, at any depth.
 *
 * Nothing set and no relation asked for. A row holding only another repeater
 * that is itself empty is empty too, which is why this recurses rather than
 * counting keys.
 */
function isEmptyRow(data: WriteTree): boolean {
  if (Object.keys(data.set ?? {}).length > 0) return false;
  for (const write of Object.values(data.relations ?? {})) {
    if (Object.keys(write).length > 0) return false;
  }
  return true;
}

/** `items.r1.label` under `items` is `r1`. */
function rowKeyOf(parent: string, path: string): string | undefined {
  if (!path.startsWith(`${parent}.`)) return undefined;
  const rest = path.slice(parent.length + 1);
  const dot = rest.indexOf(".");
  return dot === -1 ? undefined : rest.slice(0, dot);
}

/**
 * The rows a record already has, where the client said nothing about them.
 *
 * On a first load there is no list, and without one the walk builds no rows —
 * so the form would show none of the children the record carries, the client
 * would send none back, and the save would read that as an instruction to
 * delete every one of them.
 *
 * Only where the client is silent, and that is judged at each list rather than
 * once at the top: a client that sent the outer rows may still have said
 * nothing about the rows inside them. Once it has sent a list, that list is
 * what the reader is looking at, and an empty one means they removed the rows.
 */
function seedRows(
  root: Component,
  clientState: FormState,
  options: ResolveOptions,
): FormState {
  const record = options.record;
  if (record === undefined) return clientState;

  const seeded: Record<string, unknown> = { ...clientState };
  seedInto(root, "", record, seeded);
  return seeded;
}

/** One level of rows, and then the rows each of them holds. */
function seedInto(
  schema: Component,
  prefix: string,
  record: Row,
  seeded: Record<string, unknown>,
): void {
  for (const repeater of repeatersIn(schema)) {
    const path = `${prefix}${repeater.name}`;
    const held = record[repeater.state.relationship ?? repeater.name];
    if (!Array.isArray(held)) continue;

    // A list the client sent is the reader's; the rows it left out are rows
    // they removed, and seeding those back would put state on a row the tree
    // builds no node for.
    const sent = seeded[path];
    const kept = Array.isArray(sent) ? new Set(sent.map(String)) : undefined;

    const key = repeater.state.rowKey ?? DEFAULT_ROW_KEY;
    const keys: string[] = [];
    for (const row of held) {
      if (typeof row !== "object" || row === null) continue;
      const id = (row as Row)[key];
      if (typeof id !== "string" && typeof id !== "number") continue;
      keys.push(String(id));
      if (kept !== undefined && !kept.has(String(id))) continue;

      // Its own rows first: they turn this row's relation into a list of keys,
      // which the copy below then leaves alone. The other way round it would
      // copy the loaded rows themselves, and a list of rows is not a list.
      const at = `${path}.${String(id)}`;
      seedInto(repeater, `${at}.`, row as Row, seeded);
      for (const [name, value] of Object.entries(row as Row)) {
        if (!(`${at}.${name}` in seeded)) seeded[`${at}.${name}`] = value;
      }
    }
    if (kept === undefined) seeded[path] = keys;
  }
}

/** The repeaters at one level: a layout is transparent, a repeater is the end. */
function repeatersIn(component: Component): readonly Repeater[] {
  return component.children.flatMap((child) =>
    child instanceof Repeater ? [child] : repeatersIn(child),
  );
}

interface WalkedNode {
  readonly id: string;
  readonly component: Component;
  /**
   * Where this node's value lives in the state. Empty for a layout.
   *
   * A field's own name for everything declared once. Inside a repeater it is
   * the row's key that makes it unique — `items.r1.label` — because the same
   * declaration stands for a field in every row.
   */
  readonly path: string;
  /**
   * Which record this node's entries read.
   *
   * Absent everywhere but inside a `RepeatableEntry`, where it is the row. An
   * entry resolves against the record it was given, and the whole difference
   * between a repeatable entry and an entry somebody put in a form's repeater
   * is that this one hands each row its own.
   */
  readonly record?: Row;
  readonly children: readonly WalkedNode[];
}

/**
 * The tree as it stands for this state.
 *
 * Static everywhere except a repeater, which has as many rows as the state
 * says. Its own value is read here and nowhere else, which is what makes the
 * ordering the record describes real: the list has to have been admitted for
 * the paths under it to exist at all, and admission runs in waves for exactly
 * this kind of reason.
 */
function walk(
  component: Component,
  state: FormState,
  prefix = "",
  index = 0,
  under = "",
  record?: Row,
  row = "",
): WalkedNode {
  const own =
    component instanceof Field && component.name !== ""
      ? `${under}${component.name}`
      : "";
  // A key is written once and every row is walked from that one declaration,
  // so inside a repeat it has to be told apart by the row it is in. `row` is
  // the row's own identity, not its position, so the key still survives a
  // reorder — and outside a repeat it is empty and the key is the id, which is
  // what makes writing one worth anything.
  const id =
    component.state.key === undefined
      ? own !== ""
        ? own
        : `${prefix}${String(index)}`
      : `${row}${component.state.key}`;

  // One group per row the record carried, in the order it carried them. A
  // `Schema` rather than something invented for this: a row is a set of entries
  // read together, which is what a layout already is and already draws.
  if (component instanceof RepeatableEntry) {
    const rows = carriedRows(record, component.recordPath);
    // Built once, not once per row. `Schema.make` runs every `configureUsing`
    // registered against it, and a page of twenty notes ran them twenty times
    // to produce twenty identical objects.
    const shape = Schema.make(component.children);
    return {
      id,
      component,
      path: "",
      ...(record === undefined ? {} : { record }),
      children: rows.map((held, at) =>
        walk(
          shape,
          state,
          `${id}/${String(at)}/`,
          at,
          under,
          held,
          `${id}/${String(at)}/`,
        ),
      ),
    };
  }

  if (component instanceof Repeater && own !== "") {
    return {
      id,
      component,
      path: own,
      children: rowKeys(state[own], component.state.maxItems).flatMap((key) =>
        component.children.map((child, i) =>
          walk(
            child,
            state,
            `${id}/${key}/`,
            i,
            `${own}.${key}.`,
            record,
            `${id}/${key}/`,
          ),
        ),
      ),
    };
  }

  return {
    id,
    component,
    path: own,
    ...(record === undefined ? {} : { record }),
    children: component.children.map((child, i) =>
      walk(child, state, `${id}/`, i, under, record, row),
    ),
  };
}

/** The rows a record carried for a relation, and nothing invented for it. */
function carriedRows(record: Row | undefined, relation: string): readonly Row[] {
  const held = record?.[relation];
  if (!Array.isArray(held)) return [];
  return held.filter((row): row is Row => typeof row === "object" && row !== null);
}

/**
 * The keys a repeater's value names, and nothing else.
 *
 * Read defensively rather than trusted: this runs on the state as it is, and
 * the boundary needs a tree to judge against, so this is what builds it — which
 * puts it before the judging rather than after.
 *
 * `maxItems` is applied here as well as at the boundary, and not because the
 * boundary is unreliable. It is because the guarantee should not depend on
 * which caller resolved: `admit` resolves an empty state first and so never
 * hands this an unjudged list, but that is its discipline, not this function's,
 * and a caller who resolves raw client state is one refactor away.
 */
function rowKeys(value: unknown, maxItems: number | undefined): readonly string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const key of value) {
    if (maxItems !== undefined && seen.size >= maxItems) break;
    if (typeof key === "string" && key !== "" && !seen.has(key)) seen.add(key);
  }
  return [...seen];
}

interface PassContext {
  readonly state: FormState;
  readonly options: ResolveOptions;
  readonly trace: Map<string, Set<string>>;
  readonly carried: ReadonlyMap<string, ResolvedNode>;
  readonly changed: ReadonlySet<string>;
  readonly full: boolean;
  readonly counter: { calls: number };
}

/**
 * Always returns a node, so the tree stays whole. What a targeted pass skips is
 * the resolver call, not the node — dropping it would take the field out of
 * pruning and out of validation, which is how a hidden value survives a patch.
 */
async function resolveNode(node: WalkedNode, ctx: PassContext): Promise<ResolvedNode> {
  const children = await Promise.all(node.children.map((c) => resolveNode(c, ctx)));
  const previous = ctx.carried.get(node.id);
  const lastReads = ctx.trace.get(node.id);
  if (
    previous !== undefined &&
    !ctx.full &&
    lastReads !== undefined &&
    !intersects(lastReads, ctx.changed)
  ) {
    return { ...previous, children };
  }

  const { component } = node;
  const reads = new Set<string>();
  const rc = context(ctx.state, ctx.options, reads);
  const before = ctx.counter.calls;
  const count = (): void => {
    ctx.counter.calls += 1;
  };

  const visible = await value(component.state.visible, rc, true, count);
  const disabled = await value(component.state.disabled, rc, false, count);
  const readOnly =
    component instanceof Field
      ? await value(component.state.readOnly, rc, false, count)
      : false;
  const label = await value(component.state.label, rc, undefined, count);
  const helperText = await value(component.state.helperText, rc, undefined, count);
  const hint = await value(component.state.hint, rc, undefined, count);
  // A layout's own line of prose. Resolved rather than copied from the state
  // for the reason every resolvable is: copying one ships the function's source
  // or nothing at all.
  const description =
    component instanceof Layout
      ? await value(component.state.description, rc, undefined, count)
      : undefined;
  // Resolved every pass, not hydrated once: a computed line that tracks another
  // field has to be recomputed when that field changes, and `default()` fills a
  // blank exactly once.
  // One label per row, each resolved against its own row: a resolver written
  // `get("body")` means this row's body, because the key that would complete
  // the absolute path is invented when the row is added.
  const itemLabels =
    component instanceof Repeater && component.state.itemLabel !== undefined
      ? await rowLabels(component, node, ctx, count)
      : undefined;

  // Both hold something to read and neither is written. A placeholder is a
  // field with a label above it; a prime is content between the controls.
  const said =
    component instanceof Placeholder || component instanceof Prime
      ? await value(component.state.content, rc, undefined, count)
      : undefined;
  // An image's content is an address, and it is checked here for the reason an
  // entry's is: the source accepts a resolver, so it can be built from a stored
  // value, and a stored value does not reach an attribute unchecked. Refused,
  // it is nothing at all rather than an `<img>` pointing somewhere unread.
  const content = component instanceof Image ? safeHref(said) : said;

  // From the record, by the path the entry names, and not from the state map.
  // `readPath` is the reader a relation column already uses: it stops at an
  // intermediate null rather than throwing, because a customer with no address
  // is ordinary and a page that dies over it is not.
  // The record this node was walked against, which inside a repeatable entry is
  // the row rather than the thing that holds it.
  const from = node.record ?? ctx.options.record;
  const entryValue =
    component instanceof Entry && !(component instanceof RepeatableEntry)
      ? readPath(from, component.recordPath)
      : undefined;

  // From the value it decorates, on the server. The map from a value to a
  // meaning is a rule somebody wrote, and the browser cannot know it.
  const declaredTone =
    component instanceof TextEntry
      ? component.state.color
      : component instanceof IconEntry
        ? component.state.colors
        : undefined;
  const tone =
    typeof declaredTone === "function" ? declaredTone(entryValue) : declaredTone;

  // The same reasoning, for which shape it is. A browser handed the map would
  // be a browser deciding what a row means.
  const mark =
    component instanceof IconEntry ? markFor(component, entryValue) : undefined;

  // Built here and checked here. A stored value put straight into an `href` is
  // how `javascript:` becomes somebody else's script, and the browser is not
  // the place to find that out.
  const declaredUrl = component instanceof TextEntry ? component.state.url : undefined;
  const href =
    declaredUrl === undefined
      ? undefined
      : safeHref(declaredUrl === true ? entryValue : declaredUrl(entryValue));

  // Resolved here rather than copied from the state: both accept a resolver,
  // and a `required` the server enforces but never sends is an error the user
  // could not have seen coming.
  const placeholder =
    component instanceof Field || component instanceof Entry
      ? await value(component.state.placeholder, rc, undefined, count)
      : undefined;
  const required =
    component instanceof Field
      ? await value(component.state.required, rc, false, count)
      : false;

  // A stored key, not an address: only the adapter can turn one into the other,
  // so a caller that cannot answer means no picture rather than a broken one.
  //
  // Resolved from the row and only while the form still holds what the row
  // does. The value on a form is the client's to set, and minting an address
  // for a key it chose asks the server to vouch for somewhere it was pointed —
  // with an adapter that signs URLs, that is a signature for any object in the
  // bucket. A file just chosen is previewed by the browser, from the file it
  // already has in hand.
  const stored =
    component instanceof FileUpload ? ctx.options.record?.[node.path] : undefined;
  const previewUrl =
    component instanceof FileUpload &&
    ctx.options.fileUrl !== undefined &&
    typeof stored === "string" &&
    stored !== "" &&
    ctx.state[node.path] === stored
      ? ctx.options.fileUrl(component.state.disk, stored)
      : undefined;

  // Minted here and read here, from the row. A list becomes a list of
  // addresses and a key that no host can answer for drops out of it, so what
  // reaches an `src` has been looked at by something that is allowed to say no.
  const pictures =
    component instanceof ImageEntry
      ? (Array.isArray(entryValue) ? entryValue : [entryValue])
          .map((one) => fileAddress(one, component.state.disk, ctx.options.fileUrl))
          .filter((one): one is string => one !== undefined)
      : undefined;

  // Read here, because what counts as a row in a shape nobody chose is a rule
  // somebody wrote. Absent for a column holding something that is not a flat
  // object: there are no rows in an array or a number, and the entry falls
  // back to showing the value as the JSON it is rather than as an empty table.
  const pairs = component instanceof KeyValueEntry ? pairsOf(entryValue) : undefined;

  // The fact, not the form. What the dialog draws is fetched when it opens, so
  // a page that merely might open one carries a boolean rather than a schema
  // resolved for a reader who never asked for it.
  const createsOption =
    component instanceof Select && component.state.createOptionForm !== undefined
      ? true
      : undefined;

  let options: readonly Option[] | undefined;
  const declared = component instanceof Field ? component.declaredOptions : undefined;
  if (declared !== undefined) {
    const raw = await value<OptionsInput | undefined>(declared, rc, undefined, count);
    options = raw === undefined ? undefined : normaliseOptions(raw);
  } else if (
    component instanceof Select &&
    component.state.relationship !== undefined &&
    ctx.options.loadOptions !== undefined
  ) {
    // A declared list wins over a relation: a field that says both meant the
    // list, and querying anyway would spend a round trip to be overruled.
    const selected = ctx.state[node.path];
    options = await ctx.options.loadOptions({
      relationship: component.state.relationship,
      limit: component.state.optionsLimit,
      ...(selected === undefined || selected === null ? {} : { selected }),
    });
  }

  if (ctx.counter.calls > before) ctx.trace.set(node.id, reads);

  return {
    id: node.id,
    component,
    path: node.path,
    visible,
    disabled,
    own: { visible, disabled },
    readOnly,
    ...(label === undefined ? {} : { label }),
    ...(helperText === undefined ? {} : { helperText }),
    ...(hint === undefined ? {} : { hint }),
    ...(component.state.hintIcon === undefined
      ? {}
      : { hintIcon: component.state.hintIcon }),
    ...(component.state.extraAttributes === undefined
      ? {}
      : { extraAttributes: component.state.extraAttributes }),
    ...(component.state.autofocus === undefined
      ? {}
      : { autofocus: component.state.autofocus }),
    ...(description === undefined ? {} : { description }),
    ...(content === undefined ? {} : { content }),
    // A picture entry sends addresses and not the value they were minted from.
    // The key is a place on a disk: the browser has no use for it, cannot fetch
    // it, and does not need telling where this application keeps its files.
    // A picture entry sends addresses, and a key-value entry that found rows
    // sends the rows: the object they were read from is the same data a second
    // time, and a browser handed both would have to choose between them.
    ...(entryValue === undefined ||
    component instanceof ImageEntry ||
    pairs !== undefined
      ? {}
      : { value: entryValue }),
    ...(tone === undefined ? {} : { tone }),
    ...(mark === undefined ? {} : { mark }),
    ...(pictures === undefined || pictures.length === 0 ? {} : { pictures }),
    ...(pairs === undefined ? {} : { pairs }),
    ...(href === undefined ? {} : { href }),
    ...(previewUrl === undefined ? {} : { previewUrl }),
    ...(createsOption === undefined ? {} : { createsOption }),
    ...(itemLabels === undefined ? {} : { itemLabels }),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(required ? { required: true } : {}),
    ...(options === undefined ? {} : { options }),
    children,
  };
}

async function validate(
  nodes: readonly ResolvedNode[],
  state: FormState,
  options: ResolveOptions,
): Promise<FieldErrors> {
  const errors: Record<string, string> = {};
  for (const node of nodes) {
    const field = node.component;
    if (!(field instanceof Field) || !node.visible) continue;
    // The node's path, not the field's name: one declaration stands for a field
    // in every row of a repeater, and keying on the name collapses all of them
    // onto one error — reported against a path that holds nothing, so it fires
    // for rows that are perfectly filled in.
    const path = node.path;
    if (path === "") continue;
    const current = state[path];
    const ctx = context(state, options, new Set());

    // What the field said to say, where it said anything. Only the framework's
    // own messages have a name to be replaced by: a rule an author wrote
    // carries their words and there is nothing in it to override.
    const said = field.state.validationMessages ?? {};

    if (node.required === true && !field.satisfiesRequired(current)) {
      errors[path] = said.required ?? "This field is required.";
      continue;
    }
    for (const rule of [...field.declaredRules, ...field.state.rules]) {
      const outcome = await rule(current, ctx);
      if (outcome !== true) {
        errors[path] =
          (rule.kind === undefined ? undefined : said[rule.kind]) ?? outcome;
        break;
      }
    }
  }
  return errors;
}

function context(
  state: FormState,
  options: ResolveOptions,
  reads: Set<string>,
): ResolverContext {
  return {
    get: (path) => {
      reads.add(path);
      return state[path];
    },
    /** Only a hook may write. A resolver that tries should hear about it. */
    set: () => {
      throw new Error("A resolver cannot set state. Use afterStateUpdated().");
    },
    ...(options.record === undefined ? {} : { record: options.record }),
    operation: options.operation,
    user: options.user,
  };
}

async function read<T>(input: Resolvable<T>, ctx: ResolverContext): Promise<T> {
  return isResolver(input) ? await input(ctx) : input;
}

async function value<T>(
  input: Resolvable<T> | undefined,
  ctx: ResolverContext,
  fallback: T,
  count: () => void,
): Promise<T> {
  if (input === undefined) return fallback;
  if (isResolver(input)) count();
  return read(input, ctx);
}

function flagsOf(node: ResolvedNode): ResolvedFlags {
  return { visible: node.visible, disabled: node.disabled, readOnly: node.readOnly };
}

function flattenWalked(node: WalkedNode): readonly WalkedNode[] {
  return [node, ...node.children.flatMap(flattenWalked)];
}

/**
 * The effective flags, from a node's own answer and what stands above it.
 *
 * Hidden wins over shown and disabled wins over enabled, in both directions: a
 * layout cannot reveal what its child hid, and a child cannot show itself
 * inside a hidden parent.
 */
function inherit(
  node: ResolvedNode,
  visible: boolean,
  disabled: boolean,
): ResolvedNode {
  const effective = {
    visible: node.own.visible && visible,
    disabled: node.own.disabled || disabled,
  };

  return {
    ...node,
    ...effective,
    children: node.children.map((child) =>
      inherit(child, effective.visible, effective.disabled),
    ),
  };
}

function flattenResolved(node: ResolvedNode): readonly ResolvedNode[] {
  return [node, ...node.children.flatMap(flattenResolved)];
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const item of b) if (a.has(item)) return true;
  return false;
}
