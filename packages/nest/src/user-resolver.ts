/**
 * Who is asking, as the resolvers see it.
 *
 * Perch authenticates nobody. The guards on `forRoot` decide whether a request
 * gets through; this decides what the principal they left behind looks like by
 * the time a resolver reads it.
 */
import { Injectable } from "@nestjs/common";

export const PANEL_USER_RESOLVER = Symbol("PERCH_PANEL_USER_RESOLVER");

export interface UserResolver {
  resolve: (request: unknown) => unknown;
}

/** Where Passport and most Nest guards leave the principal. */
@Injectable()
export class RequestUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    if (typeof request !== "object" || request === null) return undefined;
    return (request as { user?: unknown }).user;
  }
}
