import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { MemoryAdapter } from "./memory.adapter.js";
import { Cities, PersonResource } from "./person.resource.js";

@Module({ providers: [Cities], exports: [Cities] })
export class AppServices {}

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      // Where a create lands. "edit" is the default; "index" sends you back to
      // the table you came from.
      redirectAfterCreate: "index",
      // A real panel passes @perchjs/prisma here.
      dataAdapter: MemoryAdapter,
      // Resources are built by the container, so what they inject has to be
      // visible from here.
      imports: [AppServices],
    }),
  ],
})
export class AppModule {}
