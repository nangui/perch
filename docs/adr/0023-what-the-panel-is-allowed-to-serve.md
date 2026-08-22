# ADR 0023 — What the panel is allowed to serve

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`, `@perchjs/nest`)

## Context

ADR 0009 settled that the panel ships as one self-contained bundle: React, the renderer and Radix inlined, no bare specifier surviving the build, hashed filenames and an immutable cache. It measured 90.6 kB gzip against a 250 kB budget and named the lazy chunks that budget was leaving room for — `RichEditor`, `CodeEditor`, `Charts`.

Serving it is `panel-assets.controller.ts`, and its first line says what it is: *the manifest is the allowlist, not a lookup table*. Only a name the manifest carries is served, so there is no path to traverse. The manifest named two things, `panel.js` and `panel.css`, and for as long as the build emitted exactly two files that was the same sentence twice.

The first lazy chunk ends that. `RichEditor` reaches TipTap through a dynamic import, and the build answers with three scripts rather than one: the entry, the editor's chunk, and a shared chunk the entry imports on sight. Two of the three had no name in the manifest, and the allowlist did exactly what it says on the tin — it refused to serve them.

## What verification established

Building the panel with one dynamic import in it:

1. **The editor is 121 kB gzip.** Bundled in, it is half the budget spent on every page that has no editor on it. The split is not an optimisation.
2. **Splitting emits a chunk nobody asked for.** Rolldown lifted shared modules into a third file which the entry imports statically. A build with lazy chunks does not have "one entry plus the lazy ones" — it has an entry and a set.
3. **The manifest hook picked the first script it found.** It matched on the filename pattern, and with three matches the entry it named was whichever came first in the emit order.
4. **An unnamed chunk is a 404 in the middle of a form.** The controller reads the manifest at boot and serves nothing else, so the reader gets a panel that loads and a field that never arrives.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Name every emitted chunk in the manifest** | The allowlist keeps meaning what it says, and the set of files the panel may serve is still written down in one place a human can read. | **Kept.** |
| **B. Serve the whole directory** | Nothing to maintain. | Not kept. It replaces an allowlist with a path, and a path is what the static route must never be handed. The one sentence the controller was written around would be gone. |
| **C. Serve anything matching `panel-*.js`** | No manifest change. | Not kept. A pattern is not an allowlist: it admits any file that lands in the directory with that name, including one left behind by an earlier build. |
| **D. No lazy chunks — bundle it all** | One file, no plumbing. | Not kept. Verification 1: the budget is the decision ADR 0009 made, and this is the split it reserved. |

## Decision

**1. The manifest carries `entries` and `chunks`, and version 3 says so.** `entries` stays what it was — logical name to filename, for the two files the page references by name. `chunks` is everything else the bundle is made of, named by filename alone, because nothing asks for one by name: the entry names them itself, in its own imports.

**2. The entry is found by asking, not by matching.** The build hook takes the chunk that says it is the entry. A pattern that happened to be unambiguous while there was one script is not a rule.

**3. The manifest is still the allowlist.** The controller loads `entries` and `chunks` and serves neither more nor less. Both are content-hashed, both keep the immutable cache header, and a filename with a separator or a climb in it is refused at load.

**4. The chunk list is read after the version check.** A manifest from an older `@perchjs/ui` has no chunks in it, and what that needs said is *reinstall*, not a complaint about a field its version never had.

**5. What the split promises is tested, not assumed.** The budget suite fails if the editor's fingerprints appear in `panel.js`, and fails if no chunk carries it at all. A dynamic import is one word away from a static one, and nothing else would notice.

## Consequences

- **A heavy field is now a normal thing to add.** `CodeEditor` and `Charts` need no plumbing beyond a dynamic import; the manifest grows a line by itself.
- **The two packages move in lockstep, more tightly than before.** A manifest version is a shape, and `@perchjs/nest` refuses to start on one it does not recognise. That was already true and now has a second field to be true about.
- **The build fails rather than the browser.** A build that cannot identify its entry throws in the hook, where the message is read by whoever caused it.
- **The library entry splits too.** `dist/` now holds chunks beside `index.js`. Nothing serves those — they are resolved by whoever imports the package — but `files: ["dist"]` publishes them, which is what makes the library entry work at all.

## Reopening rule

The panel serving something it does not build: an asset from a plugin, a font a theme brings. That is a different question from this one — a second source of files, with a second allowlist — and it would want its own record rather than a wider reading of this one.

Nothing else. In particular, "the manifest is tedious to keep in step" is not a reason: it is generated by the build that emits the files, and the day it stops being generated is the day it stops being true.
