/**
 * `@perchjs/prisma-generator` — the IR, produced at build time.
 *
 * Prisma 7 strips the runtime DMMF down to names and types, so the metadata the
 * IR is made of only exists while `prisma generate` runs. This package is what
 * runs then (ADR 0012).
 *
 * May import `@perchjs/core`. It is not an adapter: nothing at runtime depends
 * on it, and it depends on no adapter.
 */

export type {
  Dmmf,
  DmmfEnum,
  DmmfField,
  DmmfModel,
  ReadOptions,
} from "./dmmf-reader.js";
export { DmmfContractError, readDmmf, SUPPORTED_PRISMA_RANGE } from "./dmmf-reader.js";
export { emitIr } from "./emit.js";
