/**
 * `@perchjs/core` — the domain layer.
 *
 * This package imports nothing. Not NestJS, not Prisma, not React, not Express.
 * The boundary is enforced by `.dependency-cruiser.cjs` and blocks CI.
 *
 * To be built here, in order: PRD 02 (schema engine), then the state resolution
 * that milestone A1 exercises.
 */

/** Marks a build as pre-implementation. Replaced by real exports in PRD 02. */
export const PERCH_CORE_STATUS = "pre-implementation" as const;
