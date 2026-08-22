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
import type { Component, EntryRelation, Ir } from "@perchjs/core";
import type { RelationManager } from "./relation-manager.js";
import { relationScope } from "./relation-scope.js";
import type { DataAdapter, Schema, Table } from "@perchjs/core";
import {
  auditInfolist,
  auditSchema,
  auditTable,
  columnPaths,
  declaredActions,
  entryPaths,
  entryRelations,
  TernaryFilter,
  TrashedFilter,
  describeComplaints,
  Field,
  findModel,
  FileUpload,
  Repeater,
  resolvePath,
} from "@perchjs/core";
import type { PanelResource, ResourceMetadata } from "./resource.js";
import { PANEL_DATA_ADAPTER } from "./data-adapter.token.js";
import type { SchemaHook } from "./schema-hook.js";
import { PANEL_SCHEMA_HOOKS } from "./schema-hook.js";
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
  readonly #hooks: readonly SchemaHook[];

  constructor(
    @Inject(PANEL_RESOURCE_TYPES) types: readonly ResourceClass[],
    moduleRef: ModuleRef,
    @Inject(PANEL_STORAGE) disks: PanelDisks,
    @Inject(PANEL_DATA_ADAPTER) data: DataAdapter | null,
    @Inject(PANEL_SCHEMA_HOOKS) hooks: readonly SchemaHook[],
  ) {
    this.#moduleRef = moduleRef;
    this.#disks = disks;
    this.#data = data;
    this.#hooks = hooks;

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
   * The form a resource shows, with everything that extends it.
   *
   * One place, because eight routes read a form and a field that one of them
   * knows about and another does not is a field that shows and will not save.
   *
   * Evaluated on each call, like `form()` itself. A route needing the same
   * form twice reads it once and carries it, rather than asking twice and
   * hoping somebody else's function answers the same thing both times.
   */
  formFor(resource: RegisteredResource): Schema {
    return this.#hooks.reduce(
      (schema, extend) => extend(resource.metadata, schema),
      resource.instance.form(),
    );
  }

  /**
   * What the View page reads, or nothing where the resource declares none.
   *
   * The extension hooks are not applied. They were written for the form, and
   * whether a module that adds a column to one should also add it to the other
   * is a decision nobody has taken — taking it here by spreading a reduce would
   * be taking it silently.
   */
  infolistFor(resource: RegisteredResource): Schema | undefined {
    return resource.instance.infolist?.();
  }

  /**
   * Every form is read once, here, and a form that cannot work stops the boot.
   *
   * Not in the constructor: the instances come from the container, and asking
   * for them before it has finished building would depend on the order it
   * happens to build providers in.
   *
   * Loud, and at boot, because these are lines of somebody's own form rather
   * than anything a client sent. A field that promises what it cannot do
   * otherwise fails at the one moment nobody is watching for it — under a
   * reader, in production, with no error at all.
   */
  onModuleInit(): void {
    for (const registered of this.all()) {
      const { metadata, instance } = registered;
      const table = instance.table?.();
      const managers = instance.relations?.() ?? [];
      // Audited as it will be served: a field a hook adds is somebody's code
      // too, and one that cannot work should stop this boot rather than the
      // first reader.
      const form = this.formFor(registered);
      const infolist = this.infolistFor(registered);
      const complaints = [
        ...auditSchema(form),
        ...(infolist === undefined ? [] : auditInfolist(infolist)),
        ...(table === undefined ? [] : auditTable(table)),
        ...this.#unknownDisks(form),
        ...this.#unknownColumnDisks(table),
        ...managers.flatMap((manager) => this.#unknownColumnDisks(manager.state.table)),
        ...this.#unwritableFields(metadata.model, form),
        ...(table === undefined ? [] : this.#unreachableColumns(metadata.model, table)),
        ...(table === undefined ? [] : this.#unmarkableTable(metadata.model, table)),
        ...(table === undefined ? [] : this.#unaskableFilters(metadata.model, table)),
        ...this.#unscopableRelations(metadata.model, managers),
        ...this.#reassigningFields(metadata.model, managers),
        ...this.#unwritableChildren(metadata.model, managers),
        ...this.#unfollowableActions(managers),
        // The same reading of a manager's form as the resource's own gets.
        ...managers.flatMap((manager) =>
          manager.state.form === undefined
            ? []
            : this.#unknownDisks(manager.state.form),
        ),
        ...managers.flatMap((manager) => auditTable(manager.state.table)),
        ...managers.flatMap((manager) =>
          manager.state.form === undefined ? [] : auditSchema(manager.state.form),
        ),
        ...(infolist === undefined
          ? []
          : this.#unreadablePaths(metadata.model, entryPaths(infolist), "entry")),
        ...(infolist === undefined
          ? []
          : this.#unreadableRows(metadata.model, infolist)),
      ];
      if (complaints.length > 0) {
        throw new Error(describeComplaints(`Resource "${metadata.slug}"`, complaints));
      }
    }
  }

  /**
   * A manager whose scope cannot be worked out.
   *
   * Every read and write it makes is narrowed by one derived column, so this is
   * a security boundary and not a convenience: it is settled here, at the one
   * moment somebody is watching, rather than under the first reader.
   */
  #unscopableRelations(
    model: string,
    managers: readonly RelationManager[],
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();

    return managers.flatMap((manager) => {
      try {
        relationScope(ir, model, manager.state.relation);
        return [];
      } catch (error) {
        return [
          {
            field: manager.state.relation,
            problem: `cannot be narrowed to one \`${model}\`: ${
              error instanceof Error ? error.message : "the scope does not resolve"
            }`,
          },
        ];
      }
    });
  }

  /**
   * A manager form declaring the column that says which parent a child is.
   *
   * The server fills it from the address and writes it last, so the field edits
   * nothing whatever the reader puts in it. Refused rather than overridden
   * quietly: a select that visibly offers to move a child to another parent,
   * and does not, is worse than no select.
   */
  #reassigningFields(
    model: string,
    managers: readonly RelationManager[],
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();

    return managers.flatMap((manager) => {
      const form = manager.state.form;
      if (form === undefined) return [];

      let scope;
      try {
        scope = relationScope(ir, model, manager.state.relation);
      } catch {
        // Already complained about above, and once is enough.
        return [];
      }

      return ownFields(form.children)
        .filter((field) => field.name === scope.foreignKey)
        .map((field) => ({
          field: `${manager.state.relation}.${field.name}`,
          problem:
            `is the column that says which \`${model}\` a child belongs to. The ` +
            "server fills it from the address, so the field would edit nothing",
        }));
    });
  }

  /**
   * A trashed filter on a model with nothing to mark.
   *
   * Three states that all mean the same page: the control offers a question the
   * table cannot answer, and answering it with the ordinary rows is worse than
   * refusing the form.
   */
  #unmarkableTable(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    if (findModel(this.#data.ir(), model)?.hasSoftDelete === true) return [];

    return table.state.filters
      .filter((filter) => filter instanceof TrashedFilter)
      .map((filter) => ({
        field: filter.state.name,
        problem:
          `filters deleted rows on \`${model}\`, which has no deletion column — ` +
          "every one of its three states shows the same page",
      }));
  }

  /**
   * A ternary filter on a column that does not hold one of two answers.
   *
   * `equals true` against a `String` matches nothing, on every row, for ever —
   * an empty table that reads as a table with nothing in it.
   */
  #unaskableFilters(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();
    if (findModel(ir, model) === undefined) return [];

    return table.state.filters.flatMap((filter) => {
      if (!(filter instanceof TernaryFilter)) return [];
      let type: string | undefined;
      try {
        type = resolvePath(ir, model, filter.state.path).field.type;
      } catch {
        // A path that does not resolve is `#unreadablePaths`' complaint, and
        // saying it twice helps nobody.
        return [];
      }
      if (type === "Boolean") return [];
      return [
        {
          field: filter.state.name,
          problem:
            `asks yes or no of \`${filter.state.path}\`, which is a \`${type}\` — ` +
            "the comparison matches nothing, on every row",
        },
      ];
    });
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
    return this.#unreadablePaths(model, columnPaths(table), "column");
  }

  /**
   * A repeatable entry naming something that is not a to-many relation, and the
   * paths its rows read judged against the row's own model.
   *
   * Two mistakes with the same look on screen — an empty section — and neither
   * reported by anything: a relation the model does not have, and a column that
   * is on the record rather than on one of its rows.
   */
  #unreadableRows(
    model: string,
    infolist: Schema,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    return this.#rowsUnder(this.#data.ir(), model, entryRelations(infolist));
  }

  /** One level of rows, then the rows those rows hold. */
  #rowsUnder(
    ir: Ir,
    model: string,
    relations: readonly EntryRelation[],
  ): readonly { field: string; problem: string }[] {
    const owner = findModel(ir, model);
    if (owner === undefined) return [];

    return relations.flatMap((entry) => {
      const found = owner.relations.find((one) => one.name === entry.relation);
      if (found === undefined || !found.isList) {
        return [
          {
            field: entry.relation,
            problem:
              `is a repeatable entry on \`${model}\`, which has no to-many ` +
              `relation by that name — it reads rows, so it needs one`,
          },
        ];
      }
      return [
        ...this.#unreadablePaths(found.targetModel, entry.paths, "entry"),
        ...this.#rowsUnder(ir, found.targetModel, entry.relations),
      ];
    });
  }

  /**
   * A manager's action that is a link rather than something to carry out.
   *
   * A link is an address the client builds, and a child has no page of its
   * own — a manager writes in place, through the parent. So the renderer, told
   * no path for these rows, draws nothing at all: the button crosses the wire
   * and disappears. Refused here rather than discovered by its absence.
   */
  #unfollowableActions(
    managers: readonly RelationManager[],
  ): readonly { field: string; problem: string }[] {
    return managers.flatMap((manager) =>
      [...declaredActions(manager.state.table).values()]
        .filter((action) => action.trigger === "link")
        .map((action) => ({
          field: `${manager.state.relation}.${action.state.name ?? action.type}`,
          problem:
            "is a link to a page a child does not have. A manager works through " +
            "the parent, so what it offers has to be something the server carries out",
        })),
    );
  }

  /**
   * The same reading of a manager's form, against the model it writes.
   *
   * A child form is a form; nothing about being reached through a parent makes
   * a column name any more likely to be right.
   */
  #unwritableChildren(
    model: string,
    managers: readonly RelationManager[],
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();

    return managers.flatMap((manager) => {
      const form = manager.state.form;
      if (form === undefined) return [];
      try {
        const scope = relationScope(ir, model, manager.state.relation);
        return this.#writesUnder(ir, scope.model, form.children);
      } catch {
        // Already complained about above, and once is enough.
        return [];
      }
    });
  }

  /**
   * A form field writing a column the model has not.
   *
   * The one shape of declaration nothing else here judges. A table column that
   * reads nothing is caught, an entry that reads nothing is caught, and a field
   * naming a column by a typo has until now reached the database — where the
   * adapter refuses the whole write, under a reader, with the form's contents
   * gone.
   *
   * Only what is written: a field marked as not dehydrated is a control that
   * was never going to be a column, which is a thing forms legitimately have.
   */
  #unwritableFields(
    model: string,
    form: Schema,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    return this.#writesUnder(this.#data.ir(), model, form.children);
  }

  /** One level of columns, then whatever a repeater's rows write. */
  #writesUnder(
    ir: Ir,
    model: string,
    nodes: readonly Component[],
  ): readonly { field: string; problem: string }[] {
    const owner = findModel(ir, model);
    if (owner === undefined) return [];
    const columns = new Set(owner.fields.map((one) => one.name));

    const here = ownFields(nodes)
      .filter((field) => field.state.dehydrated && field.name !== "")
      .filter((field) => !columns.has(field.name))
      .map((field) => ({
        field: field.name,
        problem:
          `is a field on \`${model}\`, which has no column by that name. The ` +
          "write names it, so the row it belongs to is refused whole",
      }));

    const rows = ownRepeaters(nodes).flatMap((repeater) => {
      const name = repeater.state.relationship ?? repeater.name;
      const found = owner.relations.find((one) => one.name === name && one.isList);
      if (found === undefined) {
        return [
          {
            field: name,
            problem:
              `is a repeater on \`${model}\`, which has no to-many relation by ` +
              "that name — it writes rows, so it needs one",
          },
        ];
      }
      return this.#writesUnder(ir, found.targetModel, repeater.children);
    });

    return [...here, ...rows];
  }

  /** Shared, because a column and an entry speak the same path language. */
  #unreadablePaths(
    model: string,
    paths: readonly string[],
    what: string,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();

    // A model the IR does not carry is one problem, not one per path, and it is
    // not this check's. The read path tolerates it the same way: `allowed`
    // answers with an empty set rather than complaining about every path.
    if (findModel(ir, model) === undefined) return [];

    return paths.flatMap((path) => {
      try {
        resolvePath(ir, model, path);
        return [];
      } catch (error) {
        return [
          {
            field: path,
            problem: `is ${what === "entry" ? "an" : "a"} ${what} on \`${model}\` that reads nothing: ${
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
  /**
   * Columns pointed at a disk nobody provided.
   *
   * The same complaint as an upload's, for the same reason: a column of keys
   * with no disk to resolve them draws an empty cell in every row and says
   * nothing about why.
   */
  #unknownColumnDisks(
    table: Table | undefined,
  ): readonly { field: string; problem: string }[] {
    return (table?.state.columns ?? [])
      .map((column) => column.state)
      .filter((state) => state.disk !== undefined && !(state.disk in this.#disks))
      .map((state) => ({
        field: state.path,
        problem:
          `names the disk \`${String(state.disk)}\`, which the panel was not given — ` +
          `it has ${describeDisks(this.#disks)}`,
      }));
  }

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

/**
 * The fields writing columns of one model.
 *
 * Stops at a repeater, whose rows are another model's: a column name means
 * something else in there, and judging it here would refuse a form that is
 * right. What is inside one is judged against that model instead.
 */
function ownFields(nodes: readonly Component[]): readonly Field[] {
  return nodes.flatMap((node) => {
    if (node instanceof Repeater) return [];
    if (node instanceof Field) return [node];
    return ownFields(node.children);
  });
}

/** The repeaters at this level, each the root of a model of its own. */
function ownRepeaters(nodes: readonly Component[]): readonly Repeater[] {
  return nodes.flatMap((node) =>
    node instanceof Repeater ? [node] : ownRepeaters(node.children),
  );
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
