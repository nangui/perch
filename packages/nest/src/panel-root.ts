/**
 * Where the panel is mounted, taken from the request rather than configuration.
 *
 * A host may add a global prefix and a version segment, and a controller sees
 * neither. Stripping the suffix a route serves off the URL that reached it is
 * the only derivation that holds in every case.
 */
import { NotFoundException } from "@nestjs/common";

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
 * it decides where a browser goes next. `//host` is another origin to a browser,
 * and how strictly a router normalises paths is not a security argument.
 */
export function sameOrigin(path: string): string | undefined {
  return path.startsWith("/") && !path.startsWith("//") ? path : undefined;
}
