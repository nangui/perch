/**
 * @vitest-environment jsdom
 *
 * The cell that draws a face, a name and the line under it as one thing.
 *
 * Asked through the table, because a cell renderer is a plain function the
 * table calls. What it reads besides its own value comes out of the row, from
 * the paths the column node carries — so these rows are whole rows rather than
 * a single value, which is what the renderer actually receives.
 */
import type { ColumnNode, ColumnTree, Row } from "@perchjs/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resetColumnRegistry } from "./column-registry.js";
import { registerBuiltInColumns } from "./columns.js";
import { DataTable } from "./DataTable.js";

registerBuiltInColumns();

afterEach(() => {
  cleanup();
  resetColumnRegistry();
  registerBuiltInColumns();
});

function draw(column: ColumnNode, ...rows: readonly Row[]): HTMLElement {
  const columns: ColumnTree = {
    actions: [],
    filters: [],
    headerActions: [],
    bulkActions: [],
    columns: [column],
  };
  return render(<DataTable columns={columns} rows={rows} caption="People" />).container;
}

const PERSON: ColumnNode = {
  type: "AvatarColumn",
  path: "firstName",
  image: "avatar",
  description: "email",
  circular: true,
};

describe("a cell drawing a person", () => {
  it("draws the face, the name and the line under it", () => {
    const container = draw(PERSON, {
      id: 1,
      firstName: "Ada",
      avatar: "/files/ada.png",
      email: "ada@example.com",
    });

    const face = container.querySelector("img.perch-cell__face");
    expect(face?.getAttribute("src")).toBe("/files/ada.png");
    // Empty, not the name: the name is right beside it, and read out twice it
    // is a stutter.
    expect(face?.getAttribute("alt")).toBe("");
    expect(container.querySelector(".perch-cell__name")?.textContent).toBe("Ada");
    expect(container.querySelector(".perch-cell__under")?.textContent).toBe(
      "ada@example.com",
    );
  });

  it("stands initials in where a row has no face", () => {
    // So the column keeps one width down its whole length rather than going
    // ragged wherever a picture is missing.
    const container = draw(PERSON, { id: 1, firstName: "Ada Lovelace", avatar: null });
    const stand = container.querySelector(".perch-cell__face--empty");

    expect(stand?.textContent).toBe("AL");
    expect(stand?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img.perch-cell__face")).toBeNull();
  });

  it("keeps a first character that is more than one code unit", () => {
    // `name[0]` on a name outside the basic plane is half a character, which
    // draws as a replacement box.
    const container = draw(PERSON, { id: 1, firstName: "𝒜da" });

    expect(container.querySelector(".perch-cell__face--empty")?.textContent).toBe("𝒜");
  });

  it("reads through a relation as readily as beside one", () => {
    const container = draw(
      { ...PERSON, image: "team.logo", description: "team.name" },
      { id: 1, firstName: "Ada", team: { logo: "/files/t.png", name: "Engineering" } },
    );

    expect(container.querySelector("img.perch-cell__face")?.getAttribute("src")).toBe(
      "/files/t.png",
    );
    expect(container.querySelector(".perch-cell__under")?.textContent).toBe(
      "Engineering",
    );
  });

  it("draws no second line where a column declared none", () => {
    const container = draw(
      { type: "AvatarColumn", path: "firstName" },
      { id: 1, firstName: "Ada", email: "ada@example.com" },
    );

    expect(container.querySelector(".perch-cell__under")).toBeNull();
    expect(container.querySelector(".perch-cell__name")?.textContent).toBe("Ada");
  });
});
