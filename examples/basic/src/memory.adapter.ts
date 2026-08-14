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
 */
import { Injectable } from "@nestjs/common";
import type {
  Clause,
  DataAdapter,
  FieldMeta,
  Id,
  IncludePlan,
  Ir,
  ModelMeta,
  Page,
  Query,
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
  ],
  relations: [
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
  hasSoftDelete: false,
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

  ir(): Ir {
    return { models: [PERSON, TEAM] };
  }

  meta(): ModelMeta {
    return PERSON;
  }

  findMany(query: Query): Promise<Page> {
    let rows = this.#rows.filter((row) => matches(row, query.clauses));

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

  findOne(_model: string, id: Id, include?: IncludePlan): Promise<Row | null> {
    const row = this.#rows.find((one) => one["id"] === id);
    return Promise.resolve(row === undefined ? null : join(row, include));
  }

  create(_model: string, data: WriteTree): Promise<Row> {
    const row: Row = { id: this.#nextId++, ...data.set };
    this.#rows.push(row);
    return Promise.resolve(row);
  }

  update(_model: string, id: Id, data: WriteTree): Promise<Row> {
    const index = this.#rows.findIndex((row) => row["id"] === id);
    if (index === -1) throw new Error(`no Person ${String(id)}`);
    const row = { ...this.#rows[index], ...data.set } as Row;
    this.#rows[index] = row;
    return Promise.resolve(row);
  }

  delete(_model: string, ids: readonly Id[]): Promise<number> {
    const before = this.#rows.length;
    this.#rows = this.#rows.filter((row) => !ids.includes(row["id"] as Id));
    return Promise.resolve(before - this.#rows.length);
  }

  /** No rollback to speak of, which is the honest limit of a variable. */
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

/** Whatever the include asked for, attached to the row it belongs to. */
function join(row: Row, include: IncludePlan | undefined): Row {
  if (include?.["team"] === undefined) return row;
  return { ...row, team: TEAMS.find((team) => team["id"] === row["teamId"]) ?? null };
}

function matches(row: Row, clauses: readonly Clause[] | undefined): boolean {
  return (clauses ?? []).every((clause) => {
    const value = row[clause.path];
    if (clause.operator === "contains") {
      return text(value).toLowerCase().includes(text(clause.value).toLowerCase());
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
