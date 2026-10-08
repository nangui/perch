/**
 * The four resources this panel deploys are declarable.
 *
 * Every refusal the panel makes at boot is about a declaration that cannot
 * work: a view that leads to a page nothing draws, a field promising what it
 * cannot do, two resources on one address. They are refusals rather than
 * warnings precisely so nobody finds out from a reader.
 *
 * Boots the panel the way the application does rather than through a testing
 * module: the same factory, no data adapter, because what is being asked is
 * whether the declarations pass and none of them needs a row.
 */
import { NestFactory } from "@nestjs/core";
import { PanelModule } from "@perchjs/nest";
import { describe, expect, it } from "vitest";

import { DepartmentsResource } from "./departments.resource.js";
import { EmployeesResource } from "./employees.resource.js";
import { LeaveResource } from "./leave.resource.js";
import { TimeLogsResource } from "./timelogs.resource.js";

/** Boots a panel over whatever is handed to it, and closes it either way. */
async function boots(resources: readonly object[]): Promise<void> {
  const app = await NestFactory.create(
    PanelModule.forRoot({
      path: "/admin",
      resources: resources as never,
      navigationGroups: ["People", "Organisation"],
    }),
    { logger: false },
  );
  try {
    await app.init();
  } finally {
    await app.close();
  }
}

const ALL = [
  EmployeesResource,
  TimeLogsResource,
  LeaveResource,
  DepartmentsResource,
] as const;

describe("the four resources this panel deploys", () => {
  it("boot, together, under the groups the application names", async () => {
    await expect(boots([...ALL])).resolves.toBeUndefined();
  });

  it("each boot on their own", async () => {
    // Together is what the application does; one at a time is what says which
    // one is at fault on the day this goes red.
    for (const resource of ALL) {
      await expect(boots([resource]), resource.name).resolves.toBeUndefined();
    }
  });

  it("offer a view only where a record has something to read", () => {
    // The teeth of it. Three of these put a View button on the row, and a view
    // that leads to a page nothing draws answers 404 under the reader's
    // finger — which is refused at boot rather than drawn.
    for (const resource of [EmployeesResource, TimeLogsResource, LeaveResource]) {
      const infolist = (resource.prototype as { infolist?: unknown }).infolist;
      expect(typeof infolist, `${resource.name} offers a view`).toBe("function");
    }
  });
});
