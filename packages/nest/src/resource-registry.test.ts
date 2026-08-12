/**
 * A resolver has to be able to call a business service, which means resources
 * come from the container. Booting a real one is the only way to say so.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Table } from "@perchjs/core";
import {
  resolveSchema,
  Schema,
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
