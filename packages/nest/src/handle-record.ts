/**
 * Writing a row, through the host's own persistence where it has one.
 *
 * `handleRecordCreation` and `handleRecordUpdate` are the escape hatch: an
 * application with domain logic writes through a service or an event bus, not
 * by having a panel reach into its tables. Without them the panel is only
 * usable where the database is the model, which is not where most applications
 * with anything to administer are.
 *
 * Here rather than at each write, because there are three of them: a create, a
 * save, and a cell written from a table. A hook honoured at two of the three is
 * worse than none, since the one that slipped through writes to a database the
 * application said it does not use, and says nothing.
 */
import type { DataAdapter, Id, Row, WriteTree } from "@perchjs/core";
import type { RegisteredResource } from "./resource-registry.js";

/**
 * What comes back has to be the row, and has to carry its key.
 *
 * Everything after a write reads it: the response names the row by its key,
 * and a create redirects to it. A hook returning something else does not fail
 * anywhere in particular. The save answers with an empty record, the browser
 * stays on a form it has already used, and nothing says why, which is the one
 * outcome worth refusing outright.
 */
function answered(
  resource: RegisteredResource,
  data: DataAdapter,
  hook: string,
  given: unknown,
): Row {
  const key = data.meta(resource.metadata.model).primaryKey.name;
  const row = typeof given === "object" && given !== null ? (given as Row) : undefined;
  const held = row?.[key];
  if (held === undefined || held === null) {
    throw new Error(
      // Named twice, and the slug is the half that survives: a class name is
      // whatever the application's own build left of it, and this runs in the
      // application's process rather than in ours.
      `${resource.instance.constructor.name}.${hook}, on the resource at ` +
        `\`${resource.metadata.slug}\`, must answer with the row it wrote, ` +
        `carrying \`${key}\`. The panel names the row by its key and a create ` +
        `goes to it, so a row without one leaves the reader on a form that has ` +
        `already saved.`,
    );
  }
  return row as Row;
}

/**
 * A transaction, because a row and its repeater's rows are one write.
 *
 * Only around the framework's own write. A hook replaces persistence, and what
 * it replaces it with may not be a database at all: wrapping it would promise
 * an atomicity nothing here can keep.
 */
export async function createRecord(
  resource: RegisteredResource,
  data: DataAdapter,
  write: WriteTree,
): Promise<Row> {
  const handle = resource.instance.handleRecordCreation?.bind(resource.instance);
  if (handle === undefined) {
    return await data.transaction(async (tx) =>
      tx.create(resource.metadata.model, write),
    );
  }
  return answered(resource, data, "handleRecordCreation", await handle(write));
}

export async function updateRecord(
  resource: RegisteredResource,
  data: DataAdapter,
  key: Id,
  record: Row,
  write: WriteTree,
): Promise<Row> {
  const handle = resource.instance.handleRecordUpdate?.bind(resource.instance);
  if (handle === undefined) {
    return await data.transaction(async (tx) =>
      tx.update(resource.metadata.model, key, write),
    );
  }
  // The row as it stands is handed over too. What an application needs to write
  // an update through its own service is usually the thing being changed, and
  // reading it back inside the hook would be a second query for a row the panel
  // has already got.
  return answered(resource, data, "handleRecordUpdate", await handle(record, write));
}
