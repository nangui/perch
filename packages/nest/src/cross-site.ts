/**
 * A request that changes something arrives from the panel, not from a form on
 * somebody else's page.
 *
 * A page on another site can make a reader's browser post to this one, and the
 * browser attaches whatever cookies the reader has. Nothing about that request
 * looks unusual at the routes below: it carries the reader's session, so the
 * host's guards let it through, and it names a resource the reader may write.
 * Measured before this existed: a plain HTML form posting
 * `application/x-www-form-urlencoded` to the save route created a row, and one
 * posting `id=1` to a delete action deleted it. Express parses a form body into
 * the same nested object JSON would have produced, brackets and all, so the
 * route could not tell the two apart.
 *
 * What a form on another page cannot do is choose a content type outside the
 * three a form can send, or set a header of its own. Anything that can do
 * either is a script, and a script from another origin is asked for permission
 * first, which nothing here grants. So one of the two is enough, and both are
 * accepted: the panel's own client sends JSON everywhere except where it sends
 * a file, and it names itself there.
 *
 * Not a token, and nothing stored. A token needs somewhere to keep it, and this
 * package owns no session, no cookie and no storage. What it can read is what
 * the browser already refuses to forge.
 *
 * Silent, like every other refusal here. A reader who is not meant to be at a
 * route is told the route is not there, and this is the same answer for the
 * same reason.
 *
 * This is not the whole of it, and the guide says so. An application that also
 * wants the origin checked before Nest sees the request has
 * `enableCsrfProtection()` from its own framework, which is the application's
 * call rather than the panel's.
 */
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, NotFoundException } from "@nestjs/common";

/**
 * What the panel's own client sends where it cannot send JSON.
 *
 * Written here and again in the renderer, which imports no value from anywhere:
 * the two are held together by a test rather than by a shared constant.
 */
export const PANEL_REQUEST_HEADER = "x-perch-panel";

/** Methods that change nothing, so nothing is asked of them. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** What node hands over. Header names arrive lowercased, which is why they are read so. */
interface Incoming {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/** A header sent twice arrives as a list. The first is what the request leads with. */
function first(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  return value?.[0];
}

@Injectable()
export class CrossSiteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Incoming>();
    if (READS.has((request.method ?? "GET").toUpperCase())) return true;

    const headers = request.headers ?? {};
    if (headers[PANEL_REQUEST_HEADER] !== undefined) return true;

    const type = first(headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
    if (type === "application/json") return true;

    throw new NotFoundException();
  }
}
