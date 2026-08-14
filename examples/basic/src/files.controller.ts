/**
 * Serves what `MemoryDisk.url()` points at.
 *
 * The panel resolves a stored key to an address and hands it to the browser; who
 * answers at that address is the host's business. A real deployment points at a
 * bucket or a static folder and writes none of this.
 *
 * It asks nobody who is calling, which is fine for three rows in a `Map` and is
 * not a pattern to copy: an attachment is as private as the row that points at
 * it, and serving one is a place authorization belongs.
 */
import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  StreamableFile,
} from "@nestjs/common";
import { MemoryDisk } from "./memory.disk.js";

@Controller("files")
export class FilesController {
  readonly #disk: MemoryDisk;

  constructor(disk: MemoryDisk) {
    this.#disk = disk;
  }

  @Get("*key")
  @Header("Cache-Control", "no-store")
  serve(@Param("key") key: string | string[]): StreamableFile {
    const path = Array.isArray(key) ? key.join("/") : key;
    const kept = this.#disk.read(path);
    if (kept === undefined) throw new NotFoundException();
    // The type the upload arrived with, not one guessed from the extension: the
    // route already refused anything the field did not accept.
    return new StreamableFile(Buffer.from(kept.bytes), { type: kept.type });
  }
}
