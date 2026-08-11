/**
 * Adding a name to a list in somebody's module. Two commands do it, and the
 * hard half is the same both times: knowing when to refuse.
 *
 * `panel.test.ts` covers what `register` makes of a root module; these are the
 * rules underneath it, and the cases a resource registration meets that a panel
 * registration does not.
 */
import { describe, expect, it } from "vitest";
import { addToList, importFrom } from "./module-edit.js";

const RESOURCE = {
  className: "UserResource",
  from: "./resources/user.resource.js",
  key: "resources",
};

const PANEL = `import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { PanelData } from "./panel-data.js";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [],
      dataAdapter: PanelData,
    }),
  ],
})
export class AdminModule {}
`;

describe("adding an entry", () => {
  it("puts it in the list and imports it", () => {
    const after = addToList(PANEL, RESOURCE);

    expect(after).toContain(
      'import { UserResource } from "./resources/user.resource.js";',
    );
    expect(after).toContain("resources: [UserResource]");
  });

  it("keeps the ones already there, and the file around them", () => {
    const after = addToList(
      PANEL.replace("resources: []", "resources: [PostResource]"),
      {
        ...RESOURCE,
      },
    );

    expect(after).toContain("resources: [UserResource, PostResource]");
    expect(after).toContain("dataAdapter: PanelData");
    expect(after).toContain("export class AdminModule {}");
  });

  it("changes nothing when the name is already there", () => {
    const already = addToList(PANEL, RESOURCE) ?? "";

    expect(addToList(already, RESOURCE)).toBe(already);
  });

  it("does not mistake a longer name for the one it is adding", () => {
    // `Post` inside `PostResource` is not `Post`. Without the word boundary the
    // second resource of a project is silently never registered.
    const listed = PANEL.replace("resources: []", "resources: [PostResource]");

    expect(
      addToList(listed, { className: "Post", from: "./post.js", key: "resources" }),
    ).toContain("resources: [Post, PostResource]");
  });

  it("imports before the first import, never inside one", () => {
    // Prettier writes imports across three lines. Inserting after the first of
    // them lands between the braces and produces a file that does not parse.
    const wrapped = `import {\n  Module,\n} from "@nestjs/common";\n\n@Module({ resources: [] })\nexport class A {}\n`;

    expect(addToList(wrapped, RESOURCE)).toContain(
      'import { UserResource } from "./resources/user.resource.js";\nimport {\n  Module,\n}',
    );
  });
});

describe("what it refuses", () => {
  it("a key that appears twice, since it cannot know which was meant", () => {
    const two = `@Module({ resources: [] })\nexport class A {}\n@Module({ resources: [] })\nexport class B {}`;

    expect(addToList(two, RESOURCE)).toBeUndefined();
  });

  it("a key that is not an array literal", () => {
    // Adding one would leave the object with the key twice, which is a syntax
    // error in the file we were asked not to break.
    const computed = `@Module({ resources: collect() })\nexport class A {}`;

    expect(addToList(computed, RESOURCE)).toBeUndefined();
  });

  it("an absent key, unless creating one is what belongs there", () => {
    const none = `@Module({ providers: [] })\nexport class A {}`;

    expect(addToList(none, RESOURCE)).toBeUndefined();
    expect(addToList(none, { ...RESOURCE, create: true })).toContain(
      "resources: [UserResource],",
    );
  });
});

describe("how it leaves the file", () => {
  it("adds no comma before a closing bracket", () => {
    expect(addToList(`@Module({ resources: [] })`, RESOURCE)).toContain(
      "resources: [UserResource]",
    );
  });

  it("leaves no trailing space before a newline", () => {
    const after = addToList(`@Module({\n  resources: [\n    Post,\n  ],\n})`, RESOURCE);

    expect(after).toContain("resources: [UserResource,\n    Post,");
    expect(after).not.toMatch(/[ \t]+\n/);
  });
});

describe("the specifier a generated file imports by", () => {
  it("is relative to the file doing the importing", () => {
    expect(
      importFrom("src/admin/admin.module.ts", "src/admin/resources/user.resource.ts"),
    ).toBe("./resources/user.resource.js");
    expect(importFrom("src/admin/panel-data.ts", "perch/ir.json")).toBe(
      "../../perch/ir.js",
    );
  });

  it("stays a specifier, never a bare path", () => {
    // `user.resource.js` would be resolved as a package.
    expect(importFrom("src/a.ts", "src/b.ts")).toBe("./b.js");
  });
});
