/**
 * Dropping staged files nobody came back for.
 *
 * ADR 0016 decision 4 says orphans are bounded rather than tolerated, and names
 * two kinds. This is the common one: a reader chose a file, the bytes went up,
 * and the form was never saved — the tab was closed, the day ended. Nothing
 * points at it and nothing ever will.
 *
 * The framework provides this and the host schedules it. Not a timer started
 * here: a panel does not get to run background work in a process it does not
 * own, and three instances behind a load balancer would each start their own.
 * The host has a scheduler, knows how many of it there are, and knows when the
 * quiet hour is.
 *
 * It does not touch the other kind. A file committed while the row write failed
 * sits in its final place, where no age can tell it from one that belongs, and
 * it is found by comparing the store against the column or not at all. Saying
 * so here rather than leaving the name `sweep` to imply otherwise.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { PanelDisks } from "./storage.token.js";
import { PANEL_STORAGE } from "./storage.token.js";

/**
 * A day.
 *
 * Longer than any plausible gap between choosing a file and saving the form —
 * a form left open over lunch is hours, and one left overnight is the reason
 * this is not measured in minutes.
 */
export const DEFAULT_STAGED_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PanelUploadSweep {
  readonly #disks: PanelDisks;

  constructor(@Inject(PANEL_STORAGE) disks: PanelDisks) {
    this.#disks = disks;
  }

  /**
   * Drops staged files older than `olderThan`, on every disk, and answers how
   * many went.
   *
   * Every disk is swept even if one of them throws: a store being down is no
   * reason to leave the others filling up. What failed is reported afterwards,
   * so a scheduler logs it rather than a silence that reads like success.
   */
  async run(
    olderThan: Date = new Date(Date.now() - DEFAULT_STAGED_AGE_MS),
  ): Promise<number> {
    const names = Object.keys(this.#disks);
    const outcomes = await Promise.allSettled(
      names.map(async (name) => await this.#disks[name]?.sweepStaged(olderThan)),
    );

    let dropped = 0;
    const failed: string[] = [];
    outcomes.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") dropped += outcome.value ?? 0;
      else failed.push(names[index] ?? "an unnamed disk");
    });

    if (failed.length > 0) {
      throw new Error(
        `Swept ${String(dropped)} staged files. These disks refused: ${failed.join(", ")}.`,
      );
    }
    return dropped;
  }
}
