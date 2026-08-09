/**
 * `@perchjs/prisma` — outbound adapter: the IR in, Prisma queries out.
 *
 * It does not read the DMMF. Prisma 7 leaves nothing to read at runtime, so the
 * IR is produced at build time by `@perchjs/prisma-generator` (ADR 0012).
 *
 * May import `@perchjs/core`. May never import `@perchjs/nest` or `@perchjs/ui`:
 * an adapter never imports another adapter (ARCH 12 §1).
 */

// Re-exported so a generated IR file can name its own type without the consumer
// having declared `@perchjs/core`, which they install only transitively.
export type { Ir } from "@perchjs/core";
export type {
  PrismaClientLike,
  PrismaDataAdapterOptions,
  PrismaDelegate,
} from "./prisma-data-adapter.js";
export { delegateName, PrismaDataAdapter } from "./prisma-data-adapter.js";
