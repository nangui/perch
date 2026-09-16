/**
 * Where the panel is mounted, taken from the request rather than configuration.
 *
 * A host may add a global prefix and a version segment, and a controller sees
 * neither. Stripping the suffix a route serves off the URL that reached it is
 * the only derivation that holds in every case.
 */
import { NotFoundException } from "@nestjs/common";
import { safePath } from "@perchjs/core";

/** Both platforms Nest supports name it, and neither shares a type. */
export interface IncomingUrl {
  readonly originalUrl?: string;
  readonly url?: string;
}

/**
 * The URL is decoded first: a request for `/%70eople/create` routes in with a
 * slug of `people`, and matching the raw form would miss. Not finding the suffix
 * leaves no root that is right, so it refuses rather than answering a page whose
 * every link points elsewhere.
 */
export function rootOf(request: IncomingUrl, suffix: string): string {
  const raw = (request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
  const end = decodePath(raw).replace(/\/+$/, "");
  const cut = end.lastIndexOf(`/${suffix}`);
  if (cut === -1) throw new NotFoundException();
  return end.slice(0, cut);
}

/**
 * The mount path itself, for the one route that answers at it.
 *
 * `rootOf` works by cutting the suffix a route serves off the URL that reached
 * it, and the panel's own root serves no suffix: the whole path is the answer.
 * Trailing slashes go, so `/admin` and `/admin/` build the same addresses.
 */
export function rootHere(request: IncomingUrl): string {
  const raw = (request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
  return decodePath(raw).replace(/\/+$/, "");
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * A place on this origin, or nothing.
 *
 * The root a redirect is built on comes from the URL that reached the route, so
 * it decides where a browser goes next — and that URL is the caller's to write.
 *
 * Refusing `//host` by shape looked like enough and was not: a browser reads
 * `/\host` as `//host`, and strips tabs and newlines before it reads anything,
 * so `/⇥/host` leaves the site too. Both got through. The check asks the URL
 * parser now, which is the thing that will make the decision anyway.
 */
export function sameOrigin(path: string): string | undefined {
  return path.startsWith("/") ? safePath(path) : undefined;
}
