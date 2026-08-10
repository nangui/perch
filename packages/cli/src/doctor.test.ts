/**
 * Every case a user actually hits, as a reading of a project rather than a
 * temporary directory.
 */
import { describe, expect, it } from "vitest";
import type { Project } from "./doctor.js";
import { diagnose } from "./doctor.js";

const SCHEMA = `
generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

generator perch {
  provider = "perch-prisma-generator"
}

datasource db {
  provider = "postgresql"
}

model User {
  id Int @id @default(autoincrement())
}
`;

/**
 * Opaque here on purpose: `diagnose` compares two fingerprints and never
 * computes one, so what the rule is belongs to the test that runs the real
 * generator and the real command over one project.
 */
const FINGERPRINT = "sha256:whatever-the-rule-produces";

/** A project with nothing wrong with it, every field present. */
const healthy: Required<Project> = {
  inProject: true,
  dependencies: { prisma: "^7.9.1", "@prisma/client": "^7.9.1" },
  prismaVersion: "7.9.1",
  schema: SCHEMA,
  schemaFingerprint: FINGERPRINT,
  irPresent: true,
  irSchemaHash: FINGERPRINT,
  sources: ["PanelModule.forRoot({ path: '/admin' })"],
};

const titles = (project: Partial<Project>): string[] =>
  diagnose({ ...healthy, ...project }).map((finding) => finding.title);

// The same project with one thing it could not read. Absent, not empty: that
// is the difference between "no schema" and "a schema with nothing in it".
const { prismaVersion, schema, schemaFingerprint, ...rest } = healthy;
const noVersion: Project = { ...rest, schema, schemaFingerprint };
const noSchema: Project = { ...rest, prismaVersion };

describe("a project with nothing wrong", () => {
  it("reports nothing", () => {
    expect(diagnose(healthy)).toEqual([]);
  });
});

describe("being run somewhere that is not an application", () => {
  it("says that, and nothing else", () => {
    // Every other check reads a path relative to here, so all of them would
    // report their own subject missing.
    const found = diagnose({ ...healthy, inProject: false });

    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe("No package.json here.");
  });
});

describe("Prisma itself", () => {
  it("catches it not being a dependency", () => {
    expect(titles({ dependencies: {} })[0]).toMatch(/not a dependency/);
  });

  it("catches a major Perch has not been checked against", () => {
    // The DMMF is not a stable API of Prisma; ADR 0012 exists because a major
    // changed it under us and nothing noticed for a whole version.
    expect(titles({ prismaVersion: "6.4.0" })[0]).toMatch(
      /Prisma 6\.4\.0 is installed/,
    );
    expect(titles({ prismaVersion: "8.0.0" })[0]).toMatch(
      /Prisma 8\.0\.0 is installed/,
    );
  });

  it("says nothing about a version it cannot read", () => {
    expect(diagnose(noVersion)).toEqual([]);
  });
});

describe("the schema", () => {
  it("catches it being absent altogether", () => {
    expect(diagnose(noSchema).map((f) => f.title)).toContain("No schema.prisma found.");
  });

  it("catches the Perch generator not being declared", () => {
    const schema = SCHEMA.replace(/generator perch \{[^}]*\}/s, "");
    expect(titles({ schema })[0]).toMatch(/declares no Perch generator/);
  });

  it("warns rather than fails when no client generator is declared", () => {
    // Perch reads through the client, but a schema without one is a project
    // mid-setup rather than a broken install.
    const schema = SCHEMA.replace(/generator client \{[^}]*\}/s, "");
    const found = diagnose({ ...healthy, schema });

    expect(found[0]?.level).toBe("warning");
  });
});

describe("the generated IR", () => {
  it("catches it not being there", () => {
    expect(titles({ irPresent: false })[0]).toBe("No generated IR.");
  });

  it("catches it having been generated from a different schema", () => {
    // The one that is silent otherwise: a stale IR describes columns the
    // database may no longer have, and nothing fails until it is read.
    expect(titles({ irSchemaHash: "sha256:something-else" })[0]).toMatch(
      /generated from a different schema/,
    );
  });

  it("says nothing when there is no schema to compare against", () => {
    expect(diagnose(noSchema).map((f) => f.title)).not.toContain(
      "The IR was generated from a different schema.",
    );
  });
});

describe("the wiring", () => {
  it("catches the panel never being registered", () => {
    expect(titles({ sources: ["export class AppModule {}"] })[0]).toMatch(
      /No PanelModule.forRoot/,
    );
  });
});

describe("two resources on one URL", () => {
  it("catches a collision between two explicit slugs", () => {
    expect(
      titles({
        sources: [
          "PanelModule.forRoot({})",
          '@PanelResource({ model: "Post", slug: "content" })',
          '@PanelResource({ model: "Page", slug: "content" })',
        ],
      })[0],
    ).toBe('2 resources answer at "content".');
  });

  it("catches one between a declared slug and a derived one", () => {
    // The derivation is `@perchjs/core`'s, the same one the decorator uses —
    // a second copy here would agree until one of them was edited.
    expect(
      titles({
        sources: [
          "PanelModule.forRoot({})",
          '@PanelResource({ model: "Post" })',
          '@PanelResource({ model: "Article", slug: "posts" })',
        ],
      })[0],
    ).toBe('2 resources answer at "posts".');
  });

  it("says nothing about two resources that do not collide", () => {
    expect(
      titles({
        sources: [
          "PanelModule.forRoot({})",
          '@PanelResource({ model: "Post" })',
          '@PanelResource({ model: "Page" })',
        ],
      }),
    ).toEqual([]);
  });
});

describe("what it refuses to invent", () => {
  it("reads past a nested options object to the slug written after it", () => {
    // Stopping at the first `}` misses that slug, derives `posts` from the
    // model instead, and reports a collision that does not exist.
    expect(
      titles({
        sources: [
          "PanelModule.forRoot({})",
          '@PanelResource({ model: "Post", navigation: { group: "C" }, slug: "articles" })',
          '@PanelResource({ model: "Post" })',
        ],
      }),
    ).toEqual([]);
  });
});

describe("what a finding carries", () => {
  it("says what to do about it, not only what is wrong", () => {
    // A diagnosis without one is just bad news.
    for (const finding of diagnose({
      ...healthy,
      dependencies: {},
      irPresent: false,
    })) {
      expect(finding.fix.length).toBeGreaterThan(10);
    }
  });
});
