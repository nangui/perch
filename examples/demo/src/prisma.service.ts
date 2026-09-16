/**
 * The application's own Prisma client, which the panel borrows.
 *
 * Perch never opens a connection, never owns a pool and never sees the
 * credentials: it is handed a client that already exists. This is that client,
 * and it is the ordinary Nest shape for one.
 */
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "./generated/client/index.js";

function url(): string {
  const given = process.env["DATABASE_URL"];
  if (given === undefined || given === "") {
    throw new Error(
      "DATABASE_URL is not set. The demo is a real Perch application: it needs " +
        "the PostgreSQL it was generated against.",
    );
  }
  return given;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly #pool: Pool;

  constructor() {
    const pool = new Pool({ connectionString: url() });
    super({ adapter: new PrismaPg(pool) });
    this.#pool = pool;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.#pool.end();
  }
}
