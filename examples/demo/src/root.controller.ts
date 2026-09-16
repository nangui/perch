/**
 * Sends `/admin` to the first table.
 *
 * The panel has no route of its own at its mount path: every page route names
 * a resource, so the address an application advertises answers 404. This is
 * the application saying which table a visitor lands on, which is a decision
 * only the application can make anyway.
 */
import { Controller, Get, Redirect } from "@nestjs/common";

@Controller("admin")
export class RootController {
  @Get()
  @Redirect("/admin/sightings", 302)
  enter(): void {
    // Nothing to do: the decorator is the whole route.
  }
}
