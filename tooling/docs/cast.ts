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
import type { Schema } from "@perchjs/core";

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
