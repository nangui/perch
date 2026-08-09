/**
 * Rows in a variable, so the example runs with no database.
 *
 * A real panel passes `@perchjs/prisma` here instead. What this shows is that
 * the panel never learns which one it got: the port below is the whole of what
 * it asks for.
 */
import { Injectable } from "@nestjs/common";
import type {
  DataAdapter,
  FieldMeta,
  Id,
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
  isLongText: false,
});

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
  ],
  relations: [],
  uniqueConstraints: [["id"]],
  hasSoftDelete: false,
  labelField: "firstName",
};

@Injectable()
export class MemoryAdapter implements DataAdapter {
  #rows: Row[] = [
    { id: 1, firstName: "Ada", lastName: "Lovelace", country: "fr", city: "lyon" },
  ];
  #nextId = 2;

  ir(): Ir {
    return { models: [PERSON] };
  }

  meta(): ModelMeta {
    return PERSON;
  }

  findMany(query: Query): Promise<Page> {
    const rows = this.#rows.slice(
      query.skip ?? 0,
      (query.skip ?? 0) + (query.take ?? 25),
    );
    return Promise.resolve({ rows, total: this.#rows.length });
  }

  findOne(_model: string, id: Id): Promise<Row | null> {
    return Promise.resolve(this.#rows.find((row) => row["id"] === id) ?? null);
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
