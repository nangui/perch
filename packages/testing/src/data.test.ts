/**
 * The contract, against one adapter that keeps it and several that do not.
 *
 * Each fault below is one a plausible implementation has: sorting on what it
 * was asked to sort on and no further, counting what it was asked for rather
 * than what it did, reading deleted rows back because nothing said not to,
 * letting a transaction keep what it wrote. A contract is worth what it
 * catches, so each has to be caught by name.
 *
 * The adapter is small on purpose. It holds rows in an array and answers the
 * eight methods the contract reaches, which is what a reader's own first
 * adapter looks like.
 */
import type {
  DataAdapter,
  Id,
  Ir,
  ModelMeta,
  Page,
  Query,
  ReadOptions,
  Row,
  WriteTree,
} from "@perchjs/core";
import { describe, expect, it } from "vitest";
import { checkDataAdapter } from "./data.js";

/** These rows hold text where they hold anything, which a double may say. */
const text = (value: unknown): string => (typeof value === "string" ? value : "");

interface Held {
  id: number;
  name: string;
  team: string;
  deletedAt: Date | null;
}

const META = {
  name: "Person",
  dbName: "Person",
  primaryKey: { name: "id" },
  fields: [],
  relations: [],
  uniqueConstraints: [],
  hasSoftDelete: true,
  labelField: "name",
} as unknown as ModelMeta;

/** An adapter that keeps the contract, and the base the broken ones bend. */
class Memory implements DataAdapter {
  protected held: Held[] = [];
  #next = 1;

  ir(): Ir {
    throw new Error("not reached by the contract");
  }

  meta(): ModelMeta {
    return META;
  }

  protected live(query: Pick<Query, "deleted">): Held[] {
    const which = query.deleted ?? "without";
    return this.held.filter((row) =>
      which === "with"
        ? true
        : which === "only"
          ? row.deletedAt !== null
          : row.deletedAt === null,
    );
  }

  /** Sorted on what was asked, and then on the key, which is what ends it. */
  protected ordered(query: Query): Held[] {
    const sort = query.sort ?? [];
    return [...this.live(query)].sort((a, b) => {
      for (const one of sort) {
        const left = text((a as unknown as Row)[one.path]);
        const right = text((b as unknown as Row)[one.path]);
        if (left !== right)
          return one.direction === "asc"
            ? left < right
              ? -1
              : 1
            : left < right
              ? 1
              : -1;
      }
      return a.id - b.id;
    });
  }

  findMany(query: Query): Promise<Page> {
    const all = this.ordered(query);
    const from = query.skip ?? 0;
    const rows = all.slice(from, from + (query.take ?? all.length));
    return Promise.resolve({ rows: rows as unknown as Row[], total: all.length });
  }

  findOne(_model: string, id: Id, options?: ReadOptions): Promise<Row | null> {
    const which = options?.deleted;
    const found = this.live(which === undefined ? {} : { deleted: which }).find(
      (row) => String(row.id) === String(id),
    );
    return Promise.resolve((found ?? null) as Row | null);
  }

  create(_model: string, data: WriteTree): Promise<Row> {
    const set = data.set ?? {};
    const row: Held = {
      id: this.#next++,
      name: text(set["name"]),
      team: text(set["team"]),
      deletedAt: null,
    };
    this.held.push(row);
    return Promise.resolve(row as unknown as Row);
  }

  update(): Promise<Row> {
    throw new Error("not reached by the contract");
  }

  delete(_model: string, ids: readonly Id[]): Promise<number> {
    let done = 0;
    for (const row of this.held) {
      if (!ids.some((one) => String(one) === String(row.id)) || row.deletedAt !== null)
        continue;
      row.deletedAt = new Date();
      done += 1;
    }
    return Promise.resolve(done);
  }

  forceDelete(_model: string, ids: readonly Id[]): Promise<number> {
    const before = this.held.length;
    this.held = this.held.filter(
      (row) => !ids.some((one) => String(one) === String(row.id)),
    );
    return Promise.resolve(before - this.held.length);
  }

  restore(_model: string, ids: readonly Id[]): Promise<number> {
    let lifted = 0;
    for (const row of this.held) {
      if (!ids.some((one) => String(one) === String(row.id)) || row.deletedAt === null)
        continue;
      row.deletedAt = null;
      lifted += 1;
    }
    return Promise.resolve(lifted);
  }

  attach(): Promise<void> {
    throw new Error("not reached by the contract");
  }

  detach(): Promise<void> {
    throw new Error("not reached by the contract");
  }

  async transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
    const snapshot = this.held.map((row) => ({ ...row }));
    try {
      return await fn(this);
    } catch (error) {
      this.held = snapshot;
      throw error;
    }
  }
}

const CHECK = {
  model: "Person",
  // Tied on the team, so the order between them is the adapter's to settle.
  rows: [
    { set: { name: "Ada", team: "swifts" } },
    { set: { name: "Grace", team: "swifts" } },
    { set: { name: "Mei", team: "swifts" } },
  ],
  tiedOn: "team",
} as const;

const complaints = async (adapter: DataAdapter): Promise<readonly string[]> =>
  await checkDataAdapter(adapter, CHECK);

describe("an adapter that keeps the contract", () => {
  it("is told nothing", async () => {
    expect(await complaints(new Memory())).toEqual([]);
  });
});

describe("an adapter that does not", () => {
  it("is caught sorting on what it was asked and no further", async () => {
    // The fault the port spends a paragraph on. Every row holds the same team,
    // so the database is free to order them differently on each query, and two
    // pages then repeat one row and never mention another.
    class Unstable extends Memory {
      #asked = 0;

      protected override ordered(query: Query): Held[] {
        // What a database is entitled to do with rows a sort cannot tell
        // apart: hand them back in whatever order this plan produced. Two
        // orders, alternating, is the smallest shape of that.
        const all = [...this.live(query)];
        this.#asked += 1;
        const by = this.#asked % 2;
        return [...all.slice(by), ...all.slice(0, by)];
      }
    }
    const said = (await complaints(new Unstable())).join(" ");

    expect(said).toContain("the same row on two pages");
  });

  it("is caught counting what it was asked for rather than what it did", async () => {
    class Generous extends Memory {
      override async restore(model: string, ids: readonly Id[]): Promise<number> {
        await super.restore(model, ids);
        return ids.length;
      }
    }

    expect((await complaints(new Generous())).join(" ")).toContain(
      "restore() answered 2",
    );
  });

  it("is caught reading deleted rows back to a read that did not ask", async () => {
    class Forgetful extends Memory {
      protected override live(): Held[] {
        return this.held;
      }
    }
    const said = (await complaints(new Forgetful())).join(" ");

    expect(said).toContain("did not ask for one");
  });

  it("is caught destroying on a model that marks", async () => {
    class Blunt extends Memory {
      override delete(model: string, ids: readonly Id[]): Promise<number> {
        return this.forceDelete(model, ids);
      }
    }

    expect((await complaints(new Blunt())).join(" ")).toContain(
      "destroyed a row on a model that marks",
    );
  });

  it("is caught keeping what a transaction wrote before it threw", async () => {
    class Hopeful extends Memory {
      override async transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T> {
        return await fn(this);
      }
    }

    expect((await complaints(new Hopeful())).join(" ")).toContain(
      "kept a write from a transaction",
    );
  });

  it("is caught answering a row for a key that was never there", async () => {
    class Inventive extends Memory {
      override findOne(): Promise<Row | null> {
        return Promise.resolve({ id: 99 } as unknown as Row);
      }
    }

    expect((await complaints(new Inventive())).join(" ")).toContain("never there");
  });
});
