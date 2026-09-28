/**
 * The four resources this demo deploys are declarable.
 *
 * Every refusal the panel makes at boot is about a declaration that cannot
 * work: a view that leads to a page nothing draws, a field promising what it
 * cannot do, two resources on one address. They are refusals rather than
 * warnings precisely so nobody finds out from a reader, and this demo is the
 * one deployment meant for readers.
 *
 * Boots the panel the way the application does rather than through a testing
 * module: the same factory, the same platform, no data adapter, because what is
 * being asked is whether the declarations pass and none of them needs a row.
 */
import { NestFactory } from "@nestjs/core";
import { Schema, Table, TextColumn, TextInput, ViewAction } from "@perchjs/core";
import { PanelModule } from "@perchjs/nest";
import { PanelResource } from "@perchjs/nest";
import { describe, expect, it } from "vitest";
import { ObserversResource } from "./observers.resource.js";
import { SightingsResource } from "./sightings.resource.js";
import { SitesResource } from "./sites.resource.js";
import { SpeciesResource } from "./species.resource.js";

/** Boots a panel over whatever is handed to it, and closes it either way. */
async function boots(resources: readonly object[]): Promise<void> {
  // The dynamic module is the entry point, rather than a class wrapping it:
  // there is nothing for such a class to hold, and an empty one is what the
  // lint here refuses.
  const app = await NestFactory.create(
    PanelModule.forRoot({
      path: "/admin",
      resources: resources as never,
      navigationGroups: ["Records", "Reference"],
    }),
    { logger: false },
  );
  try {
    await app.init();
  } finally {
    await app.close();
  }
}

describe("the four resources this demo deploys", () => {
  it("boot, together, under the groups the application names", async () => {
    await expect(
      boots([SightingsResource, SpeciesResource, ObserversResource, SitesResource]),
    ).resolves.toBeUndefined();
  });

  it("each boot on their own", async () => {
    // Together is what the application does; one at a time is what says which
    // one is at fault on the day this goes red.
    for (const resource of [
      SightingsResource,
      SpeciesResource,
      ObserversResource,
      SitesResource,
    ]) {
      await expect(boots([resource]), resource.name).resolves.toBeUndefined();
    }
  });

  it("would be refused if one of them offered a page it does not draw", async () => {
    // The teeth of the test above. This is the mistake this demo actually made
    // once: a View button on a resource with no infolist, drawn on the reader's
    // screen and answering 404 when pressed.
    @PanelResource({ model: "Species", slug: "broken" })
    class Broken {
      form() {
        return Schema.make([TextInput.make("commonName")]);
      }
      table() {
        return Table.make()
          .columns([TextColumn.make("commonName")])
          .actions([ViewAction.make()]);
      }
    }

    await expect(boots([Broken])).rejects.toThrow(/infolist/i);
  });
});
