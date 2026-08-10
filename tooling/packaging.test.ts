/**
 * Proves that the host frameworks stay peer dependencies.
 *
 * This is the single most common packaging bug in a NestJS library, and it is
 * invisible until it is expensive. Nest resolves its dependency injection with
 * class references as tokens. If `@perchjs/nest` lists `@nestjs/core` under
 * `dependencies`, a consumer can end up with two copies installed, the tokens of
 * one do not match the tokens of the other, and the app fails with "Nest can't
 * resolve dependencies" naming a provider that is plainly registered.
 *
 * The same holds for `@prisma/client`: the user generates their own client
 * against their own schema, and a second copy is a different client.
 *
 * Nothing in `dependency-cruiser` catches this — it reads imports, not
 * manifests — and nothing in publint or attw catches it either, because a
 * dependency is a perfectly valid manifest. So it is checked here, before the
 * code that would suffer from it exists.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every workspace package, read from disk rather than listed. A sixth package
 * was added and both hardcoded lists silently stopped covering the workspace;
 * deriving it is what makes that impossible rather than merely unlikely.
 */
const PACKAGES = readdirSync(new URL("../packages", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) =>
    existsSync(new URL(`../packages/${name}/package.json`, import.meta.url)),
  )
  .sort();

/** Libraries the host application owns. Never bundled, never depended upon. */
const HOST_OWNED = [
  /^@nestjs\//,
  /^@prisma\/client$/,
  /^prisma$/,
  /^react(-dom)?$/,
] as const;

interface Manifest {
  readonly name: string;
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

/**
 * The major versions a caret range admits. Deliberately naive — it understands
 * `^11.0.0` and `^10.0.0 || ^11.0.0`, which is the whole vocabulary used here,
 * and returns nothing for anything else rather than guessing.
 */
function majors(range: string): number[] {
  return [...range.matchAll(/\^(\d+)\./g)].map((m) => Number(m[1]));
}

function manifest(pkg: string): Manifest {
  return JSON.parse(
    readFileSync(new URL(`../packages/${pkg}/package.json`, import.meta.url), "utf8"),
  ) as Manifest;
}

function hostOwned(names: readonly string[]): string[] {
  return names.filter((n) => HOST_OWNED.some((p) => p.test(n)));
}

describe.each(PACKAGES)("@perchjs/%s", (pkg) => {
  const m = manifest(pkg);

  it("does not list a host-owned library under dependencies", () => {
    // optionalDependencies installs like a dependency, so it is the same defect
    // wearing a different field name.
    const offenders = hostOwned([
      ...Object.keys(m.dependencies ?? {}),
      ...Object.keys(m.optionalDependencies ?? {}),
    ]);
    expect(
      offenders,
      `${offenders.join(", ")} must move to peerDependencies: a second copy in the ` +
        `consumer's tree breaks Nest's DI tokens and duplicates the Prisma client`,
    ).toEqual([]);
  });

  it("backs every peer dependency with a dev dependency", () => {
    // Two reasons, and only the first is obvious. A package that imports its
    // peer cannot compile here without it. The second holds even for a peer
    // nothing imports — @perchjs/prisma describes the Prisma client
    // structurally and never names it — because the assertion below reads the
    // dev version to check the peer range admits it. Drop the dev dependency
    // as "unused" and that check silently has nothing to compare.
    const peers = Object.keys(m.peerDependencies ?? {});
    const dev = Object.keys(m.devDependencies ?? {});
    expect(peers.filter((p) => !dev.includes(p))).toEqual([]);
  });

  it("tests against a version the peer range actually admits", () => {
    // The quiet failure this catches: the peer range is widened to ^12 and the
    // dev dependency stays on 11, so CI keeps proving a version nobody can
    // install while the manifest advertises one nobody has tested.
    for (const [name, range] of Object.entries(m.peerDependencies ?? {})) {
      const dev = (m.devDependencies ?? {})[name];
      if (dev === undefined) continue; // reported by the assertion above
      const admitted = majors(range);
      const installed = majors(dev)[0];
      if (admitted.length === 0 || installed === undefined) continue; // unreadable range
      expect(
        admitted.includes(installed),
        `${name}: peer allows major ${admitted.join(" or ")}, dev installs ${dev}`,
      ).toBe(true);
    }
  });
});

describe("the peer contract each adapter declares", () => {
  it("has @perchjs/nest own the NestJS runtime as peers", () => {
    const peers = manifest("nest").peerDependencies ?? {};
    expect(Object.keys(peers).sort()).toEqual(["@nestjs/common", "@nestjs/core"]);
  });

  it("has @perchjs/prisma own the generated client as a peer", () => {
    expect(Object.keys(manifest("prisma").peerDependencies ?? {})).toEqual([
      "@prisma/client",
    ]);
  });

  it("keeps @perchjs/core free of any peer dependency", () => {
    // The domain imports nothing, so it asks nothing of the host.
    expect(manifest("core").peerDependencies ?? {}).toEqual({});
  });
});
