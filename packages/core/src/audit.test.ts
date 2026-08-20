import { describe, expect, it } from "vitest";
import { auditInfolist, auditSchema, auditTable, describeComplaints } from "./audit.js";
import { TextColumn } from "./column.js";
import { SelectFilter, TextFilter } from "./filter.js";
import { Table } from "./table.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import { Schema, Section } from "./layout.js";
import { TextEntry } from "./entries/text-entry.js";

describe("a form that can work", () => {
  it("draws no complaint", () => {
    const schema = Schema.make([
      TextInput.make("title"),
      Select.make("status").options({ draft: "Draft" }),
      Select.make("authorId").relationship("author", "name").searchable(),
    ]);

    expect(auditSchema(schema)).toEqual([]);
  });
});

describe("a searchable select with nothing to search", () => {
  it("is named, whichever order it was written in", () => {
    const before = Schema.make([
      Select.make("status").options({ a: "A" }).searchable(),
    ]);
    const after = Schema.make([Select.make("status").searchable().options({ a: "A" })]);

    // The point of reading the finished tree: a method that throws sees only
    // the half of the chain written before it.
    expect(auditSchema(before)).toEqual(auditSchema(after));
    expect(auditSchema(before)[0]?.field).toBe("status");
    expect(auditSchema(before)[0]?.problem).toContain("names no relationship");
  });
});

describe("a select that declared nothing", () => {
  it("is named, because it can hold nothing", () => {
    const schema = Schema.make([Select.make("status")]);

    expect(auditSchema(schema)).toEqual([
      {
        field: "status",
        problem:
          "has neither options nor a relationship, so it can hold nothing at all",
      },
    ]);
  });
});

describe("where it looks", () => {
  it("reaches a field nested in a layout", () => {
    const schema = Schema.make([
      Section.make("Details").schema([Select.make("buried")]),
    ]);

    expect(auditSchema(schema).map((c) => c.field)).toEqual(["buried"]);
  });

  it("collects every complaint rather than stopping at the first", () => {
    const schema = Schema.make([
      Select.make("one"),
      Select.make("two").options({ a: "A" }).searchable(),
    ]);

    expect(auditSchema(schema)).toHaveLength(2);
  });
});

describe("the message", () => {
  it("names the subject and every line under it", () => {
    const message = describeComplaints('Resource "posts"', [
      { field: "status", problem: "cannot work" },
      { field: "tags", problem: "cannot work either" },
    ]);

    expect(message).toBe(
      'Resource "posts" declares a form that cannot work:\n' +
        "  - `status` cannot work\n" +
        "  - `tags` cannot work either",
    );
  });
});

describe("the table half of a resource", () => {
  it("names a choice with nothing to choose from", () => {
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([SelectFilter.make("status")]);

    expect(auditTable(table)).toEqual([
      {
        field: "status",
        problem:
          "is a choice with nothing to choose from, so it can never filter anything",
      },
    ]);
  });

  it("leaves one that declared its choices alone", () => {
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([SelectFilter.make("status").options({ draft: "Draft" })]);

    expect(auditTable(table)).toEqual([]);
  });

  it("says nothing about a free-text filter, which needs no list", () => {
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([TextFilter.make("title")]);

    expect(auditTable(table)).toEqual([]);
  });

  it("brings the duplicate-name refusal forward to the boot", () => {
    // It already refused — on the first list request, under a reader.
    const table = Table.make()
      .columns([TextColumn.make("title")])
      .filters([
        TextFilter.make("title"),
        SelectFilter.make("title").options({ a: "A" }),
      ]);

    expect(() => auditTable(table)).toThrow();
  });
});

describe("a length nothing can be shortened to", () => {
  const audited = (limit: number) =>
    auditInfolist(Schema.make([TextEntry.make("bio").limit(limit)]));

  it("stops the boot, because the renderer shows the whole value instead", () => {
    // Zero reads as "show none of it" and does the opposite: a string cut to
    // nothing leaves an ellipsis meaning nothing, so the renderer keeps the
    // value whole. A declaration that quietly reverses itself is worse than
    // one that refuses.
    expect(audited(0)[0]?.problem).toMatch(/not a length a value can be shortened to/);
    expect(audited(-5)).toHaveLength(1);
  });

  it("names the entry it is about", () => {
    expect(audited(0)[0]?.field).toBe("bio");
  });

  it("refuses a length between two characters, which is no length at all", () => {
    expect(audited(2.5)).toHaveLength(1);
  });

  it("leaves a limit that can be honoured alone", () => {
    expect(audited(80)).toEqual([]);
    expect(auditInfolist(Schema.make([TextEntry.make("bio")]))).toEqual([]);
  });
});

describe("an empty state that says nothing", () => {
  const table = (empty?: Parameters<Table["emptyState"]>[0]) => {
    const made = Table.make().columns([TextColumn.make("title")]);
    return auditTable(empty === undefined ? made : made.emptyState(empty));
  };

  it("stops the boot, because declaring one takes the plain words away", () => {
    // A table with none says "Nothing to show", which is short and true. One
    // with an empty one says nothing at all, in a box where a table was.
    expect(table({})[0]?.problem).toMatch(/says nothing at all/);
  });

  it("leaves one that says something alone, whichever of the three it is", () => {
    expect(table({ heading: "No posts yet" })).toEqual([]);
    expect(table({ description: "Write the first one." })).toEqual([]);
    expect(table({ icon: "\u270E" })).toEqual([]);
  });

  it("has nothing to say about a table that declared none", () => {
    expect(table()).toEqual([]);
  });
});
