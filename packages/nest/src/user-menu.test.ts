/**
 * Who is signed in, decided on the server.
 *
 * Every one of these is a thing the browser must not be asked to work out. The
 * name comes off a principal Perch did not define, so only the host can read
 * it. An item this reader may not have must never reach the page, hiding it
 * afterwards being the same as sending it. And an address goes through the
 * check every other address in the panel goes through, because `javascript:`
 * in an `href` is the same hole wherever the string came from.
 */
import { describe, expect, it } from "vitest";
import { buildUserMenu } from "./user-menu.js";

const ada = { id: 1, displayName: "Ada", role: "admin" };

describe("the name", () => {
  it("is read off a principal the panel knows nothing about", async () => {
    const menu = await buildUserMenu(
      { name: (user) => (user as typeof ada).displayName },
      ada,
    );

    expect(menu?.name).toBe("Ada");
  });

  it("may be worked out rather than read", async () => {
    const menu = await buildUserMenu(
      { name: async (user) => Promise.resolve(`#${String((user as typeof ada).id)}`) },
      ada,
    );

    expect(menu?.name).toBe("#1");
  });

  it("being nothing means no menu at all", async () => {
    // A menu headed by a blank says somebody is signed in without saying who.
    for (const said of [undefined, "", "   "]) {
      expect(await buildUserMenu({ name: () => said }, ada)).toBeUndefined();
    }
  });

  it("is trimmed, a name with space around it being the same name", async () => {
    const menu = await buildUserMenu({ name: () => "  Ada  " }, ada);

    expect(menu?.name).toBe("Ada");
  });
});

describe("an item", () => {
  const menu = (over: Parameters<typeof buildUserMenu>[0]) =>
    buildUserMenu({ name: () => "Ada", ...over }, ada);

  it("crosses with the address it declared", async () => {
    const built = await menu({
      name: () => "Ada",
      items: [{ label: "Sign out", href: "/auth/logout" }],
    });

    expect(built?.items).toEqual([{ label: "Sign out", href: "/auth/logout" }]);
  });

  it("may point off the site, an identity provider's logout being one", async () => {
    const built = await menu({
      name: () => "Ada",
      items: [{ label: "Sign out", href: "https://id.example/logout" }],
    });

    expect(built?.items[0]?.href).toBe("https://id.example/logout");
  });

  it("is dropped where its address is not one a browser should follow", async () => {
    const built = await menu({
      name: () => "Ada",
      items: [{ label: "Trouble", href: "javascript:alert(1)" }],
    });

    expect(built?.items).toEqual([]);
  });

  it("never reaches the page where this reader may not have it", async () => {
    // Asked here rather than drawn and hidden. Hiding it is sending it.
    const built = await menu({
      name: () => "Ada",
      items: [
        { label: "Admin", href: "/admin", visible: () => false },
        { label: "Profile", href: "/me" },
      ],
    });

    expect(built?.items.map((one) => one.label)).toEqual(["Profile"]);
    expect(JSON.stringify(built)).not.toContain("Admin");
  });

  it("is asked about this reader, not about readers in general", async () => {
    const only = {
      name: () => "Ada",
      items: [
        {
          label: "Admin",
          href: "/admin",
          visible: (u: unknown) => (u as typeof ada).role === "admin",
        },
      ],
    };

    expect((await buildUserMenu(only, ada))?.items).toHaveLength(1);
    expect((await buildUserMenu(only, { role: "guest" }))?.items).toHaveLength(0);
  });

  it("keeps the mark it named", async () => {
    const built = await menu({
      name: () => "Ada",
      items: [{ label: "Profile", href: "/me", icon: "user" }],
    });

    expect(built?.items[0]?.icon).toBe("user");
  });
});

describe("a panel told nothing", () => {
  it("has no menu, rather than an empty one", async () => {
    expect(await buildUserMenu(undefined, ada)).toBeUndefined();
  });

  it("has no menu for nobody signed in either", async () => {
    expect(
      await buildUserMenu(
        { name: (user) => (user === undefined ? undefined : "?") },
        undefined,
      ),
    ).toBeUndefined();
  });
});

describe("a line under the name", () => {
  it("crosses where it was declared", async () => {
    const built = await buildUserMenu(
      { name: () => "Ada", description: (u) => (u as typeof ada).role },
      ada,
    );

    expect(built?.description).toBe("admin");
  });

  it("is absent rather than blank where it came to nothing", async () => {
    const built = await buildUserMenu(
      { name: () => "Ada", description: () => "  " },
      ada,
    );

    expect(built?.description).toBeUndefined();
  });
});
