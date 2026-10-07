/**
 * The roster a dashboard is served with.
 *
 * It is the half of a widget that travels with the page, and the only half:
 * places and addresses, no numbers. What has to be shown is that it says who
 * is on the page, in what order, where each one's figures are — and that it
 * says nothing at all about a widget this reader may not have.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Schema, Stat } from "@perchjs/core";
import { Schema as Tree, Stat as Card, TextInput } from "@perchjs/core";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelAssets } from "./panel-assets.js";
import type { PanelPage as Page } from "./custom-page.js";
import { PanelPage } from "./custom-page.js";
import { PanelModule } from "./panel.module.js";
import type { StatsWidget } from "./widget.js";
import { PanelWidget } from "./widget.js";

const isAdmin = (user: unknown): boolean =>
  (user as { role?: string } | undefined)?.role === "admin";

@PanelWidget({ name: "visits", sort: 1, columnSpan: 2 })
class Visits implements StatsWidget {
  stats(): readonly Stat[] {
    return [Card.make("Visits", 1200)];
  }
}

@PanelWidget({ name: "signups", sort: 2 })
class Signups implements StatsWidget {
  stats(): readonly Stat[] {
    return [Card.make("Signups", 31)];
  }
}

/** Numbered after nothing, so it sorts behind both of the above. */
@PanelWidget({ name: "churn" })
class Churn implements StatsWidget {
  stats(): readonly Stat[] {
    return [Card.make("Churn", "1.5")];
  }
}

@PanelWidget({ name: "salaries", sort: 3 })
class Salaries implements StatsWidget {
  readonly can = { viewAny: (user: unknown) => isAdmin(user) };
  stats(): readonly Stat[] {
    return [Card.make("Payroll", 90000).money("EUR")];
  }
}

/**
 * Names its cards out of order and upside down on purpose.
 *
 * `sort` is declared on the widget, so the order on the page is the widget's
 * and not the order somebody happened to type here. Listed the other way
 * round, this is what says so.
 */
@PanelPage({ path: "dashboard", widgets: ["salaries", "churn", "signups", "visits"] })
class Dashboard implements Page {
  schema(): Schema {
    return Tree.make([]);
  }
}

/** A page with no card at all, which is every page but a dashboard. */
@PanelPage({ path: "settings" })
class Settings implements Page {
  schema(): Schema {
    return Tree.make([TextInput.make("name")]);
  }
  submit(): void {
    // Nothing to do: this page is here to be served, not to be saved.
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
  const directory = mkdtempSync(join(tmpdir(), "perch-roster-"));
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

async function serve(
  widgets: readonly (new (...args: never[]) => StatsWidget)[] = [
    Visits,
    Signups,
    Churn,
    Salaries,
  ],
  pages: readonly (new (...args: never[]) => Page)[] = [Dashboard, Settings],
): Promise<string> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PanelModule.forRoot({
        path: "/admin",
        widgets,
        pages,
        guards: [HeaderGuard],
        assets: assets(),
      }),
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  return await app.getUrl();
}

interface RosterCard {
  readonly name: string;
  readonly href: string;
  readonly columnSpan?: number;
}

/** The page, and the roster off its mount element. */
async function dashboard(
  url: string,
  role = "visitor",
  path = "dashboard",
): Promise<{ html: string; roster: readonly RosterCard[] | undefined }> {
  const response = await fetch(`${url}/admin/${path}`, { headers: { "x-role": role } });
  if (!response.ok) throw new Error(`/${path} answered ${String(response.status)}`);
  const html = await response.text();

  const found = /data-widgets="([^"]*)"/.exec(html);
  return {
    html,
    roster:
      found === null
        ? undefined
        : (JSON.parse(unescaped(found[1] ?? "")) as readonly RosterCard[]),
  };
}

/** The shell escapes an attribute; this is that, backwards. */
function unescaped(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

describe("the roster a dashboard carries", () => {
  it("names the cards, where their figures are, and how wide they ask to be", async () => {
    const { roster } = await dashboard(await serve(), "admin");

    expect(roster).toStrictEqual([
      { name: "visits", href: "/admin/api/widget/visits", columnSpan: 2 },
      { name: "signups", href: "/admin/api/widget/signups" },
      { name: "salaries", href: "/admin/api/widget/salaries" },
      { name: "churn", href: "/admin/api/widget/churn" },
    ]);
  });

  it("orders them as the widgets asked, not as the page listed them", async () => {
    // The page names them backwards. `sort` is on the widget because placement
    // is the widget's business, and this is the assertion that holds it there.
    const { roster } = await dashboard(await serve(), "admin");

    expect(roster?.map((one) => one.name)).toStrictEqual([
      "visits",
      "signups",
      "salaries",
      "churn",
    ]);
  });

  it("carries no sign of a card this reader may not have", async () => {
    const { html, roster } = await dashboard(await serve(), "visitor");

    expect(roster?.map((one) => one.name)).toStrictEqual([
      "visits",
      "signups",
      "churn",
    ]);
    // Not in the roster is not enough: the name must be nowhere on the page.
    // A roster that left it out while the word sat in some other attribute
    // would still have told the reader the widget exists.
    expect(html).not.toContain("salaries");
  });

  it("sends no numbers, only places", async () => {
    // The whole point of the roster. A value here would mean the page waited
    // for an aggregate before it drew anything.
    const { html, roster } = await dashboard(await serve(), "admin");

    expect(roster?.every((one) => !("stats" in one))).toBe(true);
    expect(html).not.toContain("Visits");
    expect(html).not.toContain("1200");
  });

  it("gives addresses that answer", async () => {
    // Built on the server from the request, so a panel under a prefix is a
    // panel whose addresses the browser could not have worked out. Following
    // one is what says they were built right.
    const url = await serve();
    const { roster } = await dashboard(url, "admin");
    const first = roster?.[0];
    expect(first).toBeDefined();

    const response = await fetch(`${url}${first!.href}`, {
      headers: { "x-role": "admin" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      stats: [{ label: "Visits", value: 1200 }],
    });
  });

  it("leaves the attribute off a page that holds no card", async () => {
    // Absent, not empty: the browser draws no grid rather than an empty one.
    const { roster } = await dashboard(await serve(), "admin", "settings");

    expect(roster).toBeUndefined();
  });

  it("leaves it off a page whose every card is refused to this reader", async () => {
    // The same answer as a page that declared none, and deliberately: a grid
    // with nothing in it says a dashboard was meant to be here.
    @PanelPage({ path: "payroll", widgets: ["salaries"] })
    class Payroll implements Page {
      schema(): Schema {
        return Tree.make([]);
      }
    }

    const { roster } = await dashboard(
      await serve([Salaries], [Payroll]),
      "visitor",
      "payroll",
    );

    expect(roster).toBeUndefined();
  });
});

describe("a page with nothing to submit", () => {
  it("says so, so no button is drawn that could only fail", async () => {
    // The save route refuses a page with no `submit`, which is right and is
    // not enough: the client passed the transport unconditionally, so a
    // dashboard drew a Save whose one outcome was a 404 — on the screen a
    // reader meets first.
    const { html } = await dashboard(await serve(), "admin");

    expect(html).toContain('data-saves="false"');
  });

  it("leaves the attribute off a page that does submit", async () => {
    // Absent means savable, which is every form route in the panel. Saying it
    // on all of them would be saying the ordinary case out loud.
    const { html } = await dashboard(await serve(), "admin", "settings");

    expect(html).not.toContain("data-saves");
  });
});

describe("a page that names a widget nothing answers to", () => {
  it("stops the boot rather than drawing a gap", async () => {
    @PanelPage({ path: "typo", widgets: ["vists"] })
    class Typo implements Page {
      schema(): Schema {
        return Tree.make([]);
      }
    }

    await expect(serve([Visits], [Typo])).rejects.toThrow(
      /Typo draws a widget called "vists", which no widget claims/,
    );
  });

  it("says what the names actually are, so the typo is visible", async () => {
    @PanelPage({ path: "typo", widgets: ["signup"] })
    class Typo implements Page {
      schema(): Schema {
        return Tree.make([]);
      }
    }

    await expect(serve([Visits, Signups], [Typo])).rejects.toThrow(/signups, visits/);
  });

  it("says so differently when no widget is registered at all", async () => {
    // A different mistake with the same symptom: the page is right and the
    // module forgot to list anything. A list of names to compare against is
    // no help when the list is empty.
    @PanelPage({ path: "typo", widgets: ["visits"] })
    class Typo implements Page {
      schema(): Schema {
        return Tree.make([]);
      }
    }

    await expect(serve([], [Typo])).rejects.toThrow(
      /No widgets are registered with PanelModule.forRoot/,
    );
  });
});
