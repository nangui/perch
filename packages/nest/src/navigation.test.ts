/**
 * The menu, and the security invariant it rests on: a `viewAny` refusal removes
 * the entry *and* protects the routes. This file is the first half.
 */
import { describe, expect, it } from "vitest";
import type { IconName } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import type { Authorization } from "./authorization.js";
import { buildNavigation } from "./navigation.js";
import type { RegisteredResource } from "./resource-registry.js";

function resource(
  slug: string,
  over: {
    pluralLabel?: string;
    navigationGroup?: string;
    navigationSort?: number;
    icon?: IconName;
    badge?: (user: unknown) => string | undefined | Promise<string | undefined>;
    can?: Authorization;
  } = {},
): RegisteredResource {
  return {
    metadata: {
      model: "Post",
      slug,
      label: slug,
      pluralLabel: over.pluralLabel ?? slug,
      ...(over.navigationGroup === undefined
        ? {}
        : { navigationGroup: over.navigationGroup }),
      ...(over.navigationSort === undefined
        ? {}
        : { navigationSort: over.navigationSort }),
      ...(over.icon === undefined ? {} : { icon: over.icon }),
    },
    instance: {
      form: () => Schema.make([TextInput.make("title")]),
      ...(over.badge === undefined ? {} : { navigationBadge: over.badge }),
      ...(over.can === undefined ? {} : { can: over.can }),
    },
  };
}

const build = (
  resources: readonly RegisteredResource[],
  user?: unknown,
  groups: readonly string[] = [],
  current?: string,
) => buildNavigation(resources, user, "/admin", groups, current);

describe("what the menu shows", () => {
  it("names each resource by its plural label, at its own path", async () => {
    const nav = await build([resource("posts", { pluralLabel: "Posts" })]);

    expect(nav).toEqual([{ items: [{ label: "Posts", href: "/admin/posts" }] }]);
  });

  it("carries the icon when one was declared, and nothing when not", async () => {
    const nav = await build([resource("posts", { icon: "tag" }), resource("tags")]);

    expect(nav[0]?.items[0]).toMatchObject({ icon: "tag" });
    expect(nav[0]?.items[1]).not.toHaveProperty("icon");
  });

  it("marks the resource whose page is open", async () => {
    const nav = await build(
      [resource("posts"), resource("tags")],
      undefined,
      [],
      "tags",
    );

    expect(nav[0]?.items[0]).not.toHaveProperty("current");
    expect(nav[0]?.items[1]).toMatchObject({ current: true });
  });
});

describe("what the menu hides", () => {
  it("removes a resource this user may not reach", async () => {
    // The routes refuse it too; neither stands in for the other.
    const nav = await build([
      resource("posts", { can: { viewAny: () => false } }),
      resource("tags"),
    ]);

    expect(nav[0]?.items.map((i) => i.label)).toEqual(["tags"]);
  });

  it("asks the resource, per user, rather than once", async () => {
    const gated = resource("posts", {
      can: { viewAny: (user) => (user as { id: string }).id === "ada" },
    });

    expect((await build([gated], { id: "ada" }))[0]?.items).toHaveLength(1);
    expect(await build([gated], { id: "grace" })).toEqual([]);
  });

  it("drops an entry it cannot address", async () => {
    // The same guard the row actions go through: a panel reached at
    // `//evil.com/...` offers no link off the site, menu included.
    const nav = await buildNavigation(
      [resource("posts")],
      undefined,
      "//evil.com/admin",
    );

    expect(nav).toEqual([]);
  });
});

describe("the order it comes in", () => {
  it("puts ungrouped items first, then the panel's groups in its order", async () => {
    const nav = await build(
      [
        resource("orders", { navigationGroup: "Commerce" }),
        resource("users", { navigationGroup: "Access" }),
        resource("home"),
      ],
      undefined,
      ["Access", "Commerce"],
    );

    expect(nav.map((g) => g.label)).toEqual([undefined, "Access", "Commerce"]);
  });

  it("keeps a group the panel never declared, after those and alphabetically", async () => {
    const nav = await build(
      [
        resource("z", { navigationGroup: "Zulu" }),
        resource("a", { navigationGroup: "Alpha" }),
        resource("u", { navigationGroup: "Access" }),
      ],
      undefined,
      ["Access"],
    );

    expect(nav.map((g) => g.label)).toEqual(["Access", "Alpha", "Zulu"]);
  });

  it("sorts by navigationSort, and by label when that ties", async () => {
    const nav = await build([
      resource("b", { navigationSort: 2 }),
      resource("z", { navigationSort: 1 }),
      resource("a", { navigationSort: 1 }),
    ]);

    expect(nav[0]?.items.map((i) => i.label)).toEqual(["a", "z", "b"]);
  });

  it("shows no group that ended up empty", async () => {
    const nav = await build(
      [
        resource("posts", {
          navigationGroup: "Content",
          can: { viewAny: () => false },
        }),
      ],
      undefined,
      ["Content"],
    );

    expect(nav).toEqual([]);
  });
});

describe("a count beside a name", () => {
  it("carries what the resource answered, and nothing where it answered nothing", async () => {
    const nav = await build([
      resource("posts", { badge: () => "12" }),
      resource("tags"),
    ]);

    expect(nav[0]?.items[0]).toMatchObject({ badge: "12" });
    expect(nav[0]?.items[1]).not.toHaveProperty("badge");
  });

  it("is asked with the principal, because a count is a fact about rows", async () => {
    let asked: unknown = "never";
    await build(
      [
        resource("posts", {
          badge: (user) => {
            asked = user;
            return "1";
          },
        }),
      ],
      { id: 7 },
    );

    expect(asked).toEqual({ id: 7 });
  });

  it("is never asked of a resource this reader cannot reach", async () => {
    // The policy runs first. A count of rows somebody may not see is a fact
    // about them, one digit at a time, and asking for it at all is the leak.
    let asked = false;
    const nav = await build([
      resource("posts", {
        can: { viewAny: () => false },
        badge: () => {
          asked = true;
          return "1";
        },
      }),
    ]);

    expect(nav).toEqual([]);
    expect(asked).toBe(false);
  });

  it("waits for one that answers late", async () => {
    const nav = await build([
      resource("posts", { badge: () => Promise.resolve("3") }),
    ]);

    expect(nav[0]?.items[0]).toMatchObject({ badge: "3" });
  });
});
