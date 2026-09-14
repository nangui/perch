/**
 * One resource, as a test addresses it.
 *
 * The slug comes off the class's own decorator rather than being named again
 * in the test: a slug written twice is one that stops matching the day
 * somebody renames a model.
 */
import { resourceMetadata } from "@perchjs/nest";
import type { Wire } from "./wire.js";
import type { Counter } from "./counter.js";
import { FormTest } from "./form.js";
import { TableTest } from "./table.js";
import type { RecordLike } from "./table.js";
import { ActionTest } from "./action.js";

export class ResourceTest {
  readonly #wire: Wire;
  readonly #slug: string;
  readonly #name: string;
  readonly #counter: Counter;

  constructor(wire: Wire, counter: Counter, type: unknown) {
    const metadata = resourceMetadata(type);
    const name = (type as { name?: string }).name ?? "the resource";
    if (metadata === undefined) {
      throw new Error(`${name} carries no @PanelResource, so it is not a resource.`);
    }
    this.#wire = wire;
    this.#counter = counter;
    this.#slug = metadata.slug;
    this.#name = name;
  }

  form(): FormTest {
    return new FormTest(this.#wire, this.#slug);
  }

  table(): TableTest {
    return new TableTest(this.#wire, this.#slug, this.#counter);
  }

  /**
   * One of its actions, against the records named.
   *
   * A row action takes one record, a bulk action takes several, and the route
   * is the same either way — which is also how the panel's own table posts
   * them.
   */
  action(name: string, ...records: readonly RecordLike[]): ActionTest {
    return new ActionTest(this.#wire, this.#slug, name, records);
  }

  /**
   * That this reader cannot reach the resource at all.
   *
   * Asked at two doors, because one is not enough to tell what a refusal
   * means. The panel answers the same thing for a resource that is forbidden,
   * one that does not exist, and one whose list it cannot serve — so a list
   * page refusing is not on its own a fact about the reader.
   *
   * The create page needs no row and no adapter, and every `viewAny` refusal
   * closes it too. If the list refuses and the create page does not, the
   * refusal was about something other than permission, and saying "forbidden"
   * there would be a green test over a reader who can walk straight in.
   */
  async assertForbidden(): Promise<void> {
    const { list, create } = await this.#doors();
    if (list.ok) {
      throw new Error(
        `Expected ${this.#name} to be out of reach for this reader, and its list ` +
          `page answered ${String(list.status)}.`,
      );
    }
    if (create.ok) {
      throw new Error(
        `${this.#name}'s list page answered ${String(list.status)}, but its create ` +
          `page answered ${String(create.status)} for the same reader. A permission ` +
          `that shut one would have shut both, so the list is refusing for some ` +
          `other reason — a missing data adapter, most often — and this reader is ` +
          `not actually out of reach.`,
      );
    }
  }

  /** That this reader can reach it, which is the other half of the same door. */
  async assertAllowed(): Promise<void> {
    const { list, create } = await this.#doors();
    if (!list.ok && !create.ok) {
      throw new Error(
        `Expected ${this.#name} to be reachable for this reader. Its list page ` +
          `answered ${String(list.status)} and its create page ` +
          `${String(create.status)}.`,
      );
    }
  }

  async #doors(): Promise<{ list: Response; create: Response }> {
    const at = encodeURIComponent(this.#slug);
    // In order rather than together: two requests racing through one panel is
    // the harness making the panel do something its own client never does.
    const list = await this.#wire.get(`/${at}`);
    const create = await this.#wire.get(`/${at}/create`);
    return { list, create };
  }
}
