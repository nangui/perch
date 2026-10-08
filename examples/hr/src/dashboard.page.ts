/**
 * The panel's front door.
 *
 * A page with a schema and no model behind it, and nothing to submit, which is
 * what makes it a dashboard rather than a form. What it holds is cards, named
 * here by the names they answer at; their figures arrive one request each,
 * after the chrome is up.
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
  widgets: ["headcount", "hours"],
})
export class DashboardPage implements Page {
  schema(): Schema {
    return Tree.make([]);
  }
}
