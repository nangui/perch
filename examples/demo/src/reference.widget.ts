/**
 * What the dashboard says about the tables the records point at.
 *
 * A second widget rather than two more cards on the first, because the two ask
 * different questions of different models — and because a dashboard with one
 * widget on it demonstrates nothing about the thing that matters here: each of
 * these fetches on its own request, so one of them being slow or broken is one
 * of them being slow or broken.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { AggregateValue, DataAdapter, Stat } from "@perchjs/core";
import { Stat as Card } from "@perchjs/core";
import type { StatsWidget } from "@perchjs/nest";
import { PANEL_DATA_ADAPTER, PanelWidget } from "@perchjs/nest";

@Injectable()
@PanelWidget({ name: "reference", sort: 2, columnSpan: 2 })
export class ReferenceWidget implements StatsWidget {
  readonly #data: DataAdapter;

  constructor(@Inject(PANEL_DATA_ADAPTER) data: DataAdapter) {
    this.#data = data;
  }

  async stats(): Promise<readonly Stat[]> {
    const [species, observers] = await Promise.all([
      this.#data.aggregate({
        model: "Species",
        aggregations: {
          rows: { fn: "count" },
          // A count with a path counts the rows that column is not null on,
          // which is a different question and the one worth asking here.
          pictured: { fn: "count", path: "photoUrl" },
        },
      }),
      this.#data.aggregate({
        model: "Observer",
        aggregations: { rows: { fn: "count" } },
      }),
    ]);

    const listed = whole(species["rows"]);
    const pictured = whole(species["pictured"]);

    return [
      Card.make("Species", listed)
        .icon("tag")
        .description(
          pictured === listed
            ? "all with a photograph"
            : `${String(listed - pictured)} with no photograph`,
        )
        .color(pictured === listed ? "success" : "neutral"),
      Card.make("Observers", whole(observers["rows"])).icon("users"),
    ];
  }
}

/** The number an aggregate answered, where nothing here can be anything else. */
function whole(value: AggregateValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}
