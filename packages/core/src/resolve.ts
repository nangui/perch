/**
 * The resolution cycle. Seven stages and exactly one loop.
 *
 * The loop is bounded at five passes and exits early when a pass changes
 * nothing. Beyond that it throws naming the fields involved, rather than
 * overflowing the stack somewhere a reader cannot connect to their `set()` call.
 */
import type { Component, Operation, Resolvable, ResolverContext } from "./component.js";
import { isResolver } from "./component.js";
import type { ResolvedFlags } from "./field.js";
import { Field, isDehydrated } from "./field.js";
import type { Option, OptionsInput } from "./fields/select.js";
import { normaliseOptions, Select } from "./fields/select.js";

export type FormState = Readonly<Record<string, unknown>>;
export type FieldErrors = Readonly<Record<string, string>>;

/** Node id → the state paths its resolvers read on the last pass. */
export type DependencyTrace = ReadonlyMap<string, ReadonlySet<string>>;

export interface ResolveOptions {
  readonly operation: Operation;
  readonly user?: unknown;
  readonly record?: Readonly<Record<string, unknown>>;
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
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly label?: string;
  readonly helperText?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
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
  const tree = walk(root);
  const flatTree = flattenWalked(tree);
  const state: Record<string, unknown> = { ...clientState };
  const trace = new Map<string, Set<string>>(
    [...(options.previous?.trace ?? [])].map(([id, paths]) => [id, new Set(paths)]),
  );
  const carried = new Map(options.previous?.nodes.map((n) => [n.id, n]) ?? []);
  const counter = { calls: 0 };

  // HYDRATE — a first load fills the blanks from `default()`.
  if (options.dirtyPath === undefined) {
    for (const { id, component } of flatTree) {
      if (!(component instanceof Field)) continue;
      const path = component.name;
      if (path === "" || path in state) continue;
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
    for (const { component } of flatTree) {
      if (!(component instanceof Field)) continue;
      const hook = component.state.afterStateUpdated;
      if (hook === undefined || !changed.has(component.name)) continue;
      await hook({
        ...context(state, options, new Set()),
        set: (path, value) => {
          if (state[path] === value) return;
          state[path] = value;
          touched.add(path);
        },
        value: state[component.name],
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

/** The write set: what `isDehydrated` lets through, after `dehydrateStateUsing`. */
export function dehydrate(
  result: ResolveResult,
  options: ResolveOptions,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const node of result.nodes) {
    const field = node.component;
    if (!(field instanceof Field)) continue;
    const path = field.name;
    let value = result.state[path];
    const transform = field.state.dehydrateStateUsing;
    if (transform !== undefined) {
      value = transform(value, context(result.state, options, new Set()));
    }
    if (!isDehydrated(field, flagsOf(node), value)) continue;
    // A field the form never carried a value for is absent from the write, not
    // present and empty. `null` is how a column is cleared; `undefined` would
    // leave every adapter to guess which of the two was meant.
    if (value === undefined) continue;
    out[path] = value;
  }
  return out;
}

interface WalkedNode {
  readonly id: string;
  readonly component: Component;
  readonly children: readonly WalkedNode[];
}

/** Identity is `key`, else the field name, else the position in the tree. */
function walk(component: Component, prefix = "", index = 0): WalkedNode {
  const id =
    component.state.key ??
    (component instanceof Field && component.name !== ""
      ? component.name
      : `${prefix}${String(index)}`);
  return {
    id,
    component,
    children: component.children.map((child, i) => walk(child, `${id}/`, i)),
  };
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

  // Resolved here rather than copied from the state: both accept a resolver,
  // and a `required` the server enforces but never sends is an error the user
  // could not have seen coming.
  const placeholder =
    component instanceof Field
      ? await value(component.state.placeholder, rc, undefined, count)
      : undefined;
  const required =
    component instanceof Field
      ? await value(component.state.required, rc, false, count)
      : false;

  let options: readonly Option[] | undefined;
  if (component instanceof Select && component.state.options !== undefined) {
    const raw = await value<OptionsInput | undefined>(
      component.state.options,
      rc,
      undefined,
      count,
    );
    options = raw === undefined ? undefined : normaliseOptions(raw);
  }

  if (ctx.counter.calls > before) ctx.trace.set(node.id, reads);

  return {
    id: node.id,
    component,
    visible,
    disabled,
    readOnly,
    ...(label === undefined ? {} : { label }),
    ...(helperText === undefined ? {} : { helperText }),
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
    const path = field.name;
    const current = state[path];
    const ctx = context(state, options, new Set());

    if (node.required === true && isBlank(current)) {
      errors[path] = "This field is required.";
      continue;
    }
    for (const rule of field.state.rules) {
      const outcome = await rule(current, ctx);
      if (outcome !== true) {
        errors[path] = outcome;
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

function flattenResolved(node: ResolvedNode): readonly ResolvedNode[] {
  return [node, ...node.children.flatMap(flattenResolved)];
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const item of b) if (a.has(item)) return true;
  return false;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
