/**
 * The framework provides the sweep, rather than leaving it to whoever
 * implements a disk.
 *
 * Until this existed, `sweepStaged` was a port method nobody called — the
 * common leftover, a file chosen and never saved, accumulated without limit
 * while the record said orphans were bounded.
 */
import { Test } from "@nestjs/testing";
import type { StagedFile, StorageAdapter } from "@perchjs/core";
import { describe, expect, it, vi } from "vitest";
import { PANEL_STORAGE } from "./storage.token.js";
import { DEFAULT_STAGED_AGE_MS, PanelUploadSweep } from "./upload-sweep.js";

function disk(dropped: number, refuse = false): StorageAdapter & { asked: Date[] } {
  const asked: Date[] = [];
  return {
    asked,
    stage: (): Promise<StagedFile> => Promise.reject(new Error("not needed here")),
    commit: (key: string) => Promise.resolve(key),
    remove: () => Promise.resolve(),
    url: (key: string) => key,
    sweepStaged: (olderThan: Date) => {
      asked.push(olderThan);
      return refuse
        ? Promise.reject(new Error("store is down"))
        : Promise.resolve(dropped);
    },
  };
}

async function sweeperFor(
  disks: Record<string, StorageAdapter>,
): Promise<PanelUploadSweep> {
  const moduleRef = await Test.createTestingModule({
    providers: [PanelUploadSweep, { provide: PANEL_STORAGE, useValue: disks }],
  }).compile();
  return moduleRef.get(PanelUploadSweep);
}

describe("sweeping", () => {
  it("reaches every disk the panel was given", async () => {
    const local = disk(2);
    const s3 = disk(3);
    const sweeper = await sweeperFor({ local, s3 });

    const dropped = await sweeper.run();

    expect(local.asked).toHaveLength(1);
    expect(s3.asked).toHaveLength(1);
    expect(dropped).toBe(5);
  });

  it("asks for a day ago when nobody says otherwise", async () => {
    // Longer than any plausible gap between choosing a file and saving: a form
    // left open over lunch is hours.
    const local = disk(0);
    const sweeper = await sweeperFor({ local });

    const before = Date.now();
    await sweeper.run();

    const asked = local.asked[0]?.getTime() ?? 0;
    expect(before - asked).toBeGreaterThanOrEqual(DEFAULT_STAGED_AGE_MS);
    expect(before - asked).toBeLessThan(DEFAULT_STAGED_AGE_MS + 5_000);
  });

  it("takes an instant from whoever schedules it", async () => {
    const local = disk(0);
    const sweeper = await sweeperFor({ local });
    const when = new Date("2026-06-15T00:00:00Z");

    await sweeper.run(when);

    expect(local.asked[0]).toEqual(when);
  });

  it("does nothing, quietly, where there are no disks", async () => {
    const sweeper = await sweeperFor({});

    await expect(sweeper.run()).resolves.toBe(0);
  });
});

describe("a disk that refuses", () => {
  it("does not stop the others", async () => {
    // A store being down is no reason to leave the rest filling up.
    const broken = disk(0, true);
    const working = disk(4);
    const sweeper = await sweeperFor({ broken, working });

    await expect(sweeper.run()).rejects.toThrow();
    expect(working.asked).toHaveLength(1);
  });

  it("is named, with what was swept before it", async () => {
    // A silence here reads like success, and the next sweep is a day away.
    const broken = disk(0, true);
    const working = disk(4);
    const sweeper = await sweeperFor({ broken, working });

    await expect(sweeper.run()).rejects.toThrow(
      "Swept 4 staged files. These disks refused: broken.",
    );
  });
});

describe("what it does not touch", () => {
  it("only ever asks about staged files", async () => {
    // The other leftover — committed while the row write failed — sits in its
    // final place where no age can tell it from one that belongs.
    const local = disk(1);
    const remove = vi.spyOn(local, "remove");
    const sweeper = await sweeperFor({ local });

    await sweeper.run();

    expect(remove).not.toHaveBeenCalled();
  });
});

describe("the age itself", () => {
  it("is a day", () => {
    // Pinned to the number rather than to the constant: asserting against the
    // constant moves with it, and this is a decision — too short and a form
    // left open over lunch loses the file somebody attached to it.
    expect(DEFAULT_STAGED_AGE_MS).toBe(86_400_000);
  });
});

describe("who runs it", () => {
  it("can be injected by a module that imports the panel", async () => {
    // Its whole purpose: the framework provides the sweep, the host schedules
    // it. A provider the host cannot reach provides nothing.
    //
    // Through a consumer module rather than `moduleRef.get`, which searches the
    // container and finds a provider whether or not it was exported — so it
    // would pass while proving nothing. Nest refuses to resolve a dependency
    // an imported module does not export, and that refusal is the assertion.
    const { mkdtempSync, writeFileSync: write } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { Injectable, Module } = await import("@nestjs/common");
    const { PanelModule } = await import("./panel.module.js");

    const directory = mkdtempSync(join(tmpdir(), "perch-sweep-"));
    write(join(directory, "panel-a1b2c3d4.js"), "");
    write(join(directory, "panel-e5f6a7b8.css"), "");

    @Injectable()
    class NightlyChore {
      constructor(readonly sweep: PanelUploadSweep) {}
    }

    @Module({
      imports: [
        PanelModule.forRoot({
          path: "/admin",
          disks: { local: disk(0) },
          assets: {
            directory,
            entries: {
              "panel.js": "panel-a1b2c3d4.js",
              "panel.css": "panel-e5f6a7b8.css",
            },
            chunks: [],
          },
        }),
      ],
      providers: [NightlyChore],
    })
    // Empty by design: a host module exists to wire, and the wiring is the
    // decorator. The rule is right in general and wrong for this shape.
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    class HostModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [HostModule],
    }).compile();

    expect(moduleRef.get(NightlyChore).sweep).toBeInstanceOf(PanelUploadSweep);
  });
});
