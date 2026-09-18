/**
 * Who the demo thinks is asking.
 *
 * Nobody is signed in here and nobody should be: the panel authenticates
 * nobody, and a demo with a login is a demo with a password to share. So this
 * reads `?as=` off the address, which is exactly what it looks like, and is
 * here to show that the panel does what the resolver says rather than to show
 * how an application should decide who somebody is.
 *
 * A real one reads what its guards left on the request. Auth recipes in the
 * guide say how, for the four systems people actually have.
 */
import { Injectable } from "@nestjs/common";
import type { UserResolver } from "@perchjs/nest";

export interface Visitor {
  readonly role: string;
}

@Injectable()
export class QueryUserResolver implements UserResolver {
  resolve(request: unknown): unknown {
    const url = (request as { url?: string }).url ?? "";
    const asked = /[?&]as=([a-z]+)/.exec(url)?.[1];
    return { role: asked ?? "visitor" } satisfies Visitor;
  }
}

/** The one the demo gives the extra column to. */
export function isWarden(user: unknown): boolean {
  return (user as Visitor | undefined)?.role === "warden";
}
