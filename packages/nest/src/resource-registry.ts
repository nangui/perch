/**
 * Slug → resource.
 *
 * The metadata is read at bootstrap, so a missing decorator or two resources on
 * one URL stop the boot. The instances are not: asking the container for them
 * from this constructor would depend on the order it happens to build providers
 * in, and this class declares no dependency on any of them.
 *
 * The schema tree is never cached with an instance either. It is rebuilt per
 * request, because a builder shared between requests leaks one user's state into
 * another's.
 */
import type { OnModuleInit } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { auditSchema, auditTable, describeComplaints } from "@perchjs/core";
import type { PanelResource, ResourceMetadata } from "./resource.js";
import { resourceMetadata } from "./resource.js";

export const PANEL_RESOURCE_TYPES = Symbol("PERCH_PANEL_RESOURCE_TYPES");

/** Segments the panel already routes under its own path. */
const RESERVED_SLUGS = new Set(["assets", "api"]);

export type ResourceClass = new (...args: never[]) => PanelResource;

export interface RegisteredResource {
  readonly metadata: ResourceMetadata;
  readonly instance: PanelResource;
}

@Injectable()
export class ResourceRegistry implements OnModuleInit {
  readonly #bySlug = new Map<
    string,
    { metadata: ResourceMetadata; type: ResourceClass }
  >();
  readonly #moduleRef: ModuleRef;

  constructor(
    @Inject(PANEL_RESOURCE_TYPES) types: readonly ResourceClass[],
    moduleRef: ModuleRef,
  ) {
    this.#moduleRef = moduleRef;

    for (const type of types) {
      const metadata = resourceMetadata(type);
      if (metadata === undefined) {
        throw new Error(
          `${type.name} is listed in resources but carries no @PanelResource.`,
        );
      }

      if (RESERVED_SLUGS.has(metadata.slug)) {
        // It would mount under the panel's own routes and lose, silently.
        throw new Error(
          `${type.name} claims the slug "${metadata.slug}", which the panel already ` +
            `serves. Give it an explicit slug.`,
        );
      }

      const clash = this.#bySlug.get(metadata.slug);
      if (clash !== undefined) {
        // Two resources on one URL: whichever wins, the other is unreachable
        // and nothing would say why.
        throw new Error(
          `${type.name} and ${clash.type.name} both claim the slug "${metadata.slug}". ` +
            `Give one of them an explicit slug.`,
        );
      }

      this.#bySlug.set(metadata.slug, { metadata, type });
    }
  }

  /**
   * Every form is read once, here, and a form that cannot work stops the boot.
   *
   * Not in the constructor: the instances come from the container, and asking
   * for them before it has finished building would depend on the order it
   * happens to build providers in.
   *
   * Loud, and at boot, because these are lines of somebody own form rather
   * than anything a client sent. A field that promises what it cannot do
   * otherwise fails at the one moment nobody is watching for it — under a
   * reader, in production, with no error at all.
   */
  onModuleInit(): void {
    for (const { metadata, instance } of this.all()) {
      const table = instance.table?.();
      const complaints = [
        ...auditSchema(instance.form()),
        ...(table === undefined ? [] : auditTable(table)),
      ];
      if (complaints.length > 0) {
        throw new Error(describeComplaints(`Resource "${metadata.slug}"`, complaints));
      }
    }
  }

  get(slug: string): RegisteredResource | undefined {
    const registered = this.#bySlug.get(slug);
    return registered === undefined ? undefined : this.#resolve(registered);
  }

  all(): readonly RegisteredResource[] {
    return [...this.#bySlug.values()].map((registered) => this.#resolve(registered));
  }

  #resolve(registered: {
    metadata: ResourceMetadata;
    type: ResourceClass;
  }): RegisteredResource {
    return {
      metadata: registered.metadata,
      instance: this.#moduleRef.get<PanelResource>(registered.type, { strict: false }),
    };
  }
}
