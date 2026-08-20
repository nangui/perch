/**
 * Rows in a variable, so the example runs with no database.
 *
 * A real panel passes `@perchjs/prisma` here instead. What this shows is that
 * the panel never learns which one it got: the port below is the whole of what
 * it asks for.
 *
 * It honours everything the panel actually sends — the sort, the page, the
 * clauses a filter produced, the search and its paths, and the include a
 * relation column asked for. A demo that drew a filter box and then ignored the
 * clause would be showing something that does not work.
 *
 * Everything written here lives as long as the process does. Restarting comes
 * back to the rows below, which is what a variable is — but it looks exactly
 * like the panel having lost the save, so the boot says so out loud rather than
 * leaving somebody to wonder which of the two they are looking at.
 */
import { Injectable } from "@nestjs/common";
import type {
  Clause,
  DataAdapter,
  FieldMeta,
  DeletedRows,
  Id,
  IncludePlan,
  Ir,
  ModelMeta,
  Page,
  Query,
  ReadOptions,
  Row,
  WriteTree,
} from "@perchjs/core";

const scalar = (name: string, type: FieldMeta["type"]): FieldMeta => ({
  name,
  kind: "scalar",
  type,
  isRequired: false,
  isList: false,
  isId: name === "id",
  isUnique: name === "id",
  isReadOnly: name === "id",
  hasDefault: name === "id",
  isLongText: name === "bio",
});

const TEAM: ModelMeta = {
  name: "Team",
  dbName: "Team",
  primaryKey: scalar("id", "Int"),
  fields: [scalar("id", "Int"), scalar("name", "String")],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "name",
};

const NOTE: ModelMeta = {
  name: "Note",
  dbName: "Note",
  primaryKey: scalar("id", "Int"),
  fields: [scalar("id", "Int"), scalar("body", "String"), scalar("personId", "Int")],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "body",
};

const PERSON: ModelMeta = {
  name: "Person",
  dbName: "Person",
  primaryKey: scalar("id", "Int"),
  fields: [
    scalar("id", "Int"),
    scalar("firstName", "String"),
    scalar("lastName", "String"),
    scalar("email", "String"),
    scalar("country", "String"),
    scalar("city", "String"),
    scalar("bio", "String"),
    scalar("role", "String"),
    scalar("active", "Boolean"),
    scalar("onCall", "Boolean"),
    scalar("startsAt", "DateTime"),
    scalar("avatar", "String"),
    scalar("teamId", "Int"),
    scalar("tenantId", "Int"),
    // The tombstone. Named by convention, which is what sets `hasSoftDelete`
    // and what keeps it out of an inferred form.
    scalar("deletedAt", "DateTime"),
  ],
  relations: [
    {
      name: "notes",
      type: "many",
      targetModel: "Note",
      foreignKeyFields: [],
      referencedFields: [],
      isRequired: false,
      isList: true,
    },
    {
      name: "team",
      type: "one",
      targetModel: "Team",
      foreignKeyFields: ["teamId"],
      referencedFields: ["id"],
      isRequired: false,
      isList: false,
    },
  ],
  uniqueConstraints: [["id"]],
  hasSoftDelete: true,
  labelField: "firstName",
};

const TEAMS: Row[] = [
  { id: 1, name: "Engineering" },
  { id: 2, name: "Design" },
];

@Injectable()
export class MemoryAdapter implements DataAdapter {
  #rows: Row[] = [
    {
      id: 1,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      country: "fr",
      city: "lyon",
      bio: "Wrote the first algorithm intended for a machine.",
      role: "lead",
      active: true,
      onCall: false,
      startsAt: new Date("2026-06-15T08:00:00Z"),
      avatar: "",
      teamId: 1,
      tenantId: 1,
    },
    {
      id: 2,
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.com",
      country: "be",
      city: "ghent",
      bio: "",
      role: "member",
      active: true,
      onCall: true,
      startsAt: new Date("2026-10-25T06:30:00Z"),
      avatar: "",
      teamId: 2,
      tenantId: 1,
    },
    {
      id: 3,
      firstName: "Alan",
      lastName: "Turing",
      email: "alan@example.com",
      country: "ci",
      city: "abidjan",
      bio: "",
      role: "member",
      active: false,
      onCall: false,
      startsAt: null,
      avatar: "",
      teamId: 1,
      tenantId: 1,
    },
  ];
  #nextId = 4;

  /** The rows a repeater writes. A child model, kept beside its parent. */
  #notes: Row[] = [
    { id: 1, body: "Wrote the first compiler.", personId: 1 },
    { id: 2, body: "Coined the term debugging.", personId: 2 },
  ];
  #nextNoteId = 3;

  ir(): Ir {
    return { models: [PERSON, NOTE, TEAM] };
  }

  meta(): ModelMeta {
    return PERSON;
  }

  findMany(query: Query): Promise<Page> {
    let rows = this.#rows
      .filter((row) => wanted(row, query.deleted))
      .filter((row) => matches(row, query.clauses));

    const term = query.search?.term.toLowerCase();
    if (term !== undefined && term !== "") {
      const paths = query.search?.paths ?? [];
      rows = rows.filter((row) =>
        paths.some((path) => text(row[path]).toLowerCase().includes(term)),
      );
    }

    // The server orders; the browser only asks.
    const order = query.sort?.[0];
    if (order !== undefined) {
      rows = [...rows].sort((a, b) => {
        const left = text(a[order.path]);
        const right = text(b[order.path]);
        return order.direction === "asc"
          ? left.localeCompare(right)
          : right.localeCompare(left);
      });
    }

    const total = rows.length;
    const from = query.skip ?? 0;
    const page = rows.slice(from, from + (query.take ?? 25));

    // One join for the page, never one per row — which is what the `include`
    // the columns asked for is for.
    return Promise.resolve({
      rows: page.map((row) => join(row, query.include)),
      total,
    });
  }

  /** The children come with the row: they are the only ones an update reaches. */
  findOne(_model: string, id: Id, options?: ReadOptions): Promise<Row | null> {
    const include = options?.include;
    const row = this.#rows.find((one) => one["id"] === id);
    if (row === undefined || !wanted(row, options?.deleted))
      return Promise.resolve(null);
    const notes = this.#notes.filter((note) => note["personId"] === row["id"]);
    return Promise.resolve({ ...join(row, include), notes });
  }

  create(_model: string, data: WriteTree): Promise<Row> {
    const row: Row = { id: this.#nextId++, ...data.set };
    this.#rows.push(row);
    this.#writeRelations(row["id"] as number, data);
    return Promise.resolve(row);
  }

  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    const index = this.#rows.findIndex((row) => row["id"] === id);
    if (index === -1) throw new Error(`no Person ${String(id)}`);
    const row = { ...this.#rows[index], ...data.set } as Row;
    this.#rows[index] = row;
    this.#writeRelations(id as number, data);
    return Promise.resolve(row);
  }

  /**
   * A repeater's rows, as the engine asked for them.
   *
   * A key it has never issued is a create; the rows it did issue are the only
   * ones an update reaches; anything the list stopped naming goes.
   */
  #writeRelations(personId: number, data: WriteTree): void {
    const write = data.relations?.["notes"];
    if (write === undefined) return;

    for (const nested of write.create ?? []) {
      const body = nested.set?.["body"];
      // A row with nothing in it is a row somebody added and did not fill.
      if (typeof body !== "string" || body === "") continue;
      this.#notes.push({ id: this.#nextNoteId++, body, personId });
    }
    for (const { id, data: patch } of write.update ?? []) {
      const at = this.#notes.findIndex((note) => note["id"] === id);
      if (at !== -1) this.#notes[at] = { ...this.#notes[at], ...patch.set };
    }
    for (const id of write.delete ?? []) {
      this.#notes = this.#notes.filter((note) => note["id"] !== id);
    }
  }

  /** A person is soft-deleting, so this marks. Destroying has its own verb. */
  delete(_model: string, ids: readonly Id[]): Promise<number> {
    return Promise.resolve(this.#mark(ids, new Date()));
  }

  forceDelete(_model: string, ids: readonly Id[]): Promise<number> {
    const before = this.#rows.length;
    this.#rows = this.#rows.filter((row) => !ids.includes(row["id"] as Id));
    return Promise.resolve(before - this.#rows.length);
  }

  restore(_model: string, ids: readonly Id[]): Promise<number> {
    return Promise.resolve(this.#mark(ids, null));
  }

  /** Rows that moved, not rows that were named: one already there did not. */
  #mark(ids: readonly Id[], at: Date | null): number {
    let moved = 0;
    this.#rows = this.#rows.map((row) => {
      if (!ids.includes(row["id"] as Id)) return row;
      const marked = row["deletedAt"] != null;
      if (marked === (at !== null)) return row;
      moved += 1;
      return { ...row, deletedAt: at };
    });
    return moved;
  }

  /** No rollback to speak of, which is the honest limit of a variable. */
  /**
   * A copy, and the copy back.
   *
   * The honest limit of a variable used to be that it could not roll back, so
   * a repeater's rows would survive a save that failed halfway. They are two
   * arrays; putting them back is cheap and it is what the milestone claims.
   */
  async transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    const before = { rows: [...this.#rows], notes: [...this.#notes] };
    try {
      return await fn(this);
    } catch (error) {
      this.#rows = before.rows;
      this.#notes = before.notes;
      throw error;
    }
  }
}

/** Whatever the include asked for, attached to the row it belongs to. */
function join(row: Row, include: IncludePlan | undefined): Row {
  if (include?.["team"] === undefined) return row;
  return { ...row, team: TEAMS.find((team) => team["id"] === row["teamId"]) ?? null };
}

/** Whether a row is one this read asked for. `without` where nothing says so. */
function wanted(row: Row, deleted: DeletedRows | undefined): boolean {
  if (deleted === "with") return true;
  const marked = row["deletedAt"] != null;
  return deleted === "only" ? marked : !marked;
}

function matches(row: Row, clauses: readonly Clause[] | undefined): boolean {
  return (clauses ?? []).every((clause) => {
    const value = row[clause.path];
    if (clause.operator === "contains") {
      return text(value).toLowerCase().includes(text(clause.value).toLowerCase());
    }
    // What an action's selection is built from. Without it the fall-through
    // below compares a value to an array and finds nothing, every time.
    if (clause.operator === "in") {
      return Array.isArray(clause.value) && clause.value.includes(value);
    }
    return value === clause.value;
  });
}

/** Sorting and searching compare text; anything a cell cannot show is nothing. */
function text(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : "";
}
