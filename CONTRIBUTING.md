# Contributing to Perch

Thanks for your interest in the project. This document says how to contribute usefully, and
above all what is not up for discussion.

Perch is **pre-implementation**: the documentation is complete and frozen, the code does not
exist yet. The most useful contribution today is to the documentation — a contradiction spotted,
a case left uncovered, a missing technical pre-condition.

## Before opening an issue or a pull request

1. Read the [structural decisions](docs/adr/) — eight records, six of them accepted.
2. Read the document concerned. [`docs/README.md`](docs/README.md) gives the reading order.
3. Check that what you are proposing is not listed as **out of scope** in the relevant PRD. Out
   of scope is as binding as in scope: it is what stops the drift toward a CMS.

## Closed decisions

Every ADR carries a **reopening rule**: the condition — and the only one — that would reopen the
debate. If it is not met, the matter is closed. A personal preference is not a reopening rule.

**The project name is a closed decision.** It is recorded in [ADR 0004](docs/adr/0004-nommage.md),
with the full reasoning and the post-mortem of the rejected candidate. **It is not re-argued in
issues or pull requests.** Renaming proposals are closed without debate, with a link to that ADR.

An ADR is never edited. A decision that changes produces a **new** ADR superseding the old one.

Use of the name and logo is governed by [`TRADEMARK.md`](TRADEMARK.md).

## Languages

**English, everywhere** — documentation, code, comments, symbol names, commit messages.

Documentation may be drafted in any language. What ships in the repository is English, because
the repository is the publication: an ADR answers "why is it like this", and that answer is
useless to a contributor who cannot read it.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), in English, imperative, no trailing
full stop.

```
<type>(<scope>): <description>
```

Types: `feat` `fix` `docs` `chore` `refactor` `test` `build` `ci` `style` `revert`
Scopes: `core` `prisma` `nest` `ui` `cli` `docs` `repo`

- The subject line is **72 characters maximum**.
- **One commit = one logical change.** No catch-all commits.
- A body when the *why* is not obvious. It explains the why, not the how.

```
feat(core): resolve dependent select options on the server
docs(adr): record the state protocol decision
```

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By taking part, you agree to
uphold it.

## License

By contributing, you agree that your contribution is published under the project's
[MIT license](LICENSE).
