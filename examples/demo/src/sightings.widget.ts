/**
 * What the dashboard says about the records themselves.
 *
 * Through the port rather than through the client. A widget may hold a Prisma
 * client — nothing stops it — but it does not have to: `aggregate` takes the
 * same narrowing a list takes, so a card counts what a page would have listed
 * and is scoped by whatever scopes that.
 *
 * Two calls, because they are two different narrowings. One call with both in
 * it would be one answer about two sets of rows.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { AggregateValue, DataAdapter, Stat } from "@perchjs/core";
import { Stat as Card } from "@perchjs/core";
import type { StatsWidget } from "@perchjs/nest";
import { PANEL_DATA_ADAPTER, PanelWidget } from "@perchjs/nest";

@Injectable()
@PanelWidget({ name: "sightings", sort: 1, columnSpan: 2 })
export class SightingsWidget implements StatsWidget {
  readonly #data: DataAdapter;

  constructor(@Inject(PANEL_DATA_ADAPTER) data: DataAdapter) {
    this.#data = data;
  }

  async stats(): Promise<readonly Stat[]> {
    // Soft-deleted rows are out of both, because a narrowing reads live rows
    // unless it says otherwise — so a total here is the total a reader sees on
    // the list page, and the two cannot disagree.
    const [all, confirmed] = await Promise.all([
      this.#data.aggregate({
        model: "Sighting",
        aggregations: { rows: { fn: "count" }, birds: { fn: "sum", path: "count" } },
      }),
      this.#data.aggregate({
        model: "Sighting",
        clauses: [{ path: "confirmed", operator: "equals", value: true }],
        aggregations: { rows: { fn: "count" } },
      }),
    ]);

    const total = whole(all["rows"]);
    const checked = whole(confirmed["rows"]);
    const share = total === 0 ? 0 : Math.round((checked / total) * 100);

    return [
      Card.make("Sightings", total)
        .icon("eye")
        .description(`${String(whole(all["birds"]))} birds counted`),
      Card.make("Confirmed", checked)
        .icon("check")
        .description(`${String(share)}% of them`)
        // The arrow is about the share rather than about the number, which is
        // the only thing a trend can mean on a figure with nothing to compare
        // it to. Half is the line because a demo anybody may edit should be
        // able to cross it.
        .descriptionIcon(share >= 50 ? "trending-up" : "trending-down")
        .color(share >= 50 ? "success" : "warning"),
    ];
  }
}

/**
 * The number an aggregate answered.
 *
 * `count` never answers null and the port says so, but the type is wider than
 * that one function: a `sum` over no rows is null rather than nought, and a
 * `Decimal` comes back as digits in a string because it would not survive a
 * double. Nothing here is either, and this is what says so rather than
 * assuming it.
 */
function whole(value: AggregateValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}
