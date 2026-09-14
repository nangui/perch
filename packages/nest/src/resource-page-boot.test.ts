/**
 * What the boot refuses about a record's own pages.
 *
 * Two things at one address is the failure nobody sees: whichever wins, the
 * other is simply not there and no page says which or why. `edit` is the one
 * that matters here — it is matched before a page can be, so a page claiming
 * it would be quietly unreachable forever.
 *
 * The schemas are read here too, for the reason a resource's form is: a field
 * that promises what it cannot do otherwise fails under a reader, in
 * production, with no error at all. A record page's `schema()` takes no
 * record, which is the whole of what makes that possible.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Test } from "@nestjs/testing";
import { Schema, TextInput } from "@perchjs/core";
import { describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import type { ResourcePageClass } from "./resource.js";
import { PanelResourcePage } from "./resource-page.js";

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-page-boot-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

async function boot(pages: readonly ResourcePageClass[]): Promise<void> {
  @PanelResource({ model: "Post", slug: "posts", pages })
  class PostResource {
    form(): Schema {
      return Schema.make([TextInput.make("title")]);
    }
  }

  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources: [PostResource],
        assets: assets(),
      }),
    ],
  }).compile();
  await moduleRef.init();
}

describe("an address under a record", () => {
  it("cannot be one the panel already answers at", async () => {
    @PanelResourcePage({ path: "edit" })
    class Edit {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Edit])).rejects.toThrow(/already answered there/);
  });

  it("cannot be the segment the page API lives under", async () => {
    @PanelResourcePage({ path: "page" })
    class Page {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Page])).rejects.toThrow(/already answered there/);
  });

  it("cannot be claimed twice by one resource", async () => {
    @PanelResourcePage({ path: "stats" })
    class One {
      schema(): Schema {
        return Schema.make([]);
      }
    }
    @PanelResourcePage({ path: "stats" })
    class Two {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([One, Two])).rejects.toThrow(/already answered there/);
  });

  it("cannot be more than one segment", async () => {
    @PanelResourcePage({ path: "reports/monthly" })
    class Nested {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Nested])).rejects.toThrow(/not a single segment/);
  });

  it("is allowed where nothing else answers there", async () => {
    @PanelResourcePage({ path: "stats" })
    class Stats {
      schema(): Schema {
        return Schema.make([TextInput.make("summary")]);
      }
    }

    await expect(boot([Stats])).resolves.toBeUndefined();
  });
});

describe("what the boot reads of a page", () => {
  it("refuses one listed without the decorator", async () => {
    class Bare {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Bare as unknown as ResourcePageClass])).rejects.toThrow(
      /carries no @PanelResourcePage/,
    );
  });

  it("refuses a schema that promises what it cannot do", async () => {
    @PanelResourcePage({ path: "stats" })
    class Broken {
      schema(): Schema {
        // Two fields on one path: the second is the one that saves, and the
        // first is a box a reader fills in for nothing.
        return Schema.make([TextInput.make("a"), TextInput.make("a")]);
      }
    }

    await expect(boot([Broken])).rejects.toThrow(/stats:/);
  });

  it("refuses a mark the panel has no drawing for", async () => {
    @PanelResourcePage({ path: "stats", icon: "aubergine" as never })
    class Marked {
      schema(): Schema {
        return Schema.make([]);
      }
    }

    await expect(boot([Marked])).rejects.toThrow(/has no drawing for/);
  });
});
