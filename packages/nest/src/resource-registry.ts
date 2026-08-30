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
import type { Action, Component, EntryRelation, Ir } from "@perchjs/core";
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
  DateRangeFilter,
  everyAction,
  NumberRangeFilter,
  ReplicateAction,
  TernaryFilter,
  TrashedFilter,
  describeComplaints,
  Field,
  findModel,
  FileUpload,
  Repeater,
  resolvePath,
  Select,
  WritableColumn,
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

/**
 * Which filters need a column of a particular type, and what goes wrong.
 *
 * A list rather than a chain of `instanceof`, so the next one that compares
 * rather than matches is a line here instead of a check somebody forgets.
 */
const ASKS: readonly {
  /** A predicate rather than a class: a private constructor is not a type. */
  readonly of: (filter: object) => boolean;
  /** Every column type that can answer it. More than one where a number is. */
  readonly wants: readonly string[];
  readonly asking: string;
  readonly consequence: string;
}[] = [
  {
    of: (filter) => filter instanceof TernaryFilter,
    wants: ["Boolean"],
    asking: "asks yes or no of",
    consequence: "the comparison matches nothing, on every row",
  },
  {
    of: (filter) => filter instanceof DateRangeFilter,
    wants: ["DateTime"],
    asking: "asks for a range of dates in",
    consequence:
      "a date compared against a column that holds none is an empty table on " +
      "one adapter and a failed request on another",
  },
  {
    of: (filter) => filter instanceof NumberRangeFilter,
    wants: ["Int", "BigInt", "Float", "Decimal"],
    asking: "asks for a range of numbers in",
    consequence:
      "a number compared against a column of text is an ordering nobody " +
      "declared — `9` after `10`, and every row on the wrong side of it",
  },
];

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
   * The table the resource declares, or nothing.
   *
   * Read per call rather than kept, for the reason `formFor` gives: a route
   * that needs it twice reads it once and carries it.
   */
  tableFor(resource: RegisteredResource): Table | undefined {
    return resource.instance.table?.();
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
        ...this.#unwritableCells(table, form),
        ...managers.flatMap((manager) => this.#uneditableManager(manager)),
        ...managers.flatMap((manager) => this.#unknownColumnDisks(manager.state.table)),
        ...this.#unwritableFields(metadata.model, form),
        ...(this.#data === null
          ? []
          : this.#uncreatableOptions(this.#data.ir(), metadata.model, form.children)),
        // Read as its own root rather than walked into: the dialog writes
        // another table, so a name meaning one column here means a different
        // one in there, and judging the two path spaces as one would refuse a
        // pair of forms that are both right.
        ...createOptionForms(form).flatMap((one) => auditSchema(one)),
        ...(table === undefined ? [] : this.#unreachableColumns(metadata.model, table)),
        ...(table === undefined ? [] : this.#unmarkableTable(metadata.model, table)),
        ...(table === undefined ? [] : this.#unaskableFilters(metadata.model, table)),
        ...(table === undefined
          ? []
          : this.#unshowableModals(table, infolist, managers)),
        ...(table === undefined ? [] : this.#collidingCopies(metadata.model, table)),
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
   * A modal with nothing to show in it.
   *
   * A view opened in place draws the resource's infolist — the same one the
   * View page draws, because a resource that has said how a record reads has
   * said it once. Without one there is nothing to open, and the page it would
   * otherwise have navigated to does not exist either.
   *
   * The page form says the same thing by answering 404 to a reader. A modal
   * cannot: the button is already on their screen, and pressing it would open
   * a dialog that says nothing and then closes.
   */
  #unshowableModals(
    table: Table,
    infolist: Schema | undefined,
    managers: readonly RelationManager[],
  ): readonly { field: string; problem: string }[] {
    const named = (action: Action): string => action.state.name ?? action.type;
    const shows = (from: Table): readonly Action[] =>
      everyAction([
        ...from.state.actions,
        ...from.state.headerActions,
        ...from.state.bulkActions,
      ]).filter((action) => action.trigger === "show");

    const complaints: { field: string; problem: string }[] = [];

    // One record, so where one record is. A header action on a list has none
    // and a bulk action has however many were ticked — the route refuses both,
    // and a button that opens a dialog which then 404s is worse than no button.
    for (const action of everyAction([
      ...table.state.headerActions,
      ...table.state.bulkActions,
    ])) {
      if (action.trigger !== "show") continue;
      complaints.push({
        field: named(action),
        problem:
          "opens one record in a dialog, and is declared where there is not one — " +
          "a header action has no row and a bulk action has however many were ticked",
      });
    }

    // A manager's rows are another model, and a manager declares no infolist of
    // its own. There is nothing to draw and no route that would serve it.
    for (const manager of managers) {
      for (const action of shows(manager.state.table)) {
        complaints.push({
          field: named(action),
          problem:
            "opens a record in a dialog from a relation manager, whose rows are " +
            "another model with no `infolist()` of their own",
        });
      }
    }

    if (infolist === undefined) {
      for (const action of everyAction(table.state.actions)) {
        if (action.trigger !== "show") continue;
        complaints.push({
          field: named(action),
          problem:
            "opens a record in a dialog, and this resource has no `infolist()` — " +
            "there would be nothing in it",
        });
      }
    }

    return complaints;
  }

  /**
   * A copy that would collide with the row it was copied from.
   *
   * Everything a row holds is carried over except its identity, which is the
   * point — and the trap. A column the database keeps unique is copied into a
   * value that already exists, so the second copy is a constraint error rather
   * than a row, and the reader meets it as a failed request with a driver's
   * message inside it.
   *
   * `.excludeAttributes()` is how a resource says which columns those are. This
   * says which it has found, at boot, where the answer is a line to write
   * rather than a bug to reproduce.
   */
  #collidingCopies(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const found = findModel(this.#data.ir(), model);
    if (found === undefined) return [];

    const copies = [...table.state.actions, ...table.state.bulkActions].filter(
      (action): action is ReplicateAction => action instanceof ReplicateAction,
    );

    return copies.flatMap((action) => {
      const excluded = new Set(action.state.excludeAttributes ?? []);
      // The key is dropped by the copy without being asked, so it is not
      // something a resource has to name.
      const carried = (name: string): boolean =>
        !excluded.has(name) && name !== found.primaryKey.name;

      const colliding = found.fields
        .filter((field) => field.isUnique && !field.isId && carried(field.name))
        .map((field) => field.name);

      // A constraint over several columns collides only when every one of them
      // is carried: leave one behind and the pair is a pair nothing holds yet.
      // Reading `isUnique` alone answered half the question and said nothing
      // about the other half, which fails on the same second press.
      const together = found.uniqueConstraints
        .filter((columns) => columns.length > 1 && columns.every(carried))
        .map((columns) => columns.join(" + "));

      const all = [...colliding, ...together];
      if (all.length === 0) return [];

      return [
        {
          field: action.state.name ?? action.type,
          problem:
            `copies \`${all.join("`, `")}\`, which \`${model}\` keeps unique — ` +
            "the second copy is a constraint error rather than a row. Name them " +
            "in `.excludeAttributes()`",
        },
      ];
    });
  }

  /**
   * A filter asking a column a question its type cannot answer.
   *
   * `equals true` against a `String` matches nothing, on every row, for ever —
   * an empty table that reads as a table with nothing in it. A range is worse,
   * because the two adapters disagree about it: Prisma refuses a `Date`
   * against a `String` column and the request becomes a 500, while an
   * in-memory one compares what it can and returns nothing. Either way the
   * line that was wrong is not the one that says so.
   */
  #unaskableFilters(
    model: string,
    table: Table,
  ): readonly { field: string; problem: string }[] {
    if (this.#data === null) return [];
    const ir = this.#data.ir();
    if (findModel(ir, model) === undefined) return [];

    return table.state.filters.flatMap((filter) => {
      const asks = ASKS.find(({ of }) => of(filter));
      if (asks === undefined) return [];

      let type: string;
      try {
        type = resolvePath(ir, model, filter.state.path).field.type;
      } catch {
        // A path that does not resolve is `#unreadablePaths`' complaint, and
        // saying it twice helps nobody.
        return [];
      }
      if (asks.wants.includes(type)) return [];
      return [
        {
          field: filter.state.name,
          problem:
            `${asks.asking} \`${filter.state.path}\`, which is a \`${type}\` — ` +
            asks.consequence,
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

  /**
   * A select offering to create the option it is missing.
   *
   * Three things have to hold, and none of them is visible from the field's own
   * declaration. The relation has to exist, because the row goes into the model
   * it points at. That model has to have a resource, because a resource is
   * where the permission to create one lives — and a form that writes a row
   * with no policy behind it is not a shortcut past a slow page, it is the way
   * in. And the fields have to be columns of that model rather than of this
   * one, which is the mistake anybody would make: the form is written next to
   * the field it belongs to, and the field belongs to the other table.
   */
  #uncreatableOptions(
    ir: Ir,
    model: string,
    nodes: readonly Component[],
  ): readonly { field: string; problem: string }[] {
    const owner = findModel(ir, model);
    if (owner === undefined) return [];

    const here = ownSelects(nodes).flatMap((select) => {
      const form = select.state.createOptionForm;
      const declared = select.state.relationship;
      // Both already said by `auditSchema`, which runs on the same form. Saying
      // it twice would report one mistake as two.
      if (form === undefined || declared === undefined) return [];

      const name = select.name === "" ? select.type : select.name;
      const relation = owner.relations.find((one) => one.name === declared.name);
      if (relation === undefined) {
        return [
          {
            field: name,
            problem:
              `offers to create an option on the relation \`${declared.name}\`, ` +
              `which \`${model}\` does not have — there is no table to write to`,
          },
        ];
      }

      const resources = this.forModel(relation.targetModel);
      if (resources.length === 0) {
        return [
          {
            field: name,
            problem:
              `offers to create a \`${relation.targetModel}\`, and no resource ` +
              "stands for that model — so there is no `can()` to ask whether " +
              "this reader may, and the dialog would write one anyway",
          },
        ];
      }
      if (resources.length > 1) {
        return [
          {
            field: name,
            problem:
              `offers to create a \`${relation.targetModel}\`, and ` +
              `${String(resources.length)} resources stand for that model — ` +
              "which of their `can()` decides is a coin flip",
          },
        ];
      }

      // Judged against the model being written, not the one the form is
      // written in. Its own schema audit is run beside this, from `onModuleInit`.
      return this.#writesUnder(ir, relation.targetModel, form.children);
    });

    // A repeater's children are not in the resolved tree the routes read —
    // they are resolved a row at a time, under the repeater. So a select in
    // there can be declared, drawn and pressed, and the route that serves the
    // dialog will never find the field it names. Refused where it is written
    // rather than left to answer nothing on a page.
    const rows = ownRepeaters(nodes).flatMap((repeater) =>
      ownSelects(repeater.children)
        .filter((select) => select.state.createOptionForm !== undefined)
        .map((select) => ({
          field: select.name === "" ? select.type : select.name,
          problem:
            `offers to create an option from inside the \`${repeater.name}\` ` +
            "repeater, whose rows are resolved one at a time — the route that " +
            "serves the dialog reads the form's own tree, and never sees this " +
            "field at all",
        })),
    );

    return [...here, ...rows];
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
   * A column offering a control over a path the form does not own.
   *
   * An inline edit is a form save of one field, so a path the form has no field
   * for is a switch that flips, sends, and changes nothing: the trust boundary
   * drops what no field claims, and it drops it in silence. The reader is left
   * pressing a control that works everywhere except on the row.
   */
  #unwritableCells(
    table: Table | undefined,
    form: Component,
  ): readonly { field: string; problem: string }[] {
    const fields = new Map(
      flatten(form)
        .filter((component): component is Field => component instanceof Field)
        .map((field) => [field.name, field] as const),
    );

    return (table?.state.columns ?? [])
      .filter((column): column is WritableColumn => column instanceof WritableColumn)
      .flatMap((column) => {
        const field = fields.get(column.state.path);
        if (field === undefined) {
          return [
            {
              field: column.state.path,
              problem:
                "offers a control in the table and the form has no field at that " +
                "path — a cell is written through the form, so the value would be " +
                "dropped in silence",
            },
          ];
        }
        // A field no client may set can never be written from a cell, whatever
        // kind of control the column draws over it.
        if (!field.acceptsClient) {
          return [
            {
              field: column.state.path,
              problem:
                "offers a control in the table over a field no client may set, " +
                "so the write would be turned away before anything read it",
            },
          ];
        }
        // The path existing is not enough: a switch over a text field wrote a
        // boolean into a text column, because the field takes any scalar and
        // the column only ever asked itself what it wanted.
        if (!column.fits(field)) {
          return [
            {
              field: column.state.path,
              problem:
                `offers a ${column.type} in the table over a ${field.type} on the ` +
                "form, which does not hold what that control writes",
            },
          ];
        }
        return [];
      });
  }

  /**
   * A control offered inside a relation manager, where nothing carries it.
   *
   * A manager's rows are listed by a route that does not say who may write
   * them, and there is no route to write one through — so the switch draws for
   * ever and does nothing. Refused rather than drawn dead, and refused here
   * rather than half-answered somewhere else: the day a manager can be written
   * from, this is the line that comes out.
   */
  #uneditableManager(
    manager: RelationManager,
  ): readonly { field: string; problem: string }[] {
    return manager.state.table.state.columns
      .filter((column) => column instanceof WritableColumn)
      .map((column) => ({
        field: `${manager.state.relation}.${column.state.path}`,
        problem:
          "offers a control inside a relation manager, and a manager's rows are " +
          "not written from the table — the control would draw and do nothing",
      }));
  }

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

  /**
   * The resource standing for a model, which is where its permissions live.
   *
   * Several claiming one model is not resolved here: the boot refuses that
   * arrangement where it matters, rather than picking one of two policies by
   * registration order — which is a coin flip nobody would see land.
   */
  forModel(model: string): readonly RegisteredResource[] {
    return this.all().filter((one) => one.metadata.model === model);
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

/** Every dialog form a form carries, at any depth, repeaters included. */
function createOptionForms(form: Schema): readonly Schema[] {
  return flatten(form).flatMap((node) =>
    node instanceof Select && node.state.createOptionForm !== undefined
      ? [node.state.createOptionForm]
      : [],
  );
}

/** The selects writing this model's relations, stopping where the model does. */
function ownSelects(nodes: readonly Component[]): readonly Select[] {
  return nodes.flatMap((node) => {
    if (node instanceof Repeater) return [];
    if (node instanceof Select) return [node];
    return ownSelects(node.children);
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
