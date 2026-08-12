import { describe, expect, it } from "vitest";
import { auditSchema, auditTable, describeComplaints } from "./audit.js";
import { TextColumn } from "./column.js";
import { SelectFilter, TextFilter } from "./filter.js";
import { Table } from "./table.js";
import { Select } from "./fields/select.js";
import { TextInput } from "./fields/text-input.js";
import { Schema, Section } from "./layout.js";

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
