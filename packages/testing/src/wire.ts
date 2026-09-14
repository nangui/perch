/**
 * What a chain needs to reach the panel, and nothing more.
 *
 * Its own file because everything here points at it: the harness builds one,
 * the resource and the form are handed one. Declared inside the harness, it
 * made a ring — the harness reaching the form that reached the harness — and a
 * ring is a thing that only ever gets harder to break.
 */
export interface Wire {
  /** Where the panel is mounted, with its leading slash. */
  readonly root: string;
  readonly get: (path: string) => Promise<Response>;
  readonly post: (path: string, body: unknown) => Promise<Response>;
  readonly patch: (path: string, body: unknown) => Promise<Response>;
}
