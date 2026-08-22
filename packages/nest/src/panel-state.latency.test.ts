/**
 * The whole round trip, over HTTP, on a 40-field form.
 *
 * The engine's own budget covers sanitize → resolve → serialise and runs at a
 * fraction of a millisecond. This adds everything that was missing: the server,
 * the routing, JSON in and out, and the admission passes the trust boundary
 * costs. It is the number the project stops on.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Schema, Section, Select, TextInput } from "@perchjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

const BUDGET_MS = 150;
const PAYLOAD_BUDGET = 30 * 1024;
const ITERATIONS = 100;
const WARMUP = 20;
const PLAIN_FIELDS = 34;

const CITIES: Record<string, { value: number; label: string }[]> = {
  fr: [
    { value: 1, label: "Paris" },
    { value: 2, label: "Lyon" },
  ],
  be: [{ value: 3, label: "Brussels" }],
};

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  form(): Schema {
    const plain = Array.from({ length: PLAIN_FIELDS }, (_, i) =>
      TextInput.make(`f${String(i)}`)
        .label(({ get }) =>
          get(`f${String(i)}`) === undefined
            ? `Field ${String(i)}`
            : `Field ${String(i)} set`,
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
            .visible(({ get }) => Boolean(get("countryId"))),
          TextInput.make("bio").label(({ get }) =>
            get("name") === undefined ? "Bio" : "Bio (named)",
          ),
        ]),
      Section.make("Details").columns(2).schema(plain),
    ]);
  }
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

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-latency-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication;
let endpoint: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PersonResource],
        assets: assets(),
      }),
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0);
  endpoint = `${await app.getUrl()}/admin/api/people/state`;
}, 60_000);

afterAll(async () => {
  await app.close();
});

async function roundTrip(): Promise<number> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      state: { ...STATE, countryId: "be" },
      dirtyPath: "countryId",
      operation: "create",
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`/state answered ${String(response.status)}`);
  return new TextEncoder().encode(text).length;
}

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
  );
}

describe("a /state round trip, end to end", () => {
  it(`stays under the ${String(BUDGET_MS)} ms p95 budget`, async () => {
    for (let i = 0; i < WARMUP; i += 1) await roundTrip();

    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const started = performance.now();
      await roundTrip();
      samples.push(performance.now() - started);
    }

    // Measured at 1.6 ms, so this fires on a catastrophe and nothing smaller.
    // It is asserted at the documented figure anyway: that is the number the
    // project stops on, and a runner ten times slower is still well under it.
    const p95 = percentile(samples, 95);
    expect(
      p95,
      `p95 is ${p95.toFixed(1)} ms over ${String(ITERATIONS)} HTTP round trips, ` +
        `against a ${String(BUDGET_MS)} ms budget. Stop and redesign the protocol ` +
        `rather than building on this.`,
    ).toBeLessThan(BUDGET_MS);
  }, 120_000);

  it("keeps the answer under 30 KB on the wire", async () => {
    const bytes = await roundTrip();

    expect(
      bytes,
      `the answer is ${String(bytes)} bytes, against a 30 KB budget`,
    ).toBeLessThan(PAYLOAD_BUDGET);
  });
});
