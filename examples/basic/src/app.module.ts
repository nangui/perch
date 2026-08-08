import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { Cities, PersonResource } from "./person.resource.js";

@Module({ providers: [Cities], exports: [Cities] })
export class AppServices {}

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      // Resources are built by the container, so what they inject has to be
      // visible from here.
      imports: [AppServices],
    }),
  ],
})
export class AppModule {}
