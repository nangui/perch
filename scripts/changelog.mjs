/**
 * Folds the pending changesets into the root CHANGELOG.md.
 *
 * ADR 0008 §4 wants one changelog at the root; Changesets writes one per package,
 * so `changelog` is `false` in its config and this runs in its place. It must run
 * *before* `changeset version`, which consumes the changeset files — hence the
 * order in `release:version`.
 *
 * The version comes from `changeset status` rather than being computed here.
 * Under the `fixed` group a bump on one package bumps all six, and reproducing
 * that rule would mean owning a copy of it that can drift.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CHANGELOG = "CHANGELOG.md";
const HEADER = `# Changelog

All notable changes to Perch. The six \`@perchjs/*\` packages share this file and
this version number — they are released together ([ADR 0008](docs/adr/0008-versioning-policy.md)).
`;

/**
 * `changeset status` exits 1 when packages changed with no changeset to cover
 * them, which is the ordinary "nothing to release yet" case rather than a
 * failure. Counting the pending files first keeps that case out of the error
 * path — and stops a Node stack trace standing in for a sentence.
 */
function pending() {
  return readdirSync(".changeset").filter(
    (name) => name.endsWith(".md") && name !== "README.md",
  );
}

function status() {
  const file = join(mkdtempSync(join(tmpdir(), "perch-release-")), "status.json");
  try {
    execFileSync("pnpm", ["exec", "changeset", "status", `--output=${file}`], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  } catch {
    process.exit(1); // changeset has already said why on stderr.
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

/** ADR 0008 §2: before 1.0, a minor is a breaking change, deliberately. */
function heading(type, version) {
  if (type === "patch") return "Fixed";
  if (type === "major") return "Breaking";
  return version.startsWith("0.") ? "Breaking" : "Added";
}

if (pending().length === 0) {
  console.log("No pending changesets — the changelog is unchanged.");
  process.exit(0);
}

const { changesets, releases } = status();
if (releases.length === 0) {
  // `changeset add --empty` records that a change needs no release. There is a
  // file pending and still nothing to write.
  console.log("Only empty changesets — the changelog is unchanged.");
  process.exit(0);
}

const version = releases[0].newVersion;
const sections = new Map();

for (const changeset of changesets) {
  // The packages the author named, not the six the fixed group expands to.
  const named = changeset.releases.map((r) => r.name.replace("@perchjs/", ""));
  const type = changeset.releases.reduce(
    (worst, r) => (rank(r.type) > rank(worst) ? r.type : worst),
    "patch",
  );
  const section = heading(type, version);
  const scope =
    named.length > 0 && named.length < 5 ? `**${named.join(", ")}** — ` : "";
  const summary = changeset.summary.trim().replace(/\n+/g, " ");
  sections.set(section, [...(sections.get(section) ?? []), `- ${scope}${summary}`]);
}

function rank(type) {
  return { patch: 0, minor: 1, major: 2 }[type] ?? 0;
}

const date = new Date().toISOString().slice(0, 10);
const body = ["Breaking", "Added", "Fixed"]
  .filter((s) => sections.has(s))
  .map((s) => `### ${s}\n\n${sections.get(s).join("\n")}`)
  .join("\n\n");

const entry = `## ${version} — ${date}\n\n${body}\n`;

// Split on the first release heading rather than on the header's length, so a
// hand-edited preamble does not silently get sliced off.
const existing = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, "utf8") : "";
const start = existing.indexOf("\n## ");
const previous = start === -1 ? "" : existing.slice(start + 1);

writeFileSync(
  CHANGELOG,
  `${HEADER}\n${entry}${previous === "" ? "" : `\n${previous}`}`,
);
console.log(`CHANGELOG.md: added ${version} (${changesets.length} changeset(s)).`);
