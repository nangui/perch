/**
 * The example that shows everything boots.
 *
 * Its person resource is seven hundred lines of declarations, which is the
 * point of it: a reader opens this to see how a field, a column, a filter or an
 * action is written, and the panel refuses at boot anything that promises what
 * it cannot do. So the file most likely to be copied from is the one where a
 * refusal would be found by a reader rather than by us.
 *
 * The whole module as it ships, rather than a panel assembled here: the
 * resources inject a provider, the uploads name a disk, the custom field is
 * served by a controller beside them, and a test that built its own panel would
 * prove something no reader has.
 */
import { NestFactory } from "@nestjs/core";
import { PanelModule } from "@perchjs/nest";
import { describe, expect, it } from "vitest";
import { AppModule, AppServices } from "./app.module.js";
import { MemoryAdapter } from "./memory.adapter.js";
import { PersonResource } from "./person.resource.js";
import { TeamResource } from "./team.resource.js";

/** Boots it and closes it, whatever happens. */
async function boots(entry: Parameters<typeof NestFactory.create>[0]): Promise<void> {
  const app = await NestFactory.create(entry, { logger: false });
  try {
    await app.init();
  } finally {
    await app.close();
  }
}

describe("the example as it ships", () => {
  it("boots, with everything it declares", async () => {
    await expect(boots(AppModule)).resolves.toBeUndefined();
  });
});

describe("what the boot would refuse", () => {
  it("a panel whose uploads name a disk nothing provides", async () => {
    // The teeth of the test above, and the mistake this example is one edit
    // away from: a `FileUpload` picks its disk by name, and a name nothing
    // answers is a control that would fail at the first file rather than at the
    // start.
    await expect(
      boots(
        PanelModule.forRoot({
          path: "/admin",
          resources: [PersonResource, TeamResource],
          dataAdapter: MemoryAdapter,
          imports: [AppServices],
        }),
      ),
    ).rejects.toThrow(/disk/i);
  });
});
