/**
 * One widget's numbers over HTTP.
 *
 * The interesting cases are the refusals, and the shape of a failure. A
 * request per widget is what makes one card's trouble local, so what this has
 * to show is that the trouble stays in that request: the others answer, and
 * the one that failed says 500 rather than taking a dashboard down.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Stat } from "@perchjs/core";
import { Stat as Card } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import { PanelModule } from "./panel.module.js";
import type { StatsWidget } from "./widget.js";
import { PanelWidget } from "./widget.js";

const isAdmin = (user: unknown): boolean =>
  (user as { role?: string } | undefined)?.role === "admin";

@PanelWidget({ name: "visits", sort: 1, columnSpan: 2 })
class Visits implements StatsWidget {
  stats(): readonly Stat[] {
    return [
      Card.make("Visits", 1200)
        .icon("eye")
        .description("12% up")
        .descriptionIcon("trending-up"),
      Card.make("Bounced", null),
    ];
  }
}

/** Only an admin's, so the route can be asked what somebody else gets. */
@PanelWidget({ name: "salaries" })
class Salaries implements StatsWidget {
  readonly can = { viewAny: (user: unknown) => isAdmin(user) };
  stats(): readonly Stat[] {
    return [Card.make("Payroll", 90000).money("EUR")];
  }
}

/**
 * Answers a card with an icon the panel has no drawing for.
 *
 * This one rather than a bad value is what shows the audit is doing the work:
 * an unknown icon serialises perfectly well, so without the refusal the route
 * answers 200 and the renderer finds no drawing — a card with a hole in it and
 * nothing anywhere to say a declaration was ignored.
 */
@PanelWidget({ name: "undrawable" })
class Undrawable implements StatsWidget {
  stats(): readonly Stat[] {
    return [Card.make("Sales", 42).icon("sparkles" as never)];
  }
}

/** Answers a value that cannot be sent, which JSON would also refuse. */
@PanelWidget({ name: "unsendable" })
class Unsendable implements StatsWidget {
  stats(): readonly Stat[] {
    return [Card.make("Sales", 1n as never)];
  }
}

/** Throws, which is the other way one card goes wrong. */
@PanelWidget({ name: "broken" })
class Broken implements StatsWidget {
  stats(): readonly Stat[] {
    throw new Error("the figures service is down");
  }
}

@Injectable()
class HeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    request.user = { role: request.headers["x-role"] ?? "visitor" };
    return true;
  }
}

function assets(): PanelAssets {
  const directory = mkdtempSync(join(tmpdir(), "perch-widget-"));
  writeFileSync(join(directory, "panel-a1b2c3d4.js"), "");
  writeFileSync(join(directory, "panel-e5f6a7b8.css"), "");
  return {
    directory,
    entries: { "panel.js": "panel-a1b2c3d4.js", "panel.css": "panel-e5f6a7b8.css" },
    chunks: [],
  };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        widgets: [Visits, Salaries, Undrawable, Unsendable, Broken],
        guards: [HeaderGuard],
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

const ask = async (
  url: string,
  name: string,
  role = "visitor",
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(`${url}/admin/api/widget/${name}`, {
    headers: { "x-role": role },
  });
  return {
    status: response.status,
    body: await response.json().catch(() => undefined),
  };
};

describe("what a widget answers", () => {
  it("answers its cards, and nothing the panel was not told", async () => {
    const { status, body } = await ask(await serve(), "visits");

    expect(status).toBe(200);
    expect(body).toStrictEqual({
      stats: [
        {
          label: "Visits",
          value: 1200,
          icon: "eye",
          description: "12% up",
          descriptionIcon: "trending-up",
        },
        { label: "Bounced", value: null },
      ],
    });
  });

  it("carries nothing as nothing, which is not a zero", async () => {
    // A card showing 0 states a total nobody worked out, and this is the one
    // place a reader sees it.
    const { body } = await ask(await serve(), "visits");
    const second = (body as { stats: { value: unknown }[] }).stats[1];

    expect(second?.value).toBeNull();
  });
});

describe("who may ask", () => {
  it("answers nothing found for a name no widget claims", async () => {
    expect((await ask(await serve(), "nothing")).status).toBe(404);
  });

  it("answers nothing found to a reader who may not have it", async () => {
    // Not a 403: that tells them a widget exists and what it is called, which
    // is the same leak a listed-but-hidden one would be.
    expect((await ask(await serve(), "salaries")).status).toBe(404);
  });

  it("answers it to the reader who may", async () => {
    const { status, body } = await ask(await serve(), "salaries", "admin");

    expect(status).toBe(200);
    expect((body as { stats: { value: unknown }[] }).stats[0]?.value).toBe(90000);
  });

  it("refuses at the route and not only where a roster is drawn", async () => {
    // The roster is narrowed too, and neither is enough on its own: a roster
    // that omits a widget protects nothing while this route answers.
    const url = await serve();

    expect((await ask(url, "salaries")).status).toBe(404);
    expect((await ask(url, "salaries", "admin")).status).toBe(200);
  });
});

describe("when one card goes wrong", () => {
  it("fails that request and no other", async () => {
    // The whole point of a request per widget. A dashboard asking for four
    // gets three.
    const url = await serve();

    expect((await ask(url, "undrawable")).status).toBe(500);
    expect((await ask(url, "visits")).status).toBe(200);
  });

  it("fails on a card it cannot draw, rather than sending it", async () => {
    // An unknown icon is the case that shows the refusal is load-bearing: it
    // serialises, so without the audit this answers 200 and the renderer draws
    // a card with a hole in it. A bad value would have been caught by
    // `JSON.stringify` anyway, which is why it is not the test for this.
    expect((await ask(await serve(), "undrawable")).status).toBe(500);
  });

  it("fails on a value that cannot be sent, before JSON has to", async () => {
    expect((await ask(await serve(), "unsendable")).status).toBe(500);
  });

  it("fails on a widget that throws, in the same place", async () => {
    const url = await serve();

    expect((await ask(url, "broken")).status).toBe(500);
    expect((await ask(url, "visits")).status).toBe(200);
  });
});
