/**
 * `@perchjs/prisma` — outbound adapter: Prisma DMMF to the intermediate
 * representation, and query execution.
 *
 * May import `@perchjs/core`. May never import `@perchjs/nest` or `@perchjs/ui`:
 * an adapter never imports another adapter (ARCH 12 §1).
 */

export type {
  Dmmf,
  DmmfEnum,
  DmmfField,
  DmmfModel,
  ReadOptions,
} from "./dmmf-reader.js";
export { DmmfContractError, readDmmf, SUPPORTED_PRISMA_RANGE } from "./dmmf-reader.js";
export type {
  PrismaClientLike,
  PrismaDataAdapterOptions,
  PrismaDelegate,
} from "./prisma-data-adapter.js";
export { delegateName, PrismaDataAdapter } from "./prisma-data-adapter.js";
