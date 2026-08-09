/**
 * The trust boundary, shared by every route that accepts state.
 *
 * It lives here rather than in a controller because `/state` and the save routes
 * must confront a payload in exactly the same way. Two copies would drift, and
 * the one that drifted would be the one that writes.
 *
 * A field is admitted only if the tree resolved from the values already admitted
 * says it may be. Nothing the client sent ever decides its own fate, so a hidden
 * field can be unlocked only by one that is itself editable — and the chain
 * starts from the record, which the client never touched.
 */
import type { FormState, Operation, ResolveResult, Row, Schema } from "@perchjs/core";
import { resolveSchema, sanitize } from "@perchjs/core";

/** Same bound as the resolution cycle, and the same posture past it. */
const MAX_PASSES = 5;

/**
 * Gates that contradict each other never settle: two fields each visible only
 * while the other is empty admit both, then neither, then both again. Stopping
 * at the bound would answer with whichever set the last pass happened to
 * produce, so it fails instead. The message stays server-side — Nest answers a
 * plain 500 — because it names fields.
 */
export class AdmissionCycleError extends Error {
  readonly paths: readonly string[];

  constructor(paths: readonly string[]) {
    super(
      `Client state did not settle after ${String(MAX_PASSES)} passes. ` +
        `Fields still changing: ${paths.join(", ")}.`,
    );
    this.name = "AdmissionCycleError";
    this.paths = paths;
  }
}

export interface Admission {
  readonly schema: Schema;
  readonly state: FormState;
  readonly operation: Operation;
  readonly user: unknown;
  readonly record: Row | null;
}

export interface Admitted {
  /** What survived the boundary. */
  readonly accepted: FormState;
  /** The tree resolved from it — already validated, ready to dehydrate. */
  readonly tree: ResolveResult;
}

export async function admit(request: Admission): Promise<Admitted> {
  // Every pass carries the same principal and the same record. A tree resolved
  // without them decides visibility for nobody, about nothing, and admits a
  // field reserved for somebody.
  const options = {
    operation: request.operation,
    user: request.user,
    ...(request.record === null ? {} : { record: request.record }),
  };

  let accepted: FormState = {};
  let tree = await resolveSchema(request.schema, accepted, options);

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const clean = sanitize(tree, request.state);
    if (sameKeys(clean.state, accepted)) return { accepted, tree };

    accepted = clean.state;
    tree = await resolveSchema(request.schema, accepted, options);
  }

  throw new AdmissionCycleError(
    unsettled(sanitize(tree, request.state).state, accepted),
  );
}

/** The paths one more pass would have changed its mind about. */
function unsettled(next: FormState, accepted: FormState): string[] {
  const keys = new Set([...Object.keys(next), ...Object.keys(accepted)]);
  return [...keys].filter((key) => key in next !== key in accepted);
}

function sameKeys(a: FormState, b: FormState): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b);
}
