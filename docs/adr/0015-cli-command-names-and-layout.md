# ADR 0015 — What the CLI commands are called, and where they write

**Status:** accepted · **Scope:** Perch (`@perchjs/cli`)

## Context

PRD 10 §2.1 names five commands and one directory:

```bash
npx perch init          #  → src/panel/panel.module.ts, registered in AppModule
npx perch resource User #  → src/panel/resources/user.resource.ts, registered in the module
npx perch page Settings
npx perch field StarRating
npx perch doctor
```

Two of them are built. `perch resource` writes to **`src/admin/resources/`**, not `src/panel/resources/`, and it registers nothing. `perch doctor` matches its specification. The third to be built wires the panel, and it is the one the document calls `init`.

So the divergence exists already, in shipped code, decided in conversation and written down nowhere. This record is what fixes it in one place instead of leaving each command to answer separately.

## What the divergence actually is

1. **`init` names a moment, not a subject.** Every other command names what it produces — `resource`, `page`, `field`, and `doctor` names what it does. `init` names when you run it, and implies once. The command creates a module, an adapter and a registration; re-running it after adding a data adapter, changing the path, or losing the file is ordinary, and a command called `init` reads as refusing that.

2. **`src/panel/` collides with nothing but reads as ours.** The panel answers at `/admin` in PRD 04 §2, in every example in this repository and in the generated `path: "/admin"`. A developer opening `src/` sees `admin/` and knows what URL it serves. `panel/` is the framework's word for it, not the application's.

3. **`resource` already went to `src/admin/`.** Whatever this record decides, one of the two has to move. Changing the smaller, unreleased surface is cheaper than changing the one a user has already run — and neither is released yet, which is why this is worth settling now rather than at 1.0.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Follow PRD 10 exactly** | the code matches the document with no record needed | rejected: `perch resource` moves to `src/panel/resources/`, and the objections in points 1 and 2 stand unanswered. Matching a draft is not a reason on its own |
| **B. `perch panel`, `src/admin/`** | one word per subject, and a directory named after the URL it serves | **kept** |
| **C. Keep both spellings as aliases** | nobody is wrong | rejected: two names for one command is two things to document, two to test, and a question — *which is the real one?* — asked by every reader forever |

## Decision

**The command is `perch panel`. Everything the CLI generates lives under `src/admin/`.**

1. **`perch panel` wires a panel**, as `perch resource` writes a resource. It may be run more than once; what it would overwrite it refuses to overwrite, in the way `perch resource` already does.

2. **`src/admin/` is the generated root.** `src/admin/admin.module.ts` for the module, `src/admin/resources/` for resources — where they already are. The directory is named after the URL the panel answers at, which is what a reader of `src/` is trying to work out.

3. **PRD 10 is not edited.** It is the design document; this is the record of the code diverging from it, which is what an ADR is for. A reader who finds `perch init` in PRD 10 §2.1 finds this record from `docs/adr/README.md`.

4. **The mitigation PRD 10 §7 states is kept as stated.** That table's row — *`perch init` edits user code and breaks something → dry run by default with the diff shown, confirmation before writing* — describes the command this record renames, so it binds `perch panel`: it prints the diff and writes nothing until told to. Renaming a command does not release it from what was decided about it.

## Consequences

1. **`perch page` and `perch field` inherit this.** When they arrive they write under `src/admin/`, and neither needs to reopen the question.

2. **A resource is still not registered in the module.** PRD 10 §2.1 says `perch resource` registers what it writes; it does not. Until now there was no module to register it in, so the gap was invisible. It becomes visible with this command and is not closed by it — `perch panel` writes a module with an empty `resources: []`, and a generated resource has to be added by hand.

3. **The documentation that gets written will say `perch panel`.** No README or example names `perch init` today, so nothing has to be corrected; the cost is entirely in the future, and it is a line in a table.

4. **If somebody has `src/panel/`, nothing breaks.** Nothing in the framework resolves either directory: resources are registered explicitly, by class. The layout is a convention for a human reading `src/`, and a developer who moves the files loses nothing.

## Reopening rule

**One:** the discovery-by-folder-scan that `PanelModuleOptions.resources` calls *"registered explicitly; discovery by folder scan comes later"* is built. A scan makes the directory load-bearing rather than conventional, and a load-bearing path is worth naming deliberately rather than inheriting.

Does not reopen this: preferring the other word. Both are defensible, one had to be chosen, and consistency is worth more than the margin between them.
