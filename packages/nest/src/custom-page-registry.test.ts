/**
 * A page with a schema and no model behind it, from the container.
 *
 * Most of this file is about addresses. Two things answering at one is the
 * failure nobody sees: whichever wins, the other is simply not there, and no
 * page anywhere says which or why. So the boot refuses the arrangement rather
 * than picking one of two by registration order — a coin flip nobody would
 * see land.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Schema, TextInput } from "@perchjs/core";
import { describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelPage } from "./custom-page.js";
import { CustomPageRegistry } from "./custom-page-registry.js";
import type { PageClass } from "./custom-page-registry.js";
import { PanelResource } from "./resource.js";

@Injectable()
class Settings {
  read(): Record<string, unknown> {
    return { title: "Perch" };
  }
}

@Module({ providers: [Settings], exports: [Settings] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class SettingsModule {}

@PanelPage({ path: "settings" })
class SettingsPage {
  constructor(private readonly settings: Settings) {}
  schema(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
  state(): Record<string, unknown> {
    return this.settings.read();
  }
}

@PanelResource({ model: "Post" })
class PostResource {
  form(): Schema {
    return Schema.make([TextInput.make("title")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-pages-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

async function boot(
  pages: readonly PageClass[],
  resources: readonly (new (...args: never[]) => { form: () => Schema })[] = [],
): Promise<CustomPageRegistry> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources,
        pages,
        imports: [SettingsModule],
        assets: assets(),
      }),
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef.get(CustomPageRegistry, { strict: false });
}

describe("a page comes from the container", () => {
  it("is instantiated with its dependencies, like a resource", async () => {
    const page = (await boot([SettingsPage])).get("settings");

    expect(page?.instance).toBeInstanceOf(SettingsPage);
    // The whole point: a settings page that cannot reach the service holding
    // the settings is a page that cannot do its one job.
    expect(await page?.instance.state?.()).toEqual({ title: "Perch" });
  });

  it("is named after its path where it said nothing", async () => {
    @PanelPage({ path: "import-orders" })
    class Orders {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    expect((await boot([Orders])).get("import-orders")?.metadata.label).toBe(
      "Import orders",
    );
  });

  it("is nothing at an address nobody declared", async () => {
    expect((await boot([SettingsPage])).get("nowhere")).toBeUndefined();
  });
});

describe("two things at one address", () => {
  it("stops the boot where two pages claim it", async () => {
    @PanelPage({ path: "settings" })
    class Other {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([SettingsPage, Other])).rejects.toThrow(/both claim the path/);
  });

  it("stops the boot where a resource already answers there", async () => {
    @PanelPage({ path: "posts" })
    class Posts {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Posts], [PostResource])).rejects.toThrow(
      /PostResource already answers/,
    );
  });

  it("stops the boot on a segment the panel itself serves", async () => {
    @PanelPage({ path: "api" })
    class Api {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Api])).rejects.toThrow(/the panel already serves/);
  });

  it("stops the boot on a path that is not one segment", async () => {
    @PanelPage({ path: "reports/monthly" })
    class Nested {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Nested])).rejects.toThrow(/not a single segment/);
  });

  it("stops a resource claiming the segment the page API lives under", async () => {
    @PanelResource({ model: "Sheet", slug: "page" })
    class Sheets {
      form(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([], [Sheets])).rejects.toThrow(/the panel already serves/);
  });
});

describe("what the boot reads", () => {
  it("refuses a page listed without the decorator", async () => {
    class Bare {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Bare as unknown as PageClass])).rejects.toThrow(
      /carries no @PanelPage/,
    );
  });

  it("refuses a schema that promises what it cannot do", async () => {
    @PanelPage({ path: "broken" })
    class Broken {
      schema(): Schema {
        // Two fields on one path: the second is the one that saves, and the
        // first is a box a reader fills in for nothing.
        return Schema.make([TextInput.make("title"), TextInput.make("title")]);
      }
    }

    await expect(boot([Broken])).rejects.toThrow(/Page "broken"/);
  });

  it("refuses a mark the panel has no drawing for", async () => {
    @PanelPage({ path: "settings", icon: "aubergine" as never })
    class Marked {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Marked])).rejects.toThrow(/has no drawing for/);
  });
});
