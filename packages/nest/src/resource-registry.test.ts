/**
 * A resolver has to be able to call a business service, which means resources
 * come from the container. Booting a real one is the only way to say so.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { IconName, Table } from "@perchjs/core";
import {
  Repeater,
  resolveSchema,
  Schema,
  FileUpload,
  Select,
  SelectFilter,
  serialise,
  Table as TableBuilder,
  TextColumn,
  TextInput,
} from "@perchjs/core";
import { describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import { PanelResource } from "./resource.js";
import { ResourceRegistry } from "./resource-registry.js";

@Injectable()
class Cities {
  byCountry(country: string): { value: number; label: string }[] {
    return country === "fr" ? [{ value: 1, label: "Paris" }] : [];
  }
}

@Module({ providers: [Cities], exports: [Cities] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- a Nest module is a token
class CityModule {}

@PanelResource({ model: "Post" })
class PostResource {
  constructor(private readonly cities: Cities) {}

  form(): Schema {
    return Schema.make([
      TextInput.make("title").required(),
      Select.make("cityId").options(({ get }) =>
        this.cities.byCountry(String(get("country"))),
      ),
    ]);
  }
}

@PanelResource({ model: "Category", slug: "cats" })
class CategoryResource {
  form(): Schema {
    return Schema.make([TextInput.make("name")]);
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-registry-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

async function registry(
  resources: readonly (new (...args: never[]) => { form: () => Schema })[],
): Promise<ResourceRegistry> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        resources,
        imports: [CityModule],
        assets: assets(),
      }),
    ],
  }).compile();
  return moduleRef.get(ResourceRegistry, { strict: false });
}

describe("resources come from the container", () => {
  it("injects a service into a resource, reachable from a resolver", async () => {
    const found = (await registry([PostResource])).get("posts");
    expect(found?.instance).toBeInstanceOf(PostResource);

    // The whole point: the options come from the injected service, evaluated on
    // the server during the resolution cycle.
    const resolved = await resolveSchema(
      found!.instance.form(),
      { country: "fr" },
      {
        operation: "create",
      },
    );
    const city = serialise(resolved).schema.children?.find((n) => n.path === "cityId");

    expect(city?.options).toEqual([{ value: 1, label: "Paris" }]);
  });

  it("rebuilds the schema on every call", async () => {
    // A builder shared between requests leaks one user's state into another's,
    // so nothing may be cached with the instance.
    const found = (await registry([PostResource])).get("posts");

    expect(found?.instance.form()).not.toBe(found?.instance.form());
  });
});

describe("slugs", () => {
  it.each([
    ["Post", "posts"],
    ["Category", "categories"],
    ["Address", "addresses"],
    ["OrderItem", "order-items"],
  ])("turns %s into %s", async (model, slug) => {
    @PanelResource({ model })
    class R {
      form(): Schema {
        return Schema.make([]);
      }
    }

    expect((await registry([R])).get(slug)?.metadata.model).toBe(model);
  });

  it("takes an explicit slug over the inferred one", async () => {
    const found = await registry([CategoryResource]);

    expect(found.get("cats")).toBeDefined();
    expect(found.get("categories")).toBeUndefined();
  });
});

describe("refusing to boot", () => {
  it("rejects two resources claiming one slug", async () => {
    @PanelResource({ model: "Other", slug: "posts" })
    class Clash {
      form(): Schema {
        return Schema.make([]);
      }
    }

    await expect(registry([PostResource, Clash])).rejects.toThrow(
      /both claim the slug/,
    );
  });

  it.each(["assets", "api"])(
    "rejects a resource claiming the reserved slug %s",
    async (slug) => {
      @PanelResource({ model: "Thing", slug })
      class Reserved {
        form(): Schema {
          return Schema.make([]);
        }
      }

      await expect(registry([Reserved])).rejects.toThrow(
        /which the panel already serves/,
      );
    },
  );

  it("rejects a class with no @PanelResource", async () => {
    class Bare {
      form(): Schema {
        return Schema.make([]);
      }
    }

    await expect(registry([Bare])).rejects.toThrow(/carries no @PanelResource/);
  });
});

describe("a mark the menu cannot draw", () => {
  // Through a cast: the decorator names the set now, so this is the shape a
  // plugin written in JavaScript has — which is what the boot is left to catch.
  @PanelResource({ model: "Post", slug: "unmarked", icon: "\u{1F426}" as IconName })
  class UnmarkedResource {
    form(): Schema {
      return Schema.make([TextInput.make("title")]);
    }
  }

  @PanelResource({ model: "Post", slug: "marked", icon: "users" })
  class MarkedResource {
    form(): Schema {
      return Schema.make([TextInput.make("title")]);
    }
  }

  it("stops the boot, the way every other mark in the panel does", async () => {
    // The one mark no walk reaches: named in the decorator rather than in a
    // tree, and sitting on the door to every page of the resource. Left unread
    // it is simply absent from the menu, and an entry with no mark beside
    // others that have one reads as an entry that is somehow lesser.
    await expect(
      Test.createTestingModule({
        imports: [
          PanelModule.forRoot({
            path: "/admin",
            resources: [UnmarkedResource],
            assets: assets(),
          }),
        ],
      })
        .compile()
        .then(async (moduleRef) => await moduleRef.init()),
    ).rejects.toThrow(/has no drawing for/);
  });

  it("lets through a name the panel draws", async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          PanelModule.forRoot({
            path: "/admin",
            resources: [MarkedResource],
            assets: assets(),
          }),
        ],
      })
        .compile()
        .then(async (moduleRef) => await moduleRef.init()),
    ).resolves.toBeDefined();
  });
});

describe("a form that cannot work", () => {
  @PanelResource({ model: "Post", slug: "broken" })
  class BrokenResource {
    form(): Schema {
      return Schema.make([Select.make("status")]);
    }
  }

  it("stops the boot rather than failing under a reader", async () => {
    // Loud, and at boot: this is a line of somebody's own form, not anything a
    // client sent, and the only useful answer is which line.
    await expect(
      Test.createTestingModule({
        imports: [
          PanelModule.forRoot({
            path: "/admin",
            resources: [BrokenResource],
            assets: assets(),
          }),
        ],
      })
        .compile()
        .then(async (moduleRef) => await moduleRef.init()),
    ).rejects.toThrow("`status` has neither options nor a relationship");
  });
});

describe("a table that cannot work", () => {
  @PanelResource({ model: "Post", slug: "broken-table" })
  class BrokenTableResource {
    form(): Schema {
      return Schema.make([TextInput.make("title")]);
    }
    table(): Table {
      // Declared and never given its choices: it would cross the wire, draw no
      // control, and filter nothing, with nothing at all to say why.
      return TableBuilder.make()
        .columns([TextColumn.make("title")])
        .filters([SelectFilter.make("status")]);
    }
  }

  it("stops the boot as surely as a form does", async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          PanelModule.forRoot({
            path: "/admin",
            resources: [BrokenTableResource],
            assets: assets(),
          }),
        ],
      })
        .compile()
        .then(async (moduleRef) => await moduleRef.init()),
    ).rejects.toThrow("`status` is a choice with nothing to choose from");
  });
});

describe("an upload pointed at a disk nobody gave", () => {
  @PanelResource({ model: "Post", slug: "no-disk" })
  class NoDiskResource {
    form(): Schema {
      return Schema.make([FileUpload.make("cover").disk("s3")]);
    }
  }

  it("stops the boot, naming the disks there are", async () => {
    // Not `auditSchema`'s to catch: which disks exist is the host's
    // arrangement, and `@perchjs/core` has never heard of it.
    await expect(
      Test.createTestingModule({
        imports: [
          PanelModule.forRoot({
            path: "/admin",
            resources: [NoDiskResource],
            disks: { local: {} as never },
            assets: assets(),
          }),
        ],
      })
        .compile()
        .then(async (moduleRef) => await moduleRef.init()),
    ).rejects.toThrow(
      "names the disk `s3`, which the panel was not given — it has `local`",
    );
  });

  it("says so plainly when there are none at all", async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          PanelModule.forRoot({
            path: "/admin",
            resources: [NoDiskResource],
            assets: assets(),
          }),
        ],
      })
        .compile()
        .then(async (moduleRef) => await moduleRef.init()),
    ).rejects.toThrow("it has none at all");
  });

  it("boots once the disk it names is there", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PanelModule.forRoot({
          path: "/admin",
          resources: [NoDiskResource],
          disks: { s3: {} as never },
          assets: assets(),
        }),
      ],
    }).compile();

    await expect(moduleRef.init()).resolves.toBeDefined();
    await moduleRef.close();
  });
});

describe("a column reading a path the model does not have", () => {
  const IR = {
    models: [
      {
        name: "Post",
        dbName: "Post",
        primaryKey: { name: "id", kind: "scalar", type: "Int", isId: true },
        fields: [
          { name: "id", kind: "scalar", type: "Int", isId: true },
          { name: "title", kind: "scalar", type: "String" },
        ],
        relations: [],
        uniqueConstraints: [],
        hasSoftDelete: false,
        labelField: "id",
      },
    ],
  } as never;

  @Injectable()
  class Adapter {
    ir() {
      return IR;
    }
  }

  @PanelResource({ model: "Post", slug: "typo" })
  class TypoResource {
    form(): Schema {
      return Schema.make([TextInput.make("title")]);
    }
    table(): Table {
      return TableBuilder.make().columns([TextColumn.make("titel")]);
    }
  }

  @PanelResource({ model: "Ghost", slug: "ghost" })
  class GhostResource {
    form(): Schema {
      return Schema.make([TextInput.make("title")]);
    }
    table(): Table {
      return TableBuilder.make().columns([TextColumn.make("anything")]);
    }
  }

  const boot = async (resource: unknown): Promise<void> => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PanelModule.forRoot({
          path: "/admin",
          resources: [resource as never],
          dataAdapter: Adapter as never,
          assets: assets(),
        }),
      ],
    }).compile();
    await moduleRef.init();
  };

  it("stops the boot, naming the path and what it could not resolve", async () => {
    // A typo here is a column that renders blank on every row until somebody
    // looks closely — and, since the loading plan is built from these paths, a
    // relation that silently never loads.
    await expect(boot(TypoResource)).rejects.toThrow(
      "`titel` is a column on `Post` that reads nothing",
    );
  });

  it("says nothing about a model the IR does not carry at all", async () => {
    // That is one problem, not one per column, and the read path tolerates it
    // the same way rather than complaining about every path.
    await expect(boot(GhostResource)).resolves.toBeUndefined();
  });
});

describe("a form field writing a column the model has not", () => {
  const IR = {
    models: [
      {
        name: "Post",
        dbName: "Post",
        primaryKey: { name: "id", kind: "scalar", type: "Int", isId: true },
        fields: [
          { name: "id", kind: "scalar", type: "Int", isId: true },
          { name: "title", kind: "scalar", type: "String" },
        ],
        relations: [
          {
            name: "sections",
            type: "many",
            targetModel: "Section",
            relationName: "PostToSection",
            foreignKeyFields: [],
            referencedFields: [],
            isRequired: false,
            isList: true,
          },
        ],
        uniqueConstraints: [],
        hasSoftDelete: false,
        labelField: "title",
      },
      {
        name: "Section",
        dbName: "Section",
        primaryKey: { name: "id", kind: "scalar", type: "Int", isId: true },
        fields: [
          { name: "id", kind: "scalar", type: "Int", isId: true },
          { name: "label", kind: "scalar", type: "String" },
        ],
        relations: [],
        uniqueConstraints: [],
        hasSoftDelete: false,
        labelField: "label",
      },
    ],
  } as never;

  @Injectable()
  class Adapter {
    ir() {
      return IR;
    }
  }

  const boot = async (form: Schema): Promise<void> => {
    @PanelResource({ model: "Post", slug: "posts" })
    class Resource {
      form(): Schema {
        return form;
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        PanelModule.forRoot({
          path: "/admin",
          resources: [Resource],
          dataAdapter: Adapter as never,
          assets: assets(),
        }),
      ],
    }).compile();
    await moduleRef.init();
  };

  it("stops the boot, because the adapter refuses the whole row", async () => {
    await expect(boot(Schema.make([TextInput.make("titel")]))).rejects.toThrow(
      "`titel` is a field on `Post`, which has no column by that name",
    );
  });

  it("leaves a control that was never going to be a column alone", async () => {
    // A confirmation box, a toggle that only shows something: forms have these,
    // and saying so is what `.dehydrated(false)` is for.
    await expect(
      boot(
        Schema.make([
          TextInput.make("title"),
          TextInput.make("titleAgain").dehydrated(false),
        ]),
      ),
    ).resolves.toBeUndefined();
  });

  it("judges a repeater's rows against the model they are written to", async () => {
    await expect(
      boot(Schema.make([Repeater.make("sections").schema([TextInput.make("label")])])),
    ).resolves.toBeUndefined();

    await expect(
      boot(Schema.make([Repeater.make("sections").schema([TextInput.make("title")])])),
    ).rejects.toThrow("`title` is a field on `Section`");
  });

  it("stops the boot on a repeater naming no to-many at all", async () => {
    await expect(
      boot(Schema.make([Repeater.make("chapters").schema([TextInput.make("label")])])),
    ).rejects.toThrow("`chapters` is a repeater on `Post`");
  });
});
