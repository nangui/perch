/**
 * One resource, as a test addresses it.
 *
 * The slug comes off the class's own decorator rather than being named again
 * in the test: a slug written twice is one that stops matching the day
 * somebody renames a model.
 */
import { resourceMetadata } from "@perchjs/nest";
import type { Wire } from "./wire.js";
import { FormTest } from "./form.js";

export class ResourceTest {
  readonly #wire: Wire;
  readonly #slug: string;
  readonly #name: string;

  constructor(wire: Wire, type: unknown) {
    const metadata = resourceMetadata(type);
    const name = (type as { name?: string }).name ?? "the resource";
    if (metadata === undefined) {
      throw new Error(`${name} carries no @PanelResource, so it is not a resource.`);
    }
    this.#wire = wire;
    this.#slug = metadata.slug;
    this.#name = name;
  }

  form(): FormTest {
    return new FormTest(this.#wire, this.#slug);
  }

  /**
   * That this reader cannot reach the resource at all.
   *
   * Asked of the list page, which is the door a menu leads to. The panel
   * answers the same thing for a resource that is forbidden and one that does
   * not exist, on purpose — so this asserts that the door is shut, not which
   * of the two reasons it gives.
   */
  async assertForbidden(): Promise<void> {
    const response = await this.#wire.get(`/${encodeURIComponent(this.#slug)}`);
    if (response.ok) {
      throw new Error(
        `Expected ${this.#name} to be out of reach for this reader, and its list ` +
          `page answered ${String(response.status)}.`,
      );
    }
  }

  /** That this reader can reach it, which is the other half of the same door. */
  async assertAllowed(): Promise<void> {
    const response = await this.#wire.get(`/${encodeURIComponent(this.#slug)}`);
    if (!response.ok) {
      throw new Error(
        `Expected ${this.#name} to be reachable for this reader, and its list page ` +
          `answered ${String(response.status)}.`,
      );
    }
  }
}
