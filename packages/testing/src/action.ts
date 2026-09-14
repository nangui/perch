/**
 * One action, on one record or on a selection.
 *
 * Through the route the table's own buttons post to, so the authorization, the
 * modal's form and the replay guard are all the ones a reader would meet. An
 * action called any other way would be an action tested without the three
 * things most likely to be wrong about it.
 *
 * Whether it is visible is read off the table rather than guessed: the list
 * answers with the actions this reader is offered, already filtered, which is
 * the same list the buttons are drawn from. Asking anywhere else would be
 * asking a different question from the one the page answers.
 */
import type { RecordsResponse } from "@perchjs/nest";
import type { RecordLike } from "./table.js";
import type { Wire } from "./wire.js";

type Step = () => Promise<void>;

interface Answer {
  readonly processed?: number;
  readonly refused?: number;
  readonly notification?: { readonly title?: string; readonly tone?: string };
  readonly errors?: Record<string, string>;
}

function show(value: unknown): string {
  const said = (JSON.stringify as (one: unknown) => string | undefined)(value);
  return said ?? String(value);
}

export class ActionTest implements PromiseLike<undefined> {
  readonly #wire: Wire;
  readonly #slug: string;
  readonly #name: string;
  readonly #records: readonly RecordLike[];
  readonly #steps: Step[] = [];
  #offered: readonly string[] = [];
  #answer: Answer | undefined;
  #failed: string | undefined;
  #ran = false;
  #threw: unknown;

  constructor(wire: Wire, slug: string, name: string, records: readonly RecordLike[]) {
    this.#wire = wire;
    this.#slug = slug;
    this.#name = name;
    this.#records = records;
  }

  #step(step: Step): this {
    this.#steps.push(step);
    return this;
  }

  /** The actions this reader is offered, as the table hands them over. */
  async #read(): Promise<void> {
    const response = await this.#wire.get(
      `/api/${encodeURIComponent(this.#slug)}/records`,
    );
    if (!response.ok) {
      throw new Error(
        `The table of "${this.#slug}" answered ${String(response.status)}, so which ` +
          `actions it offers cannot be read.`,
      );
    }
    const page = (await response.json()) as RecordsResponse;
    const offered = page.columns as unknown as {
      actions?: readonly { name?: string }[];
      headerActions?: readonly { name?: string }[];
      bulkActions?: readonly { name?: string }[];
    };
    this.#offered = [
      ...(offered.actions ?? []),
      ...(offered.headerActions ?? []),
      ...(offered.bulkActions ?? []),
    ].flatMap((one) => (one.name === undefined ? [] : [one.name]));
  }

  #keys(): unknown[] {
    return this.#records.map((one) =>
      typeof one === "string" || typeof one === "number" ? one : one["id"],
    );
  }

  assertVisible(): this {
    return this.#step(async () => {
      await this.#read();
      if (!this.#offered.includes(this.#name)) {
        throw new Error(
          `Expected "${this.#name}" to be offered on "${this.#slug}". The table offers ` +
            `${show(this.#offered)}. An action a policy hides is not in this list, and ` +
            `neither is one nothing declared.`,
        );
      }
    });
  }

  assertHidden(): this {
    return this.#step(async () => {
      await this.#read();
      if (this.#offered.includes(this.#name)) {
        throw new Error(
          `Expected "${this.#name}" not to be offered on "${this.#slug}", and the table ` +
            `offers it.`,
        );
      }
    });
  }

  /**
   * Runs it, with whatever its modal collects.
   *
   * The answer is kept rather than asserted on here: an action that refuses is
   * a thing a test may be about, and one that could not run at all is not.
   */
  call(data: Readonly<Record<string, unknown>> = {}): this {
    return this.#step(async () => {
      const keys = this.#keys();
      const response = await this.#wire.post(
        `/api/${encodeURIComponent(this.#slug)}/actions/${encodeURIComponent(this.#name)}`,
        { ...(keys.length === 1 ? { id: keys[0] } : { ids: keys }), data },
      );

      const body = await response.text();
      try {
        this.#answer = JSON.parse(body) as Answer;
      } catch {
        this.#failed = `"${this.#name}" answered ${String(response.status)} with ${
          body.trim() === "" ? "an empty body" : "something that is not JSON"
        }.`;
        return;
      }
      // A guard turning the record down is an answer, with a count. A status
      // that is not a success and no counts with it is the panel failing, and
      // a test reading "nothing was processed" would call that a refusal.
      if (!response.ok && this.#answer.processed === undefined) {
        this.#failed =
          `"${this.#name}" answered ${String(response.status)} and no counts with it, ` +
          `so this is the panel failing rather than the action refusing.`;
      }
    });
  }

  #said(): Answer {
    if (this.#failed !== undefined) throw new Error(this.#failed);
    if (this.#answer === undefined) {
      throw new Error(`"${this.#name}" was never called. Call call() first.`);
    }
    return this.#answer;
  }

  /** What it told the reader, worded by the server. */
  assertNotification(tone: string, title: string): this {
    return this.#step(async () => {
      const said = this.#said().notification;
      if (said?.tone !== tone || said.title !== title) {
        throw new Error(
          `Expected "${this.#name}" to say ${show({ tone, title })}, and it said ` +
            `${show(said ?? null)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /** How many records it ran against. */
  assertProcessed(count: number): this {
    return this.#step(async () => {
      const said = this.#said().processed ?? 0;
      if (said !== count) {
        throw new Error(
          `Expected "${this.#name}" to run against ${String(count)}, and it ran against ` +
            `${String(said)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /**
   * How many a guard turned down.
   *
   * Never why: the panel does not say, on purpose, and a helper that made one
   * up would be inventing the one thing the boundary declines to tell anybody.
   */
  assertRefused(count: number): this {
    return this.#step(async () => {
      const said = this.#said().refused ?? 0;
      if (said !== count) {
        throw new Error(
          `Expected "${this.#name}" to be refused for ${String(count)}, and it was ` +
            `refused for ${String(said)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  /** That its modal's form came back with an error on a field. */
  assertHasError(path: string): this {
    return this.#step(async () => {
      const errors = this.#said().errors ?? {};
      if (errors[path] === undefined) {
        throw new Error(
          `Expected "${this.#name}" to answer with an error on "${path}", and it ` +
            `answered ${show(errors)}.`,
        );
      }
      await Promise.resolve();
    });
  }

  async then<A = undefined, B = never>(
    resolve?: ((value: undefined) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    try {
      if (this.#ran) {
        if (this.#threw !== undefined) {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- the original, not a copy of it
          throw this.#threw;
        }
      } else {
        this.#ran = true;
        try {
          for (const step of this.#steps) await step();
        } catch (error) {
          this.#threw = error;
          throw error;
        }
      }
      return await Promise.resolve(resolve?.(undefined) as A);
    } catch (error) {
      if (reject === undefined || reject === null) throw error;
      return await Promise.resolve(reject(error));
    }
  }
}
