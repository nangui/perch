/**
 * The p95 budget that is a stopping condition rather than a target: past
 * 150 ms the protocol gets redesigned rather than built on. Nothing measured
 * it, so nothing could trigger that stop.
 *
 * Measured here is the server half of a `/state` round trip — sanitize,
 * resolve, serialise. The HTTP that will wrap it is not, and the 150 ms covers
 * the whole trip; that half is still owed, and arrives with @perchjs/nest.
 *
 * The clock and the counter divide the work. The clock holds the documented
 * number, with the headroom stated where it is asserted. The counter is what
 * actually catches the regression this engine is prone to — re-resolving the
 * whole tree on every keystroke costs a few milliseconds, which no wall-clock
 * budget loose enough to survive a shared runner would ever notice.
 */
import { describe, expect, it } from "vitest";
import { Schema, Section } from "./layout.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import type { ResolveOptions } from "./resolve.js";
import { resolveSchema } from "./resolve.js";
import { sanitize } from "./sanitize.js";
import { serialise } from "./serialise.js";

/** The documented v0.1 figure. */
const BUDGET_MS = 150;
const ITERATIONS = 200;
const WARMUP = 20;
const PLAIN_FIELDS = 34;

const EDIT: ResolveOptions = { operation: "edit" };

const CITIES: Record<string, { value: number; label: string }[]> = {
  fr: [
    { value: 1, label: "Paris" },
    { value: 2, label: "Lyon" },
  ],
  be: [{ value: 3, label: "Brussels" }],
};

/**
 * Forty fields, of which thirty-eight carry a resolver. The plain ones each read
 * their own path and nothing else: that is what makes the counter below sharp,
 * since a targeted pass must skip all of them and a broken one cannot.
 */
function form() {
  const plain = Array.from({ length: PLAIN_FIELDS }, (_, i) =>
    TextInput.make(`f${String(i)}`)
      .label(({ get }) =>
        get(`f${String(i)}`) === undefined
          ? `Field ${String(i)}`
          : `Field ${String(i)} ✓`,
      )
      .maxLength(255),
  );
  return Schema.make([
    Section.make("Identity")
      .columns(2)
      .schema([
        TextInput.make("name").required(),
        TextInput.make("email").email().required().maxLength(255),
        TextInput.make("password").password(),
        Select.make("countryId").options({ fr: "France", be: "Belgium" }).live(),
        Select.make("cityId")
          .options(({ get }) => CITIES[String(get("countryId"))] ?? [])
          .visible(({ get }) => Boolean(get("countryId")))
          .helperText(({ get }) =>
            get("countryId") === undefined ? "Pick a country" : "",
          ),
        TextInput.make("bio").label(({ get }) =>
          get("name") === undefined ? "Bio" : "Bio (named)",
        ),
      ]),
    Section.make("Details").columns(2).schema(plain),
  ]);
}

const STATE: Record<string, unknown> = {
  name: "Ada",
  email: "ada@example.com",
  countryId: "fr",
  cityId: 1,
  ...Object.fromEntries(
    Array.from({ length: PLAIN_FIELDS }, (_, i) => [
      `f${String(i)}`,
      `value ${String(i)}`,
    ]),
  ),
};

type Resolved = Awaited<ReturnType<typeof resolveSchema>>;

/** One `/state` round trip, server side: the three stages a request runs. */
async function roundTrip(previous: Resolved): Promise<Resolved> {
  const clean = sanitize(previous, { ...STATE, countryId: "be" });
  const next = await resolveSchema(form(), clean.state, {
    ...EDIT,
    dirtyPath: "countryId",
    previous,
  });
  serialise(next);
  return next;
}

/** A full resolve, then the targeted pass a keystroke on `countryId` triggers. */
async function afterPatch(): Promise<{ full: Resolved; targeted: Resolved }> {
  const full = await resolveSchema(form(), STATE, EDIT);
  const targeted = await resolveSchema(
    form(),
    { ...STATE, countryId: "be" },
    { ...EDIT, dirtyPath: "countryId", previous: full },
  );
  return { full, targeted };
}

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

describe("`/state` round trip, server side", () => {
  it(`stays under the ${String(BUDGET_MS)} ms p95 budget`, async () => {
    let previous = await resolveSchema(form(), STATE, EDIT);
    for (let i = 0; i < WARMUP; i += 1) previous = await roundTrip(previous);

    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const started = performance.now();
      previous = await roundTrip(previous);
      samples.push(performance.now() - started);
    }

    /**
     * Measured around 0.18 ms, so this fires on a catastrophe and nothing
     * smaller. It is asserted anyway: it is the number the protocol stops on,
     * and it becomes a real guard the day the HTTP half lands under it. The test
     * below is what watches for the ordinary regression.
     */
    const p95 = percentile(samples, 95);
    expect(
      p95,
      `p95 is ${p95.toFixed(2)} ms over ${String(ITERATIONS)} round trips, ` +
        `against a ${String(BUDGET_MS)} ms budget: stop and redesign the ` +
        `protocol rather than building the next milestone on this.`,
    ).toBeLessThan(BUDGET_MS);
  });

  it("re-evaluates the resolvers that read the edited path, not the whole tree", async () => {
    const { full, targeted } = await afterPatch();

    // cityId's three, and nothing else: the rest read paths the patch left alone.
    expect(targeted.resolverCalls).toBeLessThanOrEqual(3);
    // Guards the guard — a fixture whose resolvers all vanished would pass above.
    expect(full.resolverCalls).toBeGreaterThanOrEqual(PLAIN_FIELDS);
  });

  it("settles a patch in one pass", async () => {
    // A second pass means a hook fired. None here does, so more than one is the
    // resolution loop running when it should not.
    const { targeted } = await afterPatch();

    expect(targeted.passes).toBe(1);
  });
});

describe("payload size", () => {
  it("keeps a 40-field form under 30 KB", async () => {
    const payload = serialise(await resolveSchema(form(), STATE, EDIT));
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;

    expect(
      bytes,
      `the payload is ${String(bytes)} bytes, against a 30 KB budget`,
    ).toBeLessThan(30 * 1024);
  });
});
