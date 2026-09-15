/**
 * The cast of characters a documented example is allowed to assume.
 *
 * An example is a sentence about the framework, not a whole application: it
 * says `panel.resource(UserResource)` because the reader has a `UserResource`,
 * not because the example is going to build one. Written out in full, every
 * page would open with forty lines nobody reads.
 *
 * So the names are declared here, once, and every example is compiled with
 * them in scope. What that buys is the important half — the calls, the
 * arguments and the types they return are checked against what the packages
 * actually publish, so a renamed method breaks the documentation in CI rather
 * than under a reader.
 *
 * What it does not buy: that a `UserResource` exists in anybody's application.
 * These are shapes, not proof that the surrounding code is right, and adding a
 * name here is a decision to let examples lean on it.
 */
import type { DataAdapter, Ir, Schema } from "@perchjs/core";
import type { PrismaClientLike } from "@perchjs/prisma";

/** A resource class, as a reader's own would be. */
export declare class UserResource {
  form(): Schema;
}
export declare class PostResource {
  form(): Schema;
}
export declare class PersonResource {
  form(): Schema;
}

/** The module that registers the panel. */
export declare const AdminModule: new () => unknown;

/** Principals: somebody who may do everything, and somebody who may not. */
export declare const admin: unknown;
export declare const guest: unknown;

/** Rows a test already has in hand. */
export declare const ada: Record<string, unknown>;
export declare const grace: Record<string, unknown>;
export declare const post: Record<string, unknown>;

/** A guard the reader's application already has. */
export declare const JwtAuthGuard: new () => { canActivate: () => boolean };

/**
 * The application's own adapter, client and generated representation.
 *
 * `IR` is declared here rather than imported in the examples: the file it comes
 * from is written into the reader's own tree by `prisma generate`, so no
 * example can import it and still compile here. The pages say where it comes
 * from in prose, and what is checked is the call that uses it.
 */
export declare class AppDataAdapter implements DataAdapter {
  ir: DataAdapter["ir"];
  meta: DataAdapter["meta"];
  findMany: DataAdapter["findMany"];
  findOne: DataAdapter["findOne"];
  create: DataAdapter["create"];
  update: DataAdapter["update"];
  delete: DataAdapter["delete"];
  forceDelete: DataAdapter["forceDelete"];
  restore: DataAdapter["restore"];
  attach: DataAdapter["attach"];
  detach: DataAdapter["detach"];
  transaction: DataAdapter["transaction"];
}
export declare class PrismaService implements PrismaClientLike {
  readonly $transaction: PrismaClientLike["$transaction"];
  readonly [delegate: string]: unknown;
}
export declare const IR: Ir;

/** Helpers of the reader's own that examples call rather than build. */
export declare function hash(plain: string): Promise<string>;
export declare function countPending(user: unknown): Promise<number>;

/**
 * Renderers a plugin brings with it.
 *
 * Typed loosely on purpose: `react` is not a dependency of the proofs, and an
 * example about registering a component is not an example about React's types.
 */
export declare const StarRatingRenderer: Parameters<
  typeof import("@perchjs/ui").registerComponent
>[1];
export declare const AuditIndicator: Parameters<
  typeof import("@perchjs/ui").registerRenderHook
>[1];
