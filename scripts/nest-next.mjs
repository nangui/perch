/**
 * Points every `@nestjs/*` package at one major, for the leg of CI that proves
 * the other half of the peer range.
 *
 * The lockfile holds one major, and it has to: it is the tree a release is built
 * from. So the second leg cannot come from the lockfile — it writes an override,
 * resolves it, and proves what the manifests advertise rather than what they
 * were developed against.
 *
 * A script rather than a line in the workflow. `pnpm pkg set` cannot write these
 * keys: the version this repository pins does not read a bracketed path, so it
 * writes a key with the quotes still in it and the install then fails on a
 * selector nobody typed. Found by running it.
 */
import { readFileSync, writeFileSync } from "node:fs";

/** The four this repository takes from NestJS. Adding a fifth is a visible edit. */
const PACKAGES = [
  "@nestjs/common",
  "@nestjs/core",
  "@nestjs/platform-express",
  "@nestjs/testing",
];

const major = process.argv[2];
if (!/^\d+$/.test(major ?? "")) {
  process.stderr.write("nest-next: give it a major, as a number.\n");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
manifest.pnpm = {
  ...manifest.pnpm,
  overrides: {
    ...manifest.pnpm?.overrides,
    ...Object.fromEntries(PACKAGES.map((name) => [name, major])),
  },
};
writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Overriding ${PACKAGES.join(", ")} to ${major}.\n`);
