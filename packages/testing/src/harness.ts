/**
 * A panel, booted and addressable, for a test to drive.
 *
 * Over HTTP and through the panel's own routes. Calling a controller directly
 * would skip the serialisation, the guards and the trust boundary, which is to
 * say it would skip the three places a panel is most likely to be wrong — and
 * a test that passes by not going through them proves nothing about what a
 * reader gets.
 *
 * **Who is asking travels on the request, never in a variable.** A harness
 * that kept a current user and changed it between calls would be the shared
 * mutable state this framework refuses everywhere else: two chains in flight
 * and one reads the other's principal. So `as()` mints a token, the token
 * rides in a header, and the resolver looks it up — every request carrying its
 * own answer.
 */
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DataAdapter } from "@perchjs/core";
import { PANEL_DATA_ADAPTER, PANEL_PATH, PANEL_USER_RESOLVER } from "@perchjs/nest";
import { countQueries } from "./counter.js";
import type { Counter } from "./counter.js";
import { ResourceTest } from "./resource.js";
import type { Wire } from "./wire.js";

/** The header the harness puts its token in. Nothing else reads it. */
const PRINCIPAL = "x-perch-test-principal";

export interface PanelTestOptions {
  /** The module that imports `PanelModule.forRoot(...)`. */
  readonly module: Type<unknown>;
  /** Who the first requests are made as. `as()` changes it without mutation. */
  readonly as?: unknown;
}

export class PanelTest {
  readonly #app: INestApplication;
  readonly #url: string;
  readonly #root: string;
  readonly #principals: Map<string, unknown>;
  readonly #token: string;
  readonly #counter: Counter;

  private constructor(
    app: INestApplication,
    url: string,
    root: string,
    principals: Map<string, unknown>,
    token: string,
    counter: Counter,
  ) {
    this.#app = app;
    this.#url = url;
    this.#root = root;
    this.#principals = principals;
    this.#token = token;
    this.#counter = counter;
  }

  static async boot(options: PanelTestOptions): Promise<PanelTest> {
    const principals = new Map<string, unknown>();

    const moduleRef = await Test.createTestingModule({ imports: [options.module] })
      .overrideProvider(PANEL_USER_RESOLVER)
      // Read off the request, like the resolver it replaces. What differs is
      // where the principal came from, not when it is read.
      .useValue({
        resolve: (request: unknown) => {
          const headers = (request as { headers?: Record<string, unknown> } | null)
            ?.headers;
          const token = headers?.[PRINCIPAL];
          return typeof token === "string" ? principals.get(token) : undefined;
        },
      })
      .compile();

    // Before the server, so a module that holds no panel is said plainly
    // rather than as a Nest error naming a symbol nobody has heard of.
    let root: string;
    try {
      root = moduleRef.get<string>(PANEL_PATH, { strict: false });
    } catch {
      await moduleRef.close();
      throw new Error(
        `${options.module.name} imports no panel. createPanelTest needs the module ` +
          `that calls PanelModule.forRoot(...), or one that imports it.`,
      );
    }

    const app = moduleRef.createNestApplication();
    await app.listen(0);

    const token = "p1";
    principals.set(token, options.as);

    // Wrapped once, here: every facade `as()` mints shares the one panel and
    // therefore the one adapter, so they share the count too.
    const counter = countQueries(
      moduleRef.get<DataAdapter | null>(PANEL_DATA_ADAPTER, { strict: false }),
    );

    return new PanelTest(app, await app.getUrl(), root, principals, token, counter);
  }

  /**
   * The same panel, asked as somebody else.
   *
   * A new facade rather than a changed one: the principal is part of what a
   * chain is, and a chain whose reader can change under it is a chain whose
   * result depends on when it ran.
   */
  as(user: unknown): PanelTest {
    const token = `p${String(this.#principals.size + 1)}`;
    this.#principals.set(token, user);
    return new PanelTest(
      this.#app,
      this.#url,
      this.#root,
      this.#principals,
      token,
      this.#counter,
    );
  }

  /** The resource named by its own class, so no test spells a slug. */
  resource(type: unknown): ResourceTest {
    return new ResourceTest(this.wire, this.#counter, type);
  }

  /** Where the panel answers, for a chain to address. */
  get wire(): Wire {
    const at = (path: string): string => `${this.#url}${this.#root}${path}`;
    const headers = {
      "content-type": "application/json",
      [PRINCIPAL]: this.#token,
    };
    const send = async (method: string, path: string, body: unknown) =>
      await fetch(at(path), { method, headers, body: JSON.stringify(body) });

    return {
      root: this.#root,
      get: async (path) => await fetch(at(path), { headers }),
      post: async (path, body) => await send("POST", path, body),
      patch: async (path, body) => await send("PATCH", path, body),
    };
  }

  async close(): Promise<void> {
    await this.#app.close();
  }
}

/** Boots a panel for a test. Close it when the test is done. */
export async function createPanelTest(options: PanelTestOptions): Promise<PanelTest> {
  return await PanelTest.boot(options);
}
