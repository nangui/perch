/**
 * Every route that parses a multipart body is given the same limits.
 *
 * The upload routes hand the parser a ceiling and a refusal of field names
 * carrying brackets, and the second one is not optional decoration: without
 * it a single crafted name holds the event loop for a hundred seconds before
 * the route sees anything. The option is one the parser ignores when it is not
 * given, so a route that forgets it is a route with no guard and no error
 * anywhere to say so.
 *
 * Read from the source rather than driven over HTTP, because what this
 * defends is the next route. The two that exist share one declaration and a
 * test each would still pass on the day a third is written without it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../packages/nest/src/", import.meta.url));

/** The binding both routes pass, and the name this test insists on seeing. */
const SHARED = "UPLOAD_LIMITS";

function sources(): { name: string; text: string }[] {
  return readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.includes(".test."))
    .map((e) => ({ name: e.name, text: readFileSync(join(SRC, e.name), "utf8") }));
}

/** `FileInterceptor(...)` up to its closing parenthesis. The options it takes carry none. */
const CALLS = /FileInterceptor\([^)]*\)/g;

describe("the parser's limits", () => {
  it("are handed to every interceptor, from one place", () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const { name, text } of sources()) {
      for (const [call] of text.matchAll(CALLS)) {
        seen += 1;
        if (!call.includes(`limits: ${SHARED}`)) offenders.push(`${name}: ${call}`);
      }
    }
    expect(
      seen,
      "no interceptor found: this test has stopped reading anything",
    ).toBeGreaterThan(0);
    expect(
      offenders,
      `these parse a multipart body with limits of their own: ${offenders.join(" | ")}`,
    ).toEqual([]);
  });

  it("refuse a field name that carries brackets", () => {
    // The ceiling is about bytes and was always there; this is the one whose
    // absence is silent, so it is named rather than left to the binding.
    const declaration = sources().find(({ text }) =>
      text.includes(`const ${SHARED} =`),
    );
    expect(declaration, `${SHARED} is declared nowhere`).toBeDefined();
    expect(declaration?.text).toMatch(/fieldNestingDepth:\s*0/);
  });
});
