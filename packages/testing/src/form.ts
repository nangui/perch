/**
 * A resource's form, driven the way a browser drives it.
 *
 * It starts where a browser starts: at the page. The first tree travels in the
 * HTML, and `/state` answers a *change* — it requires the path that changed
 * and refuses a request without one. A harness that posted a blank state to it
 * instead would be asking the panel a question its own client never asks, and
 * would have had to invent a dirty path to get an answer.
 *
 * After that every step is a round trip. `fill` does not merely set a value
 * locally: it sends the state and takes back whatever the server made of it,
 * because that is the only thing that makes `assertFieldVisible` mean
 * anything. A helper that decided visibility on its own would be a second
 * implementation of the resolution cycle, and the one nobody is looking at is
 * the one that drifts.
 *
 * The chain is queued and run on `await`. That is what lets it read as the
 * sentence it is, and it is run once: awaiting a chain twice would send every
 * request twice, which on a chain ending in `submit` would write twice.
 *
 * Assertions throw plain errors. This package knows nothing about which test
 * runner is reading it, and a matcher borrowed from one would make it a
 * dependency of the other.
 */
import type { SchemaNode, SchemaPayload } from "@perchjs/core";
import type { Wire } from "./wire.js";

type Step = () => Promise<void>;

/** Every node in the tree, however deep a layout put it. */
function walk(node: SchemaNode): readonly SchemaNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)];
}

function fieldAt(payload: SchemaPayload, path: string): SchemaNode | undefined {
  return walk(payload.schema).find((one) => one.path === path);
}

/** What a reader would see in the list, which is what a test names. */
function labelsOf(node: SchemaNode | undefined): readonly string[] {
  return (node?.options ?? []).map((one) => one.label);
}

function show(value: unknown): string {
  // `JSON.stringify` is typed as always returning a string and does not:
  // `undefined` and a function both come back as nothing, and a message
  // reading "expected  to be " helps nobody. Read through a type that admits
  // it, because the standard library says it cannot happen.
  const said = (JSON.stringify as (one: unknown) => string | undefined)(value);
  return said ?? String(value);
}

/**
 * The tree the panel put in the page it served.
 *
 * Read out of the attribute rather than asked for again: it is what a browser
 * is given, and a second request would resolve a second tree that nothing
 * guarantees is the same one.
 */
function embedded(html: string, slug: string): SchemaPayload {
  const raw = /data-payload="([^"]*)"/.exec(html)?.[1];
  if (raw === undefined) {
    throw new Error(`The page of "${slug}" carried no form.`);
  }
  return JSON.parse(
    raw
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      // Last, or an entity this produced would be unescaped a second time.
      .replaceAll("&amp;", "&"),
  ) as SchemaPayload;
}

export class FormTest implements PromiseLike<undefined> {
  readonly #wire: Wire;
  readonly #slug: string;
  readonly #steps: Step[] = [];
  #ran = false;

  /** What the server last said. Empty until the first round trip. */
  #payload: SchemaPayload = {
    schema: { id: "0", type: "Schema" },
    state: {},
    errors: {},
  };
  /** What a save answered, once one has happened. */
  #saved: Record<string, unknown> | undefined;
  #status = 0;

  constructor(wire: Wire, slug: string) {
    this.#wire = wire;
    this.#slug = slug;
    // The form as the panel first draws it, off the page itself.
    this.#steps.push(async () => {
      await this.#open();
    });
  }

  /** The create page, and the tree the panel embedded in it. */
  async #open(): Promise<void> {
    const response = await this.#wire.get(`/${encodeURIComponent(this.#slug)}/create`);
    if (!response.ok) {
      throw new Error(
        `The form of "${this.#slug}" answered ${String(response.status)} where a page was expected.`,
      );
    }
    this.#payload = embedded(await response.text(), this.#slug);
  }

  async #round(state: Record<string, unknown>, dirtyPath: string): Promise<void> {
    const response = await this.#wire.post(
      `/api/${encodeURIComponent(this.#slug)}/state`,
      {
        state,
        operation: "create",
        dirtyPath,
      },
    );
    if (!response.ok) {
      throw new Error(
        `The form of "${this.#slug}" answered ${String(response.status)} where a tree was expected.`,
      );
    }
    this.#payload = (await response.json()) as SchemaPayload;
  }

  #step(step: Step): this {
    this.#steps.push(step);
    return this;
  }

  /** Puts values in and takes back what the server made of them. */
  fill(values: Readonly<Record<string, unknown>>): this {
    return this.#step(async () => {
      const next = { ...this.#payload.state, ...values };
      // The last key named, which is what a browser sends: one field changed,
      // and the server decides what that means for the rest.
      const keys = Object.keys(values);
      const last = keys[keys.length - 1];
      // Nothing named, nothing changed. A round trip for an empty fill would
      // be a request the panel's own client never makes.
      if (last !== undefined) await this.#round(next, last);
    });
  }

  assertHasField(path: string): this {
    return this.#step(async () => {
      if (fieldAt(this.#payload, path) === undefined) {
        throw new Error(
          `Expected the form of "${this.#slug}" to have a field at "${path}". It has: ` +
            `${walk(this.#payload.schema)
              .flatMap((one) => (one.path === undefined ? [] : [one.path]))
              .join(", ")}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /**
   * Visible meaning present, because an invisible field does not cross.
   *
   * That is the invariant this is really checking: a field hidden by a
   * condition is not drawn and not saved, so it is absent from the tree rather
   * than present and marked.
   */
  assertFieldVisible(path: string): this {
    return this.#step(async () => {
      if (fieldAt(this.#payload, path) === undefined) {
        throw new Error(
          `Expected "${path}" to be visible on the form of "${this.#slug}". Nothing at ` +
            `that path crossed, which is what an invisible field looks like.`,
        );
      }
      await Promise.resolve();
    });
  }

  assertFieldHidden(path: string): this {
    return this.#step(async () => {
      if (fieldAt(this.#payload, path) !== undefined) {
        throw new Error(
          `Expected "${path}" to be hidden on the form of "${this.#slug}", but it crossed.`,
        );
      }
      await Promise.resolve();
    });
  }

  /** The labels a reader would be offered, in the order they were offered. */
  assertFieldOptions(path: string, labels: readonly string[]): this {
    return this.#step(async () => {
      const found = labelsOf(fieldAt(this.#payload, path));
      if (show(found) !== show(labels)) {
        throw new Error(
          `Expected "${path}" to offer ${show(labels)}, and it offered ${show(found)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /** Sends what the form holds, as the page's save button would. */
  submit(): this {
    return this.#step(async () => {
      const response = await this.#wire.post(`/api/${encodeURIComponent(this.#slug)}`, {
        state: this.#payload.state,
      });
      this.#status = response.status;
      const answer = (await response.json()) as {
        errors?: Record<string, string>;
        payload?: SchemaPayload;
        record?: Record<string, unknown>;
      };
      // A refused save answers with the tree its errors belong to. Kept, so
      // that what follows asserts against the form the reader would be looking
      // at rather than the one they submitted.
      if (answer.payload !== undefined) this.#payload = answer.payload;
      else if (answer.errors !== undefined) {
        this.#payload = { ...this.#payload, errors: answer.errors };
      }
      this.#saved = answer.record;
    });
  }

  assertNoErrors(): this {
    return this.#step(async () => {
      const errors = this.#payload.errors;
      if (Object.keys(errors).length > 0) {
        throw new Error(
          `Expected the form of "${this.#slug}" to have no errors, and it answered ${show(errors)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /** The error on one field, or merely that there is one. */
  assertHasError(path: string, message?: string): this {
    return this.#step(async () => {
      const said = this.#payload.errors[path];
      if (said === undefined) {
        throw new Error(
          `Expected an error on "${path}". The form answered ${show(this.#payload.errors)}.`,
        );
      }
      if (message !== undefined && said !== message) {
        throw new Error(
          `Expected "${path}" to say ${show(message)}, and it said ${show(said)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /**
   * The row the save wrote, matched on the fields named.
   *
   * Read back through the panel's own edit page rather than off the save. A
   * save answers with the key and nothing else, on purpose: a form that hashes
   * a password writes it under the field's own name, and a save that handed
   * the row back would hand the hash to the browser that supplied the
   * plaintext. So this opens the record the way a reader would and reads what
   * is in the form — which is also the only thing a test should be asserting
   * about, the panel being what it is testing.
   *
   * Only the fields named: a row carries an id, timestamps and whatever else
   * the database put on it, and a test that had to name them all would be
   * rewritten every time a column is added.
   */
  assertRecordCreated(fields: Readonly<Record<string, unknown>>): this {
    return this.#step(async () => {
      if (this.#saved === undefined) {
        throw new Error(
          this.#status === 0
            ? `Nothing was submitted, so no record was created. Call submit() first.`
            : `The save answered ${String(this.#status)} and wrote no record. ` +
                `Errors: ${show(this.#payload.errors)}.`,
        );
      }

      // The key, whatever the model calls it: a save answers with that and
      // only that, so the one value there is is the one to open.
      const id = Object.values(this.#saved)[0];
      const response = await this.#wire.get(
        `/${encodeURIComponent(this.#slug)}/${encodeURIComponent(String(id))}/edit`,
      );
      if (!response.ok) {
        throw new Error(
          `A row was written, and its edit page answered ${String(response.status)}, ` +
            `so what it holds cannot be read back.`,
        );
      }
      const written = embedded(await response.text(), this.#slug).state;

      for (const [key, want] of Object.entries(fields)) {
        const got = written[key];
        if (show(got) !== show(want)) {
          throw new Error(
            `Expected the created record's "${key}" to be ${show(want)}, and it is ${show(got)}.`,
          );
        }
      }
    });
  }

  /** What the server last sent, for an assertion this package does not have. */
  async payload(): Promise<SchemaPayload> {
    await (this as PromiseLike<undefined>);
    return this.#payload;
  }

  /**
   * Runs the chain.
   *
   * Resolves with nothing on purpose. A `then` that handed back the chain
   * itself would hand back a thenable, and the promise machinery would call
   * `then` on that, and on what it gave back, for ever.
   */
  async then<A = undefined, B = never>(
    resolve?: ((value: undefined) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    try {
      if (!this.#ran) {
        this.#ran = true;
        // In order, never in parallel: each step reads what the one before it
        // brought back, and a chain ending in `submit` run twice would write
        // twice.
        for (const step of this.#steps) await step();
      }
      return await Promise.resolve(resolve?.(undefined) as A);
    } catch (error) {
      if (reject === undefined || reject === null) throw error;
      return await Promise.resolve(reject(error));
    }
  }
}
