/**
 * A hundred readers at once, and none of them sees another.
 *
 * The last of the guardrails the project set itself before the code they
 * protect existed. What was already held is that a builder is immutable: a
 * hundred derivations of one prototype share nothing, which `component.test.ts`
 * measures on the object. This measures the thing that object exists for — a
 * hundred requests in flight against one running panel, each with its own
 * principal and its own client state.
 *
 * A leak here is not a wrong pixel. The resource instance comes from the
 * container and is a singleton; the tree is rebuilt per request precisely so
 * that one reader's resolution cannot end up in another's answer. If it could,
 * the way it would show is somebody being handed a name that is not theirs, or
 * a field their principal was never allowed to see.
 *
 * Every axis is per-reader on purpose: a label resolved from the principal, a
 * field whose visibility is a permission, and a value the client sent. One
 * axis passing while another leaked would be a test that reads as green.
 *
 * The resolvers yield, and that is the whole mechanism rather than a detail.
 * Node runs each request's synchronous stretch to completion, so a hundred
 * requests whose resolvers never await are a hundred requests that never
 * interleave — and a panel holding the principal in a shared variable would
 * pass this file without a mark. Measured: with the resolvers synchronous, a
 * deliberately leaking build passed all four cases. One `await` in the place a
 * real resolver has one — a query, a service call — is what puts the requests
 * inside each other, which is where the leak this guards against lives.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";

/** The number the project wrote down for this. */
const READERS = 100;

/**
 * Sent and discarded before anything is measured.
 *
 * The client's connection pool starts at one and grows under load, so the first
 * hundred requests are not a hundred in flight — measured cold, fourteen of
 * them overlapped, and warming with forty capped the pool at forty. So the
 * warm-up is the whole batch: the pool grows to what it was asked for and then
 * reuses it. The latency files warm up for the same reason. This is not about
 * the panel — it is about not reading the client's ramp as the server's
 * concurrency.
 */
const WARMUP = READERS;

interface Principal {
  readonly name: string;
  readonly admin: boolean;
}

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: Principal;
    }>();
    const name = request.headers["x-user"];
    if (name !== undefined) {
      // Every other reader is an administrator, so a leak in either direction
      // shows: a field appearing for somebody without the permission, and one
      // missing for somebody with it.
      request.user = { name, admin: name.endsWith("0") };
    }
    return true;
  }
}

/** Where a real resolver goes to the database, and where a leak gets its chance. */
const tick = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

/**
 * How many resolutions were inside the yield at once, at the worst moment.
 *
 * Guards the guard, and it is the one that matters here: every case below would
 * still pass against a panel that answered the hundred one after another, and
 * would then be measuring nothing at all. A global lock, a queue, a connection
 * pool of one — none of them would show as a failure without this.
 */
let inFlight = 0;
let peak = 0;

const named = (user: unknown): string =>
  (user as Principal | undefined)?.name ?? "nobody";
const admin = (user: unknown): boolean =>
  (user as Principal | undefined)?.admin === true;

@PanelResource({ model: "Person", slug: "people" })
class PersonResource {
  form(): Schema {
    return Schema.make([
      // Resolved from the principal, so the answer names who asked — and after
      // a yield, so this request is inside the others while it reads it.
      TextInput.make("name").label(async ({ user }) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight -= 1;
        return `Name — ${named(user)}`;
      }),
      // A permission, and therefore the axis where a leak is a hole rather
      // than a blemish.
      TextInput.make("salary").visible(async ({ user }) => {
        await tick();
        return admin(user);
      }),
      // Resolved from what this client sent, so the state cannot cross either.
      TextInput.make("echo").label(({ get }) => `Echo — ${String(get("name"))}`),
    ]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-concurrency-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication;
let url: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PersonResource],
        guards: [HeaderGuard],
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  url = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

/** One reader's whole round trip: their principal, their state, their answer. */
async function ask(reader: string): Promise<SchemaPayload> {
  const response = await fetch(`${url}/admin/api/people/state`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user": reader },
    // `dirtyPath` is required: the route refuses a body without one, which is
    // the shape a real client sends after touching a field.
    body: JSON.stringify({
      operation: "create",
      dirtyPath: "name",
      state: { name: reader },
    }),
  });
  return (await response.json()) as SchemaPayload;
}

const labels = (payload: SchemaPayload): readonly string[] =>
  (payload.schema.children ?? []).map((node: SchemaNode) => node.label ?? "");

const paths = (payload: SchemaPayload): readonly string[] =>
  (payload.schema.children ?? []).map((node: SchemaNode) => node.path ?? "");

describe("a hundred readers at once", () => {
  beforeEach(() => {
    inFlight = 0;
    peak = 0;
  });

  it("really is at once, which every case below assumes", async () => {
    const readers = Array.from({ length: READERS }, (_, at) => `reader-${String(at)}`);

    await Promise.all(
      Array.from({ length: WARMUP }, (_, at) => ask(`warmup-${String(at)}`)),
    );
    peak = 0;
    await Promise.all(readers.map((reader) => ask(reader)));

    // Measured at 100 when this was written. Held at half of them, so a change
    // in how the runtime schedules is not a failing test — but a panel that
    // answered them one at a time is.
    expect(peak).toBeGreaterThanOrEqual(READERS / 2);
  });
  it("hands each of them their own name, and nobody else's", async () => {
    const readers = Array.from({ length: READERS }, (_, at) => `reader-${String(at)}`);

    const answers = await Promise.all(readers.map((reader) => ask(reader)));

    // Checked pairwise against the reader who asked, not as a set: a set would
    // be satisfied by a hundred answers that were all correct for somebody.
    const wrong = answers
      .map((payload, at) => ({ reader: readers[at] ?? "", labels: labels(payload) }))
      .filter((one) => !one.labels.includes(`Name — ${one.reader}`));

    expect(wrong).toEqual([]);
  });

  it("gives the permitted field only to the readers who had the permission", async () => {
    const readers = Array.from({ length: READERS }, (_, at) => `reader-${String(at)}`);

    const answers = await Promise.all(readers.map((reader) => ask(reader)));

    const wrong = answers
      .map((payload, at) => ({
        reader: readers[at] ?? "",
        shown: paths(payload).includes("salary"),
      }))
      // The guard makes an administrator of every reader whose name ends in a
      // zero, so this is the whole hundred judged against their own principal.
      .filter((one) => one.shown !== one.reader.endsWith("0"));

    expect(wrong).toEqual([]);
  });

  it("resolves each answer against the state that request carried", async () => {
    const readers = Array.from({ length: READERS }, (_, at) => `reader-${String(at)}`);

    const answers = await Promise.all(readers.map((reader) => ask(reader)));

    const wrong = answers
      .map((payload, at) => ({ reader: readers[at] ?? "", labels: labels(payload) }))
      .filter((one) => !one.labels.includes(`Echo — ${one.reader}`));

    expect(wrong).toEqual([]);
  });

  it("answers all hundred, and none of them empty", async () => {
    const readers = Array.from({ length: READERS }, (_, at) => `reader-${String(at)}`);

    const answers = await Promise.all(readers.map((reader) => ask(reader)));

    // Not a guard against the three above passing vacuously — their filters
    // already fail on an answer with no fields, since a label that is not there
    // is a label that does not match. This is the plainer claim underneath
    // them: a hundred went out and a hundred came back with a form in them.
    expect(answers).toHaveLength(READERS);
    expect(answers.every((payload) => (payload.schema.children ?? []).length > 0)).toBe(
      true,
    );
  });
});
