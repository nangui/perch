/**
 * What a column says about the value it draws.
 *
 * A column is not a component: it describes a slot and is resolved per row. So
 * what is tested here is what it declares, and the one thing it does — deciding
 * what leaves the server for a value that is an instruction to a browser rather
 * than something to read.
 */
import { describe, expect, it } from "vitest";
import type { Column } from "./column.js";
import { ColorColumn, ImageColumn, TextColumn } from "./column.js";
import { presentRows, serialiseTable, Table } from "./table.js";

const table = (...columns: readonly Column[]) => Table.make().columns(columns);

describe("an image column", () => {
  it("hands on an address a browser may fetch", () => {
    expect(
      ImageColumn.make("avatar").present("https://example.com/a.png", {}, "avatar"),
    ).toBe("https://example.com/a.png");
    expect(ImageColumn.make("avatar").present("/files/a.png", {}, "avatar")).toBe(
      "/files/a.png",
    );
  });

  it("drops one it may not, rather than sending it to be hidden", () => {
    // What the client never receives cannot be put in an attribute by mistake,
    // which is the rule the row projection is built on.
    expect(
      ImageColumn.make("avatar").present("javascript:alert(1)", {}, "avatar"),
    ).toBeUndefined();
    expect(
      ImageColumn.make("avatar").present("data:text/html,<script>", {}, "avatar"),
    ).toBeUndefined();
    expect(
      ImageColumn.make("avatar").present("//example.com/a.png", {}, "avatar"),
    ).toBeUndefined();
  });

  it("reads a cell holding several, one at a time", () => {
    expect(
      ImageColumn.make("faces").present(
        ["https://example.com/a.png", "javascript:alert(1)", "/files/b.png"],
        {},
        "faces",
      ),
    ).toEqual(["https://example.com/a.png", "/files/b.png"]);
  });

  it("has nothing to hand on for something that is not an address", () => {
    expect(ImageColumn.make("avatar").present(null, {}, "avatar")).toBeUndefined();
    expect(ImageColumn.make("avatar").present(12, {}, "avatar")).toBeUndefined();
  });
});

describe("an image column over a disk", () => {
  /** What a host answers with: a key resolves through the disk that keeps it. */
  const context = {
    fileUrl: (disk: string, key: string) =>
      disk === "public" ? `/files/${key}` : undefined,
  };

  it("asks the host what a stored key resolves to", () => {
    // A key is not an address, and where it resolves is the disk's business.
    expect(
      ImageColumn.make("avatar")
        .disk("public")
        .present("avatars/ada.png", context, "avatar"),
    ).toBe("/files/avatars/ada.png");
  });

  it("reads what comes back the way it reads any other address", () => {
    // A bucket signs its own URLs, and a signed URL is exactly the kind of
    // value nobody should put in an attribute unread.
    const dubious = { fileUrl: () => "javascript:alert(1)" };

    expect(
      ImageColumn.make("avatar")
        .disk("public")
        .present("avatars/ada.png", dubious, "avatar"),
    ).toBeUndefined();
  });

  it("has nothing to draw where the host answers nothing", () => {
    expect(
      ImageColumn.make("avatar")
        .disk("private")
        .present("avatars/ada.png", context, "avatar"),
    ).toBeUndefined();
    expect(
      ImageColumn.make("avatar").disk("public").present("", context, "avatar"),
    ).toBeUndefined();
  });

  it("leaves a column of addresses alone, which names no disk", () => {
    expect(ImageColumn.make("avatar").present("/files/a.png", context, "avatar")).toBe(
      "/files/a.png",
    );
  });
});

describe("what the columns tell the browser", () => {
  it("how an image column wants its images drawn", () => {
    const payload = serialiseTable(
      table(ImageColumn.make("avatar").circular().stacked().size(40).limit(3)),
    );

    expect(payload.columns[0]).toMatchObject({
      type: "ImageColumn",
      circular: true,
      stacked: true,
      size: 40,
      limit: 3,
    });
  });

  it("nothing about the ones nobody asked for", () => {
    const payload = serialiseTable(table(ImageColumn.make("avatar")));

    expect(payload.columns[0]?.circular).toBeUndefined();
    expect(payload.columns[0]?.size).toBeUndefined();
  });

  it("that a colour column offers to copy itself", () => {
    const payload = serialiseTable(table(ColorColumn.make("tint").copyable()));

    expect(payload.columns[0]).toMatchObject({ type: "ColorColumn", copyable: true });
  });
});

describe("the rows that leave the server", () => {
  it("go through the columns that draw them", () => {
    const rows = [
      { id: 1, avatar: "javascript:alert(1)", name: "Ada" },
      { id: 2, avatar: "/files/b.png", name: "Grace" },
    ];

    expect(presentRows(rows, table(ImageColumn.make("avatar")))).toEqual([
      { id: 1, avatar: undefined, name: "Ada" },
      { id: 2, avatar: "/files/b.png", name: "Grace" },
    ]);
  });

  it("are left alone by every column that only reads", () => {
    const rows = [{ id: 1, name: "Ada" }];

    expect(presentRows(rows, table(TextColumn.make("name")))).toEqual(rows);
  });

  it("are left alone where there is no table at all", () => {
    const rows = [{ id: 1, name: "Ada" }];

    expect(presentRows(rows, undefined)).toBe(rows);
  });

  it("are reached into through a relation, which a row carries whole", () => {
    // A related object arrives entire, so a value inside one reaches a browser
    // like any other. A rule that stopped at the paths without a dot in them
    // would be a rule with the way around it written on the label.
    const rows = [
      { id: 1, author: { name: "Ada", avatar: "javascript:alert(1)" } },
      { id: 2, author: { name: "Grace", avatar: "/files/b.png" } },
    ];

    expect(presentRows(rows, table(ImageColumn.make("author.avatar")))).toEqual([
      { id: 1, author: { name: "Ada", avatar: undefined } },
      { id: 2, author: { name: "Grace", avatar: "/files/b.png" } },
    ]);
  });

  it("reach into every row of a relation that holds several", () => {
    const rows = [
      {
        id: 1,
        tasks: [{ cover: "javascript:alert(1)" }, { cover: "/files/b.png" }],
      },
    ];

    expect(presentRows(rows, table(ImageColumn.make("tasks.cover")))).toEqual([
      { id: 1, tasks: [{ cover: undefined }, { cover: "/files/b.png" }] },
    ]);
  });

  it("leave the row that was handed over untouched", () => {
    // An adapter that caches its rows would find them edited by the act of
    // being listed.
    const author = { avatar: "javascript:alert(1)" };
    const rows = [{ id: 1, author }];

    presentRows(rows, table(ImageColumn.make("author.avatar")));

    expect(author.avatar).toBe("javascript:alert(1)");
    expect(rows[0]?.author).toBe(author);
  });

  it("leave alone a path this row has nothing at", () => {
    const rows = [{ id: 1 }];

    expect(presentRows(rows, table(ImageColumn.make("author.avatar")))).toEqual(rows);
  });
});
