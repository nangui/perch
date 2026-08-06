/**
 * `@perchjs/prisma` — outbound adapter: Prisma DMMF to intermediate
 * representation, and query execution.
 *
 * May import `@perchjs/core`. May never import `@perchjs/nest` or
 * `@perchjs/ui`: an adapter never imports another adapter (ARCH 12 §1).
 *
 * To be built here first: PRD 01. It is mechanical and unblocks everything else.
 */

export const PERCH_PRISMA_STATUS = "pre-implementation" as const;
