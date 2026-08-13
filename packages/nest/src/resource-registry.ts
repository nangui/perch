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
import type { Component } from "@perchjs/core";
import type { DataAdapter, Table } from "@perchjs/core";
import {
  auditSchema,
  auditTable,
  columnPaths,
  describeComplaints,
  findModel,
  FileUpload,
  resolvePath,
} from "@perchjs/core";
import type { PanelResource, ResourceMetadata } from "./resource.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";
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
  readonly #disks: PanelDisks;
  readonly #data: DataAdapter | null;

  constructor(
    @Inject(PANEL_RESOURCE_TYPES) types: readonly ResourceClass[],
    moduleRef: ModuleRef,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
  ) {
    this.#moduleRef = moduleRef;
    this.#disks = disks;
    this.#data = data;

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
      const form = instance.form();
      const complaints = [
        ...auditSchema(form),
        ...(table === undefined ? [] : auditTable(table)),
        ...this.#unknownDisks(form),
        ...(table === undefined ? [] : this.#unreachableColumns(metadata.model, table)),
      ];
      if (complaints.length > 0) {
        throw new Error(describeComplaints(`Resource "${metadata.slug}"`, complaints));
      }
    }
  }

  /**
   * Columns reading a path the model does not have.
   *
   * Not `auditTable`'s to catch: the IR is the adapter's and the domain has
   * never heard of it. A typo here is a column that renders blank on every row
   * for as long as nobody looks closely — and, since the loading plan is built
   * from these paths, a relation that silently never loads.
   */
  #unreachableColumns(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();

    // A model the IR does not carry is one problem, not one per column, and it
    // is not this check's. The read path tolerates it the same way: `allowed`
    // answers with an empty set rather than complaining about every path.
    if (findModel(ir, model) === undefined) return [];

    return columnPaths(table).flatMap((path) => {
      try {
        resolvePath(ir, model, path);
        return [];
      } catch (error) {
        return [
          {
            field: path,
            problem: `is a column on \`${model}\` that reads nothing: ${
              error instanceof Error ? error.message : "the path does not resolve"
            }`,
          },
        ];
      }
    });
  }

  /**
   * Uploads pointed at a disk nobody provided.
   *
   * Not `auditSchema`'s to catch: which disks exist is the host's arrangement
   * and `@perchjs/core` has never heard of it. The complaint reads the same
   * either way, which is the point — a field that cannot work stops the boot
   * wherever the reason for it happens to live.
   */
  #unknownDisks(form: Component): readonly { field: string; problem: string }[] {
    const uploads = flatten(form).filter(
      (component): component is FileUpload => component instanceof FileUpload,
    );

    return uploads
      .filter((upload) => !(upload.state.disk in this.#disks))
      .map((upload) => ({
        field: upload.name === "" ? "an unnamed FileUpload" : upload.name,
        problem:
          `names the disk \`${upload.state.disk}\`, which the panel was not given — ` +
          `it has ${describeDisks(this.#disks)}`,
      }));
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

function flatten(component: Component): readonly Component[] {
  return [component, ...component.children.flatMap(flatten)];
}

/** Named rather than counted: the usual mistake is a typo, and a name shows it. */
function describeDisks(disks: PanelDisks): string {
  const names = Object.keys(disks);
  if (names.length === 0) return "none at all";
  return names.map((name) => `\`${name}\``).join(", ");
}
