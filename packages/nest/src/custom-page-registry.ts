/**
 * Path → page.
 *
 * The metadata is read at bootstrap and the instances are not, for the reason
 * the resource registry gives: asking the container for them from a
 * constructor depends on the order it happens to build providers in, and this
 * class declares no dependency on any of them.
 *
 * Two pages on one path, or a page on a resource's path, stop the boot. One of
 * the two would be unreachable and nothing on any page would say which, or
 * why — and a panel that answers the wrong page at an address is worse than
 * one that refuses to start.
 */
import type { OnModuleInit } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { auditSchema, describeComplaints, refuseIcon } from "@perchjs/core";
import type { PageMetadata, PanelPage } from "./custom-page.js";
import { pageMetadata } from "./custom-page.js";
import { PANEL_RESOURCE_TYPES } from "./resource-registry.js";
import { resourceMetadata } from "./resource.js";

export const PANEL_PAGE_TYPES = Symbol("PERCH_PANEL_PAGE_TYPES");

/** Segments the panel already routes under its own path. */
const RESERVED_PATHS = new Set(["assets", "api"]);

export type PageClass = new (...args: never[]) => PanelPage;

export interface RegisteredPage {
  readonly metadata: PageMetadata;
  readonly instance: PanelPage;
}

@Injectable()
export class CustomPageRegistry implements OnModuleInit {
  readonly #byPath = new Map<string, { metadata: PageMetadata; type: PageClass }>();
  readonly #moduleRef: ModuleRef;

  constructor(
    @Inject(PANEL_PAGE_TYPES) types: readonly PageClass[],
    @Inject(PANEL_RESOURCE_TYPES)
    resources: readonly (new (...args: never[]) => unknown)[],
    moduleRef: ModuleRef,
  ) {
    this.#moduleRef = moduleRef;

    const slugs = new Map<string, string>();
    for (const type of resources) {
      const metadata = resourceMetadata(type);
      if (metadata !== undefined) slugs.set(metadata.slug, type.name);
    }

    for (const type of types) {
      const metadata = pageMetadata(type);
      if (metadata === undefined) {
        throw new Error(`${type.name} is listed in pages but carries no @PanelPage.`);
      }

      if (metadata.path === "" || metadata.path.includes("/")) {
        // One segment, because that is what the route matches. A path with a
        // slash in it would sit at an address the panel never registered.
        throw new Error(
          `${type.name} claims the path ${JSON.stringify(metadata.path)}, which is not ` +
            `a single segment. A page lives at one segment under the panel.`,
        );
      }

      if (RESERVED_PATHS.has(metadata.path)) {
        // It would mount under the panel's own routes and lose, silently.
        throw new Error(
          `${type.name} claims the path "${metadata.path}", which the panel already ` +
            `serves. Give it another path.`,
        );
      }

      const resource = slugs.get(metadata.path);
      if (resource !== undefined) {
        // The resource wins the address, so the page would never be reached.
        throw new Error(
          `${type.name} claims the path "${metadata.path}", which the resource ` +
            `${resource} already answers at. Give one of them another path.`,
        );
      }

      const clash = this.#byPath.get(metadata.path);
      if (clash !== undefined) {
        throw new Error(
          `${type.name} and ${clash.type.name} both claim the path ` +
            `"${metadata.path}". Give one of them another path.`,
        );
      }

      this.#byPath.set(metadata.path, { metadata, type });
    }
  }

  /**
   * Read at boot, loudly, for the reason a resource's form is: these are lines
   * of somebody's own schema, and one that promises what it cannot do
   * otherwise fails at the moment nobody is watching for it — under a reader,
   * in production, with no error at all.
   */
  onModuleInit(): void {
    for (const { metadata, instance } of this.all()) {
      const complaints = [
        ...auditSchema(instance.schema()),
        ...refuseIcon(metadata.icon, "its entry in the menu"),
      ];
      if (complaints.length > 0) {
        throw new Error(describeComplaints(`Page "${metadata.path}"`, complaints));
      }
    }
  }

  get(path: string): RegisteredPage | undefined {
    const registered = this.#byPath.get(path);
    return registered === undefined ? undefined : this.#resolve(registered);
  }

  all(): readonly RegisteredPage[] {
    return [...this.#byPath.values()].map((registered) => this.#resolve(registered));
  }

  #resolve(registered: { metadata: PageMetadata; type: PageClass }): RegisteredPage {
    return {
      metadata: registered.metadata,
      instance: this.#moduleRef.get<PanelPage>(registered.type, { strict: false }),
    };
  }
}
