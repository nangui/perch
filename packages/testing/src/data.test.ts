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
  AggregateQuery,
  AggregateResult,
  GroupCount,
  GroupKey,
  GroupQuery,
  AggregateValue,
  Aggregation,
  Clause,
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
import { auditGroupKey } from "@perchjs/core";
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
  // Named rather than left empty: the contract reads these to decide what it
  // can ask, and a model claiming no columns is a model it can ask nothing of.
  fields: [
    { name: "id", kind: "scalar", type: "Int", isRequired: true, isId: true },
    { name: "name", kind: "scalar", type: "String", isRequired: true },
    { name: "team", kind: "scalar", type: "String", isRequired: true },
    { name: "deletedAt", kind: "scalar", type: "DateTime", isRequired: false },
  ],
  relations: [],
  uniqueConstraints: [],
  hasSoftDelete: true,
  labelField: "name",
} as unknown as ModelMeta;

/** One aggregation over rows already narrowed, which is all a double owes. */
function reduce(rows: readonly Row[], aggregation: Aggregation): AggregateValue {
  const { fn, path } = aggregation;
  if (path === undefined) return rows.length;

  const present = rows
    .map((row) => row[path])
    .filter((value) => value !== null && value !== undefined);

  if (fn === "count") return present.length;
  if (present.length === 0) return null;
  if (fn === "sum" || fn === "avg") {
    const sum = present.reduce((into: number, one) => into + Number(one), 0);
    return fn === "sum" ? sum : sum / present.length;
  }
  const numbers = present.map(Number);
  return fn === "min" ? Math.min(...numbers) : Math.max(...numbers);
}

/** An adapter that keeps the contract, and the base the broken ones bend. */
class Memory implements DataAdapter {
  protected held: Held[] = [];
  /** The other end of the relation, and the join table that belongs to neither. */
  protected readonly targets: Row[] = [{ id: 101 }, { id: 102 }];
  protected links = new Set<string>();
  #next = 1;

  protected link(id: Id, target: Id): string {
    return `${String(id)}:${String(target)}`;
  }

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

  /** What a clause means, for the operators a string can answer. */
  protected matches(row: Held, clause: Clause): boolean {
    const held = text((row as unknown as Row)[clause.path]);
    const against = clause.value;
    switch (clause.operator) {
      case "equals":
        return held === against;
      case "not":
        return held !== against;
      case "in":
        return Array.isArray(against) && against.some((one) => one === held);
      case "notIn":
        return Array.isArray(against) && !against.some((one) => one === held);
      case "contains":
        return held.includes(text(against));
      case "startsWith":
        return held.startsWith(text(against));
      case "endsWith":
        return held.endsWith(text(against));
      default:
        return true;
    }
  }

  /** The paths are the caller's, so nothing else is looked at. */
  protected searched(row: Held, search: NonNullable<Query["search"]>): boolean {
    return search.paths.some((path) =>
      text((row as unknown as Row)[path]).includes(search.term),
    );
  }

  protected narrowed(query: Query): Held[] {
    let rows = this.ordered(query);
    for (const clause of query.clauses ?? [])
      rows = rows.filter((row) => this.matches(row, clause));
    const search = query.search;
    if (search !== undefined) rows = rows.filter((row) => this.searched(row, search));
    return rows;
  }

  findMany(query: Query): Promise<Page> {
    if (query.model === "Project") {
      const narrowing = query.joinedTo;
      const rows =
        narrowing === undefined
          ? this.targets
          : this.targets.filter((row) => {
              const joined = this.links.has(
                this.link(narrowing.value, row["id"] as Id),
              );
              return narrowing.holding === "apart" ? !joined : joined;
            });
      return Promise.resolve({ rows, total: rows.length });
    }
    const all = this.narrowed(query);
    const from = query.skip ?? 0;
    const rows = all.slice(from, from + (query.take ?? all.length));
    return Promise.resolve({ rows: rows as unknown as Row[], total: all.length });
  }

  findOne(_model: string, id: Id, options?: ReadOptions): Promise<Row | null> {
    const which = options?.deleted;
    const found = this.live(which === undefined ? {} : { deleted: which }).find(
      (row) => String(row.id) === String(id),
    );
    if (found === undefined) return Promise.resolve(null);
    if (options?.include?.["projects"] === undefined) {
      return Promise.resolve(found as unknown as Row);
    }
    const joined = this.targets.filter((row) =>
      this.links.has(this.link(id, row["id"] as Id)),
    );
    return Promise.resolve({ ...(found as unknown as Row), projects: joined });
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

  attach(
    _model: string,
    id: Id,
    _relation: string,
    targets: readonly Id[],
  ): Promise<void> {
    for (const target of targets) this.links.add(this.link(id, target));
    return Promise.resolve();
  }

  detach(
    _model: string,
    id: Id,
    _relation: string,
    targets: readonly Id[],
  ): Promise<void> {
    for (const target of targets) this.links.delete(this.link(id, target));
    return Promise.resolve();
  }

  /** Narrowed by what `findMany` narrows by, which is the promise being kept. */
  aggregate(query: AggregateQuery): Promise<AggregateResult> {
    const rows = this.narrowed(query) as unknown as Row[];
    const answer: Record<string, AggregateValue> = {};
    for (const [named, one] of Object.entries(query.aggregations)) {
      answer[named] = reduce(rows, one);
    }
    return Promise.resolve(answer);
  }

  /** Narrowed by what `findMany` narrows by, which is the promise being kept. */
  groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
    const complaints = auditGroupKey(META, query.by);
    if (complaints.length > 0) {
      return Promise.reject(new Error(complaints[0]?.problem ?? "refused"));
    }

    const totals = new Map<string, GroupCount>();
    for (const row of this.narrowed(query) as unknown as Row[]) {
      const held = row[query.by];
      const key = (held === undefined ? null : held) as GroupKey;
      // Filed by type as well as by value, so a row holding the word "null"
      // and a row holding nothing are two groups.
      const under = `${typeof key}:${String(key)}`;
      totals.set(under, { key, total: (totals.get(under)?.total ?? 0) + 1 });
    }
    return Promise.resolve([...totals.values()]);
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
  filterOn: { path: "name", value: "Ada", absent: "Nobody" },
  searchOn: { term: "Ada", reaching: "name", notReaching: "team" },
  relation: { name: "projects", target: "Project", back: "people", id: 101 },
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

  it("is caught treating an exclusion as no clause at all", async () => {
    // The fault the first draft of this contract could not see: it asked only
    // that the row survive an exclusion of something else, which an adapter
    // ignoring the operator answers by handing back the table.
    class Ignores extends Memory {
      protected override matches(row: Held, clause: Clause): boolean {
        if (clause.operator === "not" || clause.operator === "notIn") return true;
        return super.matches(row, clause);
      }
    }
    const said = (await complaints(new Ignores())).join(" ");

    expect(said).toContain("not kept the row it was told to exclude");
    expect(said).toContain("notIn kept the row it was told to exclude");
  });

  it("is caught searching beyond the paths it was handed", async () => {
    // The authorization one: which columns a search reaches is the panel's
    // decision, and an adapter that reads them all answers questions about
    // columns nobody was shown, one letter at a time.
    class Everywhere extends Memory {
      protected override searched(
        row: Held,
        search: NonNullable<Query["search"]>,
      ): boolean {
        return [row.name, row.team].some((held) => held.includes(search.term));
      }
    }

    expect((await complaints(new Everywhere())).join(" ")).toContain(
      "beyond the paths",
    );
  });

  it("is caught counting the table where the query narrowed it", async () => {
    // A page that says "1 of 40" under a filter that matched one row is a
    // pager offering pages that are not there.
    class Miscounting extends Memory {
      override async findMany(query: Query): Promise<Page> {
        const page = await super.findMany(query);
        return { rows: page.rows, total: this.held.length };
      }
    }

    expect((await complaints(new Miscounting())).join(" ")).toContain(
      "which is the table's rather than the query's",
    );
  });

  it("is caught joining the same row twice", async () => {
    // A join table that takes a row rather than a pair: pressing the button
    // again is what a reader does, and the manager then lists it twice.
    class Doubling extends Memory {
      override async findMany(query: Query): Promise<Page> {
        const page = await super.findMany(query);
        if (query.model !== "Project" || query.joinedTo?.holding === "apart")
          return page;
        return { rows: [...page.rows, ...page.rows], total: page.total };
      }
    }

    expect((await complaints(new Doubling())).join(" ")).toContain(
      "joined the same row 2 times",
    );
  });

  it("is caught raising on a detach of what is not joined", async () => {
    class Brittle extends Memory {
      override detach(
        model: string,
        id: Id,
        relation: string,
        targets: readonly Id[],
      ): Promise<void> {
        for (const target of targets) {
          if (!this.links.has(this.link(id, target))) throw new Error("nothing joined");
        }
        return super.detach(model, id, relation, targets);
      }
    }

    expect((await complaints(new Brittle())).join(" ")).toContain(
      "detach() twice raised",
    );
  });

  it("is caught reading the two sides of a narrowing as one", async () => {
    class OneSided extends Memory {
      override async findMany(query: Query): Promise<Page> {
        const narrowing = query.joinedTo;
        if (narrowing === undefined || narrowing.holding !== "apart") {
          return await super.findMany(query);
        }
        // `apart` answered as `joined`: what could be added to a manager read
        // as what it already holds.
        return await super.findMany({
          ...query,
          joinedTo: { ...narrowing, holding: "joined" },
        });
      }
    }

    expect((await complaints(new OneSided())).join(" ")).toContain(
      "among the ones apart",
    );
  });

  it("is caught accepting an include and ignoring it", async () => {
    // The shape that makes a relation column draw nothing: the branch is asked
    // for, taken, and never loaded.
    class Deaf extends Memory {
      override findOne(
        model: string,
        id: Id,
        options?: ReadOptions,
      ): Promise<Row | null> {
        const withoutInclude = options === undefined ? undefined : { ...options };
        if (withoutInclude !== undefined) delete withoutInclude.include;
        return super.findOne(model, id, withoutInclude);
      }
    }

    expect((await complaints(new Deaf())).join(" ")).toContain(
      "did not bring projects back",
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

  it("is caught aggregating the table where the query narrowed it", async () => {
    // The fault a footer shows: a total for rows the table above it did not
    // list. Dropping the narrowing is the smallest shape of it.
    class Unnarrowed extends Memory {
      override aggregate(query: AggregateQuery): Promise<AggregateResult> {
        return super.aggregate({ model: query.model, aggregations: query.aggregations });
      }
    }

    expect((await complaints(new Unnarrowed())).join(" ")).toContain(
      "rows where none matched",
    );
  });

  it("is caught answering zero where there was nothing to work over", async () => {
    class Zeroing extends Memory {
      override async aggregate(query: AggregateQuery): Promise<AggregateResult> {
        const answer = await super.aggregate(query);
        return Object.fromEntries(
          Object.entries(answer).map(([named, value]) => [
            named,
            value === null ? 0 : value,
          ]),
        );
      }
    }

    expect((await complaints(new Zeroing())).join(" ")).toContain(
      "null is what no rows works out to",
    );
  });

  it("is caught counting a marked row the page above it hides", async () => {
    class Tombstones extends Memory {
      override aggregate(query: AggregateQuery): Promise<AggregateResult> {
        return super.aggregate({ ...query, deleted: "with" });
      }
    }

    expect((await complaints(new Tombstones())).join(" ")).toContain(
      "with one of them marked",
    );
  });

  it("is caught getting the arithmetic wrong over rows it narrowed right", async () => {
    class OffByOne extends Memory {
      override async aggregate(query: AggregateQuery): Promise<AggregateResult> {
        const answer = await super.aggregate(query);
        const total = answer["total"];
        return typeof total === "number" ? { ...answer, total: total + 1 } : answer;
      }
    }

    expect((await complaints(new OffByOne())).join(" ")).toContain("as the total of id");
  });

  it("is caught sizing a group by the rows a caller already holds", async () => {
    // The fault every other check here lets through. A header saying two above
    // a group of nine is a reader told the group is two.
    class Partial extends Memory {
      override async groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
        return (await super.groupBy(query)).map((one) => ({ ...one, total: 1 }));
      }
    }

    expect((await complaints(new Partial())).join(" ")).toContain(
      "across its groups where the model holds",
    );
  });

  it("is caught making a group per row out of rows that are one group", async () => {
    class Scattered extends Memory {
      override groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
        // Gathered by the key rather than by the column asked for, which is
        // every row in a group of its own.
        return super.groupBy({ ...query, by: "id" });
      }
    }

    expect((await complaints(new Scattered())).join(" ")).toContain(
      "groups of rows that all hold the same team",
    );
  });

  it("is caught gathering the table where the query narrowed it", async () => {
    class Unnarrowed extends Memory {
      override groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
        return super.groupBy({ model: query.model, by: query.by });
      }
    }

    expect((await complaints(new Unnarrowed())).join(" ")).toContain(
      "groups where no row matched",
    );
  });

  it("is caught gathering a marked row the page above it hides", async () => {
    class Tombstones extends Memory {
      override groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
        return super.groupBy({ ...query, deleted: "with" });
      }
    }

    expect((await complaints(new Tombstones())).join(" ")).toContain(
      "with one of them marked",
    );
  });
});
