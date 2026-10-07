/**
 * One widget's numbers, asked for on their own.
 *
 * Not with the page. A dashboard draws its chrome at once and fills in after,
 * so eight cards of heavy aggregates do not hold the whole screen and one of
 * them failing does not answer a dashboard with no dashboard on it.
 *
 * A request per widget is what makes that failure local by construction rather
 * than by a convention somebody has to keep: this answers about one name, so
 * there is no shape in which it could half answer.
 */
import { Controller, Get, Inject, NotFoundException, Param, Req } from "@nestjs/common";
import type { StatNode } from "@perchjs/core";
import { auditStats, describeComplaints, serialiseStats } from "@perchjs/core";
import { mayReach } from "./authorization.js";
import type { UserResolver } from "./user-resolver.js";
import { PANEL_USER_RESOLVER } from "./user-resolver.js";
import { WidgetRegistry } from "./widget-registry.js";

export interface WidgetAnswer {
  readonly stats: readonly StatNode[];
}

@Controller("api/widget/:widget")
export class PanelWidgetController {
  readonly #widgets: WidgetRegistry;
  readonly #users: UserResolver;

  constructor(
    widgets: WidgetRegistry,
    @Inject(PANEL_USER_RESOLVER) users: UserResolver,
  ) {
    this.#widgets = widgets;
    this.#users = users;
  }

  @Get()
  async stats(
    @Param("widget") name: string,
    @Req() request: unknown,
  ): Promise<WidgetAnswer> {
    const widget = this.#widgets.get(name);
    if (widget === undefined) throw new NotFoundException();

    // Asked here and not only where the roster is drawn. A roster that omits
    // a widget is not a protection while this route is still there to be
    // asked: a hidden button never was one either.
    //
    // Nothing found rather than nothing allowed, the way a resource a reader
    // may not list answers: a 403 tells them a widget exists and what it is
    // called.
    const user = this.#users.resolve(request);
    if (!(await mayReach(widget.instance.can, user))) throw new NotFoundException();

    const stats = await widget.instance.stats();

    // Refused here because here is where they exist. A card's icons and values
    // are worked out by this method, so the boot had nothing to read: an icon
    // the panel cannot draw, or a value that cannot be sent, is this card's
    // failure and no other's.
    const complaints = auditStats(stats);
    if (complaints.length > 0) {
      throw new Error(describeComplaints(`Widget "${name}"`, complaints));
    }

    return { stats: serialiseStats(stats) };
  }
}
