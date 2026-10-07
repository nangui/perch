/**
 * The demo, wired the way any application wires Perch.
 *
 * Nothing here is demo-specific except the seed: a module, the panel mounted
 * under a path, the four resources, and an adapter the container builds.
 */
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { DemoDataAdapter } from "./adapter.js";
import { DashboardPage } from "./dashboard.page.js";
import { ImagesController } from "./images.controller.js";
import { PrismaModule } from "./prisma.module.js";
import { ObserversResource } from "./observers.resource.js";
import { ReferenceWidget } from "./reference.widget.js";
import { Seed } from "./seed.js";
import { SightingsResource } from "./sightings.resource.js";
import { SightingsWidget } from "./sightings.widget.js";
import { SitesResource } from "./sites.resource.js";
import { SpeciesResource } from "./species.resource.js";
import { QueryUserResolver } from "./who.js";

@Module({
  imports: [
    PrismaModule,
    PanelModule.forRoot({
      path: "/admin",
      resources: [SightingsResource, SpeciesResource, ObserversResource, SitesResource],
      // The front door, and the cards it holds. The page names them and the
      // boot checks that the names are ones these widgets answer to.
      pages: [DashboardPage],
      widgets: [SightingsWidget, ReferenceWidget],
      dataAdapter: DemoDataAdapter,
      userResolver: QueryUserResolver,
      // What the panel's own container may inject: the adapter needs the client.
      imports: [PrismaModule],
      // Records first: the reference tables are what it points at.
      navigationGroups: ["Records", "Reference"],
    }),
  ],
  controllers: [ImagesController],
  providers: [Seed],
})
export class AppModule {}
