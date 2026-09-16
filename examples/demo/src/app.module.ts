/**
 * The demo, wired the way any application wires Perch.
 *
 * Nothing here is demo-specific except the seed: a module, the panel mounted
 * under a path, the four resources, and an adapter the container builds.
 */
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { DemoDataAdapter } from "./adapter.js";
import { ImagesController } from "./images.controller.js";
import { PrismaModule } from "./prisma.module.js";
import { RootController } from "./root.controller.js";
import { ObserversResource } from "./observers.resource.js";
import { Seed } from "./seed.js";
import { SightingsResource } from "./sightings.resource.js";
import { SitesResource } from "./sites.resource.js";
import { SpeciesResource } from "./species.resource.js";

@Module({
  imports: [
    PrismaModule,
    PanelModule.forRoot({
      path: "/admin",
      resources: [SightingsResource, SpeciesResource, ObserversResource, SitesResource],
      dataAdapter: DemoDataAdapter,
      // What the panel's own container may inject: the adapter needs the client.
      imports: [PrismaModule],
      // Records first: the reference tables are what it points at.
      navigationGroups: ["Records", "Reference"],
    }),
  ],
  controllers: [ImagesController, RootController],
  providers: [Seed],
})
export class AppModule {}
