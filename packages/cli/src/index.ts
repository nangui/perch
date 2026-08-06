#!/usr/bin/env node
/**
 * `@perchjs/cli` — code generation.
 *
 * The shebang is not decoration: `package.json` declares this file as the
 * `perch` binary, and npm links it without rewriting it. Without the line, the
 * kernel has no interpreter for `perch` and the command fails at exec.
 *
 * To be built here: PRD 10.
 */

export const PERCH_CLI_STATUS = "pre-implementation" as const;
