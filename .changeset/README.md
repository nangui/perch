# Changesets

Each pending release note is one Markdown file in this folder, written by whoever
made the change. `pnpm changeset` creates one interactively.

Two things here differ from a default Changesets setup, both required by
[ADR 0008](../docs/adr/0008-versioning-policy.md):

- **`fixed` covers `@perchjs/*`.** The five packages always carry the same
  version and are published together, including those unchanged in that release.
  So the bump you pick in a changeset applies to all five, whichever package you
  name.
- **`changelog` is `false`.** Changesets would otherwise write one CHANGELOG per
  package — five files describing the same release. `scripts/changelog.mjs`
  folds the pending changesets into the single root `CHANGELOG.md` instead, and
  `pnpm release:version` runs it before the bump.

**Before 1.0, minor is breaking.** npm reads `^0.2.3` as `>=0.2.3 <0.3.0`, so the
v0.1 → v0.2 → v0.3 tiers of PRD 00 §6 land on minors. Pick `patch` for a fix and
`minor` for a breaking change; `major` is for 1.0 and after.
