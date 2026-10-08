/**
 * What the week looks like, and what is waiting on somebody.
 *
 * Two narrowings rather than one call with both in it, which would be one
 * answer about two sets of rows.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { AggregateValue, DataAdapter, Stat } from "@perchjs/core";
import { Stat as Card } from "@perchjs/core";
import type { StatsWidget } from "@perchjs/nest";
import { PANEL_DATA_ADAPTER, PanelWidget } from "@perchjs/nest";

@Injectable()
@PanelWidget({ name: "hours", sort: 1, columnSpan: 2 })
export class HoursWidget implements StatsWidget {
  readonly #data: DataAdapter;

  constructor(@Inject(PANEL_DATA_ADAPTER) data: DataAdapter) {
    this.#data = data;
  }

  async stats(): Promise<readonly Stat[]> {
    const [logs, waiting, away] = await Promise.all([
      this.#data.aggregate({
        model: "TimeLog",
        aggregations: { rows: { fn: "count" } },
      }),
      this.#data.aggregate({
        model: "TimeLog",
        clauses: [{ path: "status", operator: "equals", value: "pending" }],
        aggregations: { rows: { fn: "count" } },
      }),
      // Soft-deleted rows are out, because a narrowing reads live rows unless
      // it says otherwise: a withdrawn request is not somebody away.
      this.#data.aggregate({
        model: "LeaveRequest",
        clauses: [{ path: "status", operator: "equals", value: "approved" }],
        aggregations: { rows: { fn: "count" } },
      }),
    ]);

    const total = whole(logs["rows"]);
    const pending = whole(waiting["rows"]);

    return [
      Card.make("Time logs", total)
        .icon("calendar")
        .description(`${String(pending)} waiting on an approval`)
        .descriptionIcon(pending === 0 ? "check" : "trending-up")
        .color(pending === 0 ? "success" : "warning"),
      Card.make("Approved leave", whole(away["rows"]))
        .icon("check")
        .description("Requests signed off"),
    ];
  }
}

/** The number an aggregate answered, where it cannot be null. */
function whole(value: AggregateValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}
