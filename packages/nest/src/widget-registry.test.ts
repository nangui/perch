/**
 * What a widget's declaration is held to, and what it is not.
 *
 * Only the declaration. A card's icons and values are refused when they are
 * answered, because a widget's numbers do not exist until somebody asks: there
 * is nothing sitting still at boot for this to read, which is the one way a
 * widget differs from everything else a resource declares.
 */
import { Test } from "@nestjs/testing";
import { Stat } from "@perchjs/core";
import { describe, expect, it } from "vitest";
import type { StatsWidget } from "./widget.js";
import { PanelWidget, widgetMetadata } from "./widget.js";
import type { WidgetClass } from "./widget-registry.js";
import { PANEL_WIDGET_TYPES, WidgetRegistry } from "./widget-registry.js";

@PanelWidget({ name: "sales", sort: 2, columnSpan: 2 })
class Sales implements StatsWidget {
  stats(): readonly Stat[] {
    return [Stat.make("Sales", 42)];
  }
}

@PanelWidget({ name: "visits", sort: 1 })
class Visits implements StatsWidget {
  stats(): readonly Stat[] {
    return [Stat.make("Visits", 7)];
  }
}

@PanelWidget({ name: "unplaced" })
class Unplaced implements StatsWidget {
  stats(): readonly Stat[] {
    return [];
  }
}

async function boot(widgets: readonly WidgetClass[]): Promise<WidgetRegistry> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      WidgetRegistry,
      { provide: PANEL_WIDGET_TYPES, useValue: widgets },
      ...widgets,
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef.get(WidgetRegistry);
}

describe("what the decorator keeps", () => {
  it("keeps the name, and the placement where one was given", () => {
    expect(widgetMetadata(Sales)).toStrictEqual({
      name: "sales",
      sort: 2,
      columnSpan: 2,
    });
  });

  it("keeps no key that was not given", () => {
    // An absent placement is not a zero: the ordering below reads the
    // difference, and a default written in here would be a decision nobody
    // made.
    //
    // Strictly, because `toEqual` passes over a key whose value is undefined
    // and that is exactly the fault here: a decorator keeping `sort:
    // undefined` would have satisfied it.
    expect(widgetMetadata(Unplaced)).toStrictEqual({ name: "unplaced" });
  });

  it("answers nothing for a class that carries none", () => {
    class Bare implements StatsWidget {
      stats(): readonly Stat[] {
        return [];
      }
    }

    expect(widgetMetadata(Bare)).toBeUndefined();
  });
});

describe("what a dashboard gets", () => {
  it("finds one by the name it claimed", async () => {
    const registry = await boot([Sales]);

    expect(registry.get("sales")?.metadata.name).toBe("sales");
    expect(registry.get("nothing")).toBeUndefined();
  });

  it("builds the instance, so it can hold what it needs", async () => {
    // Through the container, which is the whole reason a widget is a class: a
    // widget that cannot inject the service with the figures in it cannot do
    // its job.
    const registry = await boot([Sales]);
    const stats = await registry.get("sales")?.instance.stats();

    expect(stats?.[0]?.state.label).toBe("Sales");
  });

  it("orders by what each asked for, and the unplaced after them", async () => {
    const registry = await boot([Sales, Unplaced, Visits]);

    expect(registry.all().map((one) => one.metadata.name)).toEqual([
      "visits",
      "sales",
      "unplaced",
    ]);
  });
});

describe("what the boot refuses", () => {
  it("refuses a class listed without the decorator", async () => {
    class Forgot {
      stats(): readonly Stat[] {
        return [];
      }
    }

    await expect(boot([Forgot as WidgetClass])).rejects.toThrow(
      /carries no @PanelWidget/,
    );
  });

  it("refuses a name that is not an address", async () => {
    // It is a path segment. A name with a slash or a space in it sits where
    // the panel registered nothing and answers nothing.
    for (const name of ["Sales", "two words", "with/slash", ""]) {
      @PanelWidget({ name })
      class Odd implements StatsWidget {
        stats(): readonly Stat[] {
          return [];
        }
      }

      await expect(boot([Odd])).rejects.toThrow(/which is not an address/);
    }
  });

  it("refuses a span that is not a count of columns", async () => {
    for (const columnSpan of [0, -1, 1.5]) {
      @PanelWidget({ name: "odd", columnSpan })
      class Odd implements StatsWidget {
        stats(): readonly Stat[] {
          return [];
        }
      }

      await expect(boot([Odd])).rejects.toThrow(/number of columns/);
    }
  });

  it("refuses two widgets claiming one name", async () => {
    // One of the two would answer at that address and nothing on the
    // dashboard would say which.
    @PanelWidget({ name: "sales" })
    class Other implements StatsWidget {
      stats(): readonly Stat[] {
        return [];
      }
    }

    await expect(boot([Sales, Other])).rejects.toThrow(/both claim the name "sales"/);
  });

  it("refuses a widget the container cannot build, at boot", async () => {
    // Asked for at boot rather than on the first request, so a missing
    // provider is a panel that will not start instead of a card that 500s
    // under whoever opened the dashboard.
    @PanelWidget({ name: "needy" })
    class Needy implements StatsWidget {
      stats(): readonly Stat[] {
        return [];
      }
    }

    const moduleRef = await Test.createTestingModule({
      providers: [WidgetRegistry, { provide: PANEL_WIDGET_TYPES, useValue: [Needy] }],
    }).compile();

    await expect(moduleRef.init()).rejects.toThrow();
  });
});
