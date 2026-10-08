/**
 * Who is on the books, and what they cost.
 *
 * Through the port rather than through a client: `aggregate` takes the same
 * narrowing a list takes, so these are the numbers the Employees page would
 * show and the two cannot disagree.
 *
 * The payroll figure is a sum of a `Decimal`, which comes back as digits in a
 * string because no double holds it. It is handed to the card as a string for
 * the same reason, rather than being turned into a number on the way.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { AggregateValue, DataAdapter, Stat } from "@perchjs/core";
import { Stat as Card } from "@perchjs/core";
import type { StatsWidget } from "@perchjs/nest";
import { PANEL_DATA_ADAPTER, PanelWidget } from "@perchjs/nest";

@Injectable()
@PanelWidget({ name: "headcount", sort: 0, columnSpan: 2 })
export class HeadcountWidget implements StatsWidget {
  readonly #data: DataAdapter;

  constructor(@Inject(PANEL_DATA_ADAPTER) data: DataAdapter) {
    this.#data = data;
  }

  async stats(): Promise<readonly Stat[]> {
    const [all, full] = await Promise.all([
      this.#data.aggregate({
        model: "Employee",
        aggregations: { rows: { fn: "count" }, payroll: { fn: "sum", path: "salary" } },
      }),
      this.#data.aggregate({
        model: "Employee",
        clauses: [{ path: "employment", operator: "equals", value: "full" }],
        aggregations: { rows: { fn: "count" } },
      }),
    ]);

    const people = whole(all["rows"]);
    const permanent = whole(full["rows"]);

    return [
      Card.make("People", people)
        .icon("users")
        .description(`${String(permanent)} of them full time`),
      Card.make("Monthly payroll", money(all["payroll"]))
        .icon("tag")
        .description("Across every contract")
        .color("neutral"),
    ];
  }
}

/** The number an aggregate answered, where it cannot be null. */
function whole(value: AggregateValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

/**
 * A sum of money, kept as it came.
 *
 * A `sum` over no rows is null rather than nought, and printing 0 there would
 * state a total nobody worked out. The dash is the honest answer.
 */
function money(value: AggregateValue | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}
