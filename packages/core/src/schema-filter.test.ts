/**
 * A filter that carries its own form.
 *
 * The other filters are a column and a comparison with a control drawn over
 * them. This one is the other way round: the fields are declared and what they
 * mean is a function, so it can ask what a column cannot — two columns at once,
 * a comparison that follows a choice, a window nobody has a name for.
 *
 * What is tested here is the declaration and the meaning. Running the form is
 * the panel's half, and lives beside the query it builds.
 */
import { describe, expect, it } from "vitest";
import { auditTable } from "./audit.js";
import { TextColumn } from "./column.js";
import { SchemaFilter } from "./filter.js";
import { Select } from "./fields/select.js";
import { KeyValue } from "./fields/key-value.js";
import { Textarea } from "./fields/textarea.js";
import { TextInput } from "./fields/text-input.js";
import { Table } from "./table.js";

const named = () =>
  SchemaFilter.make("named")
    .schema([TextInput.make("starts"), TextInput.make("ends")])
    .query(({ get }) => {
      const starts = get("starts");
      return typeof starts === "string" && starts !== ""
        ? [{ path: "name", operator: "startsWith", value: starts }]
        : [];
    });

describe("what it declares", () => {
  it("is the fields it asks with", () => {
    expect(named().state.schema.map((one) => one.type)).toEqual([
      "TextInput",
      "TextInput",
    ]);
  });

  it("keeps them through a label, every method cloning", () => {
    const made = named().label("Named");

    expect(made.state.label).toBe("Named");
    expect(made.state.schema).toHaveLength(2);
    expect(made.narrow({ get: () => "Ada" })).toHaveLength(1);
  });

  it("leaves the one it was made from alone", () => {
    // A builder shared between requests leaks one reader's filter into
    // another's, which is a security hole and not a matter of style.
    const first = SchemaFilter.make("named").schema([TextInput.make("starts")]);
    const second = first.schema([TextInput.make("ends"), TextInput.make("starts")]);

    expect(first.state.schema).toHaveLength(1);
    expect(second.state.schema).toHaveLength(2);
  });
});

describe("what it means", () => {
  it("is whatever its query says, from the values it was given", () => {
    expect(named().narrow({ get: () => "Ada" })).toEqual([
      { path: "name", operator: "startsWith", value: "Ada" },
    ]);
  });

  it("is nothing where its query asks for nothing", () => {
    expect(named().narrow({ get: () => "" })).toEqual([]);
  });

  it("is nothing at all where nobody said what it means", () => {
    expect(
      SchemaFilter.make("named")
        .schema([TextInput.make("starts")])
        .narrow({
          get: () => "Ada",
        }),
    ).toEqual([]);
  });

  it("names its own paths and its own comparisons", () => {
    // The whole security story, unchanged: the query is code, so a value out of
    // a URL can be a value and never a column or an operator.
    const reaching = SchemaFilter.make("recent")
      .schema([TextInput.make("days")])
      .query(({ get }) => [{ path: "createdAt", operator: "gte", value: get("days") }]);

    expect(reaching.narrow({ get: () => "passwordHash" })).toEqual([
      { path: "createdAt", operator: "gte", value: "passwordHash" },
    ]);
  });
});

describe("what a single parameter does to it", () => {
  it("is nothing, its values not arriving as one", () => {
    // `filter.named=anything` is not a second way in. Its fields each carry
    // their own parameter, and a filter that also answered a bare one would
    // have a door beside the one that was built.
    // Called with something, or the probe that removes this passes: a query
    // handed `undefined` returns nothing whether or not it was consulted.
    expect(named().clauses("Ada")).toEqual([]);
  });
});

describe("half a declaration", () => {
  const complaintsFor = (filter: SchemaFilter) =>
    auditTable(
      Table.make()
        .columns([TextColumn.make("name")])
        .filters([filter]),
    ).map((one) => one.problem);

  it("stops the boot where the fields mean nothing", () => {
    expect(
      complaintsFor(SchemaFilter.make("named").schema([TextInput.make("starts")])),
    ).toEqual([expect.stringContaining("narrows nothing")]);
  });

  it("stops the boot where the meaning has nothing to read", () => {
    expect(complaintsFor(SchemaFilter.make("named").query(() => []))).toEqual([
      expect.stringContaining("no fields"),
    ]);
  });

  it("says nothing about one that is whole", () => {
    expect(complaintsFor(named())).toEqual([]);
  });

  it("stops the boot where a field holds what a link cannot carry", () => {
    // A filter's values travel in a query string. A document, a list of pairs
    // and a set of ticks are not things that can be written in one, so a
    // control drawn over them takes a reader's input and narrows nothing.
    expect(
      complaintsFor(
        SchemaFilter.make("about")
          .schema([KeyValue.make("links")])
          .query(() => []),
      ),
    ).toEqual([expect.stringContaining("could never be written")]);
  });

  it("says nothing about the fields that can", () => {
    expect(
      complaintsFor(
        SchemaFilter.make("about")
          .schema([
            TextInput.make("starts"),
            Textarea.make("mentions"),
            Select.make("role").options([
              { value: "lead", label: "Lead" },
              { value: "member", label: "Member" },
            ]),
          ])
          .query(() => []),
      ),
    ).toEqual([]);
  });

  it("asks a closed set about its own choice written out", () => {
    // A `Select` over numbers gets `"1"` back from a link and not the number,
    // and it takes it: the field compares choices by their written form. So it
    // is answerable from a link, and the oracle has to say so rather than
    // refuse every set that is not made of strings.
    const numbered = Select.make("team").options([
      { value: 1, label: "One" },
      { value: 2, label: "Two" },
    ]);

    expect(
      complaintsFor(
        SchemaFilter.make("about")
          .schema([numbered])
          .query(() => []),
      ),
    ).toEqual([]);
  });

  it("audits the fields inside it like any others", () => {
    // They are fields. A form that would be refused on a page is refused in a
    // filter, and for the same reason.
    const complaints = complaintsFor(
      SchemaFilter.make("named")
        .schema([Select.make("country")])
        .query(() => []),
    );

    expect(complaints.length).toBeGreaterThan(0);
  });
});
