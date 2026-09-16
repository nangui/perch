/**
 * How the panel reaches the database: the client above, and the representation
 * the generator wrote.
 *
 * Three lines, because `PrismaDataAdapter` does the work. The representation is
 * checked into this repository, so this file compiles without a database and
 * without the generator having run.
 */
import { Injectable } from "@nestjs/common";
import { PrismaDataAdapter } from "@perchjs/prisma";
import { IR } from "./generated/ir.js";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class DemoDataAdapter extends PrismaDataAdapter {
  constructor(prisma: PrismaService) {
    super({ client: prisma, ir: IR });
  }
}
