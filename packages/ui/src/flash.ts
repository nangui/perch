/**
 * A message that outlives the page it was made on.
 *
 * A create leaves the form it was made on, so the server's "Person created"
 * would be thrown away by the navigation that follows it. This carries it
 * across and hands it to whatever renders next.
 *
 * It carries; it does not decide. The wording, the tone and whether there is
 * anything to say at all were settled on the server — a panel in another
 * language does not want a sentence this file invented.
 *
 * `sessionStorage` rather than a cookie or a server-side session: the
 * navigation is the client's own, the message is already in its hands, and a
 * session store is a thing to run and expire. It is read once and dropped, so
 * a reader who reloads the list does not meet it a second time.
 */

const KEY = "perch:flash";

export interface Flash {
  readonly title: string;
  readonly body?: string;
  readonly tone: "success" | "warning" | "danger" | "info";
}

/** Held until the next page reads it. A second call replaces the first. */
export function keepFlash(flash: Flash): void {
  try {
    globalThis.sessionStorage.setItem(KEY, JSON.stringify(flash));
  } catch {
    // Private modes, storage limits and a runtime with no storage at all: each
    // throws, and a message nobody sees is not worth a page that does not load.
  }
}

/** Reads it and drops it, so a reload does not repeat it. */
export function takeFlash(): Flash | undefined {
  try {
    const held = globalThis.sessionStorage.getItem(KEY);
    if (held === null) return undefined;
    globalThis.sessionStorage.removeItem(KEY);
    return admit(JSON.parse(held));
  } catch {
    return undefined;
  }
}

/**
 * Storage is writable by anything on the origin, so what comes back out is
 * checked rather than believed — the same reason the trust boundary exists.
 */
function admit(value: unknown): Flash | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { title, body, tone } = value as Record<string, unknown>;
  if (typeof title !== "string" || title === "") return undefined;
  if (
    tone !== "success" &&
    tone !== "warning" &&
    tone !== "danger" &&
    tone !== "info"
  ) {
    return undefined;
  }
  return { title, tone, ...(typeof body === "string" ? { body } : {}) };
}
