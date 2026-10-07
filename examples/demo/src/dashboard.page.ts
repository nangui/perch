/**
 * The panel's front door.
 *
 * A page with a schema and no model behind it, like a settings screen — and
 * with nothing to submit, which is what makes it a dashboard rather than a
 * form. What it holds is cards, named here by the names they answer at.
 *
 * Nothing about their numbers travels with this page. The roster does: which
 * cards, in what order, and where each one's figures are. They arrive one
 * request each, after the chrome is up.
 *
 * No `navigationGroup`, so it sits above the groups rather than inside one,
 * and `/admin` lands here: the panel's own address sends a reader to the first
 * thing the menu offers them.
 */
import { Injectable } from "@nestjs/common";
import type { Schema } from "@perchjs/core";
import { Schema as Tree } from "@perchjs/core";
import type { PanelPage as Page } from "@perchjs/nest";
import { PanelPage } from "@perchjs/nest";

@Injectable()
@PanelPage({
  path: "dashboard",
  label: "Dashboard",
  navigationSort: 0,
  icon: "star",
  widgets: ["sightings", "reference"],
})
export class DashboardPage implements Page {
  /**
   * Nothing, and that is the page.
   *
   * A dashboard is its cards. The schema is here because every page has one,
   * and an empty tree is the honest answer for a screen with no fields on it
   * rather than a field invented to fill the method in.
   */
  schema(): Schema {
    return Tree.make([]);
  }
}
