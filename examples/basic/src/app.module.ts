import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";
import { MemoryAdapter } from "./memory.adapter.js";
import { MemoryDisk } from "./memory.disk.js";
import { FilesController } from "./files.controller.js";
import { PluginController } from "./plugin.controller.js";
import { Cities, PersonResource } from "./person.resource.js";

// One instance, two readers: the panel writes to it, the route serves from it.
// Two would mean uploads landing in a `Map` nobody reads back.
const disk = new MemoryDisk();

@Module({
  controllers: [FilesController, PluginController],
  providers: [Cities, { provide: MemoryDisk, useValue: disk }],
  exports: [Cities],
})
export class AppServices {}

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      // Where a create lands. "edit" is the default; "index" sends you back to
      // the table you came from.
      redirectAfterCreate: "index",
      // The browser half of a field this framework does not ship. Served by
      // this application, at an address the panel only puts in a script tag.
      scripts: ["/plugin/stars.js"],
      // A real panel passes @perchjs/prisma here.
      dataAdapter: MemoryAdapter,
      // A real panel passes an S3 or filesystem adapter. The name is what a
      // `FileUpload` picks by, and one nothing provides stops the boot.
      disks: { default: disk },
      // Resources are built by the container, so what they inject has to be
      // visible from here.
      imports: [AppServices],
    }),
  ],
})
export class AppModule {}
