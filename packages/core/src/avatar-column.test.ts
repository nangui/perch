/**
 * A column that reads three paths where every other one reads a single path.
 *
 * The list of them is not decoration: it is what the loading plan is built from
 * and what the row projection keeps, so a path missing from it is a value that
 * silently never reaches the browser. Held here from both ends.
 */
import { describe, expect, it } from "vitest";
import type { Column } from "./column.js";
import { AvatarColumn, TextColumn } from "./column.js";
import { columnPaths, presentRows, serialiseTable, Table } from "./table.js";

function table(...columns: readonly Column[]): Table {
  return Table.make().columns([...columns]);
}

const PERSON = AvatarColumn.make("firstName").image("avatar").description("email");

const ROWS = [
  { id: 1, firstName: "Ada", avatar: "/files/ada.png", email: "ada@example.com" },
];

describe("a column drawing a face beside a name", () => {
  it("names every path it reads, so the query fetches them", () => {
    expect(PERSON.paths).toEqual(["firstName", "avatar", "email"]);
    expect(columnPaths(table(PERSON, TextColumn.make("city")))).toEqual([
      "firstName",
      "avatar",
      "email",
      "city",
    ]);
  });

  it("names only what was declared", () => {
    expect(AvatarColumn.make("firstName").paths).toEqual(["firstName"]);
    expect(AvatarColumn.make("firstName").description("email").paths).toEqual([
      "firstName",
      "email",
    ]);
  });

  it("judges the face as an address and leaves the words alone", () => {
    const shown = presentRows(
      [{ ...ROWS[0], avatar: "javascript:alert(1)" }],
      table(PERSON),
    );

    // Dropped rather than sent and hidden: what the client never receives
    // cannot be put in an attribute by mistake.
    expect(shown[0]).toEqual({
      id: 1,
      firstName: "Ada",
      avatar: undefined,
      email: "ada@example.com",
    });
  });

  it("asks the host what a stored key resolves to, at the face's path only", () => {
    const shown = presentRows(
      [{ id: 1, firstName: "avatars/ada.png", avatar: "avatars/ada.png" }],
      table(AvatarColumn.make("firstName").image("avatar").disk("public")),
      { fileUrl: (disk, key) => `/${disk}/${key}` },
    );

    // The same string at two paths, and only the one declared as the face went
    // through the disk — a column that judged by value rather than by path
    // would have rewritten the name too.
    expect(shown[0]).toEqual({
      id: 1,
      firstName: "avatars/ada.png",
      avatar: "/public/avatars/ada.png",
    });
  });

  it("tells the client where the other two values are", () => {
    const payload = serialiseTable(table(PERSON.label("Person").sortable()));

    expect(payload.columns[0]).toEqual({
      type: "AvatarColumn",
      path: "firstName",
      label: "Person",
      sortable: true,
      circular: true,
      image: "avatar",
      description: "email",
    });
  });

  it("is round unless a column says otherwise", () => {
    expect(serialiseTable(table(PERSON.square())).columns[0]).not.toHaveProperty(
      "circular",
    );
  });
});
