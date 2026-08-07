# ADR 0009 — Panel assets: a second, self-contained bundle

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`, `@perchjs/nest`)

## Context

ADR 0007 settled that `@perchjs/nest` depends on `@perchjs/ui` and serves its `dist/`. It did not say what shape those files take, and three constraints already written down turn out to fix the answer between them:

- **ARCH 13 §8**: "hashed filenames, immutable cache", the user configures neither Vite nor Webpack, main bundle **< 250 KB gzip, measured in CI, blocking**.
- **The exports map of `@perchjs/ui`** names `./dist/index.js` and `./dist/styles.css`. Hashing those breaks every consumer who imports the package as a library — and PRD 11 §3 has a whole plugin kind doing that: a *standalone plugin* "provides a reusable component, with no panel — a field, a column", which is third-party code compiled against `@perchjs/ui`.
- **ADR 0007 §5** restricts `nest` to resolving the root of `@perchjs/ui` and nothing else, so `PanelModule` cannot serve React from anywhere. That restriction is not an intention: `tooling/resolution.test.ts` fails on any other specifier.

The question is therefore not "what would be nice" but "what satisfies all three at once".

## What verification established

Measured against the build as committed, not assumed:

1. **Nothing is bundled today.** `packages/ui/dist/index.js` carries `from "react"`, `from "react/jsx-runtime"` and `from "@radix-ui/…"` in clear. It is a library build with everything external, and serving it to a browser yields a module of bare specifiers no browser can resolve. The delivery promised by ARCH 13 §8 does not currently work.
2. **The React the consumer is asked for is never installed.** `react` and `react-dom` are `peerDependencies` of `@perchjs/ui`, and `@perchjs/nest` declares neither, so installing `@perchjs/nest` leaves both unmet.
3. **A self-contained bundle fits, with room.** Built from a mount entry with React, ReactDOM, Radix and the renderer all inlined: **`panel.js` 285 kB raw, 90.6 kB gzip**; **`panel.css` 30 kB raw, 4.5 kB gzip**. Against the 250 KB gzip budget that is 38% used, before the lazy chunks ARCH 13 §8 reserves for `RichEditor`, `CodeEditor` and `Charts`. No bare specifier survives the build.
4. **`require.resolve("@perchjs/ui")` does not work**, which matters because ADR 0007 §3 permits exactly that and nothing else. The exports map of `@perchjs/ui` carries only `types` and `import`; `createRequire`'s resolver asks for the `require` condition, finds none, and throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. Only `import.meta.resolve` succeeds — so the permitted route works in the ESM build of `@perchjs/nest` and fails in its CommonJS one. ADR 0007 noted that a CommonJS host cannot `require` the renderer; it did not follow that through to resolution.
5. **A declared subpath resolves under both.** With `"./manifest.json": "./dist/manifest.json"` added to the exports map — a plain string target, so it applies to every condition — both `require.resolve("@perchjs/ui/manifest.json")` and `import.meta.resolve` return the file.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. A second, self-contained output** | the library entry keeps its stable names and external React; a separate hashed bundle carries everything the browser needs | **kept** |
| **B. One output, everything bundled** | one build to reason about | rejected: the exports map would have to name a hashed file, so nothing outside the panel could compile against the package — and PRD 11 §3 defines a plugin kind that does exactly that |
| **C. `PanelModule` serves React too** | no bundling, smaller build | rejected: `nest` would have to resolve `react`, which ADR 0007 §5 forbids and a test enforces. Loosening that guard to avoid a bundling step trades a checked boundary for a build convenience |
| **D. An import map in the HTML shell** | the browser resolves the bare specifiers itself | rejected for the same reason as C — the files still have to come from somewhere `nest` may resolve — and it puts the dependency graph of the renderer into the shell, where a version skew is invisible until runtime |

## Decision

**`@perchjs/ui` emits two outputs from one build. The library entry is unchanged. A second entry produces the panel bundle: self-contained, hashed, described by a manifest.**

1. **The library output keeps its names and its externals.** `./dist/index.js`, `./dist/index.d.ts`, `./dist/styles.css`, React external, exports map untouched.
2. **The panel output inlines everything** — React, ReactDOM, Radix, the renderer — and carries a content hash in its filename. It is never named by the exports map: it is data served over HTTP, not a module anyone imports.
3. **`dist/manifest.json` maps logical names to hashed files**, and is the only thing `PanelModule` reads to know what to serve. It is **named by the exports map**, as `"./manifest.json"`, and `PanelModule` resolves it by that name. Two reasons, both measured above: resolving the package root does not work at all from CommonJS, and a declared subpath does. The layout of `dist/` stops being something `nest` has to guess, which is what "the manifest is a versioned public API" (ADR 0007 §4) should have meant from the start.
4. **The manifest carries its own version.** `PanelModule` refuses to start on a version it does not know rather than serving files at random (ADR 0007 §4).
5. **`react` and `react-dom` stay peer dependencies** of the package. They govern the library entry, which is the only one anybody imports. The panel bundle carries its own copy, and the two never meet: one runs in a browser, the other is whatever a library consumer bundles for themselves.
6. **The 250 KB gzip budget becomes a CI check**, per ARCH 13 §8, which calls it blocking.

## Consequences

1. Two outputs means two things to keep working. The manifest is what stops them drifting silently: it names what exists, and a `PanelModule` that cannot find an entry fails at startup rather than serving a 404 to a browser.
2. Publishing `@perchjs/ui` ships both. The panel bundle is dead weight for a library-only consumer, and the reverse for an application that only ever sees the panel. Accepted: one package, one version, and the alternative is a sixth package to publish and version for a packaging problem.
3. **ADR 0007 §3 is narrower than what works, and this record widens it.** It permits "resolving the package root, then reading `dist/` from the filesystem", which measurement shows resolves under ESM only. The permitted set becomes the package root **and `@perchjs/ui/manifest.json`** — no wider, and every other specifier stays refused. `tooling/resolution.test.ts` moves with it, and is the reason this is a correction rather than a loophole: the allowlist is one line, and widening it is a visible edit with tests attached.
4. **ADR 0007's consequence 1 is wrong as written.** It states "installing `@perchjs/nest` installs `@perchjs/ui`, and therefore React and Radix". Radix yes, React no — it is a peer, and it is not installed. The panel bundle is what makes the sentence's intent true, by carrying React rather than requiring it. This record supersedes that sentence; the rest of ADR 0007 stands.
5. A React version bump moves the served bundle, so the panel's React is Perch's choice rather than the host application's. That is the point: the host never renders the panel.

## Reopening rule

**Two, and only two:**

1. **The measured bundle crosses the 250 KB gzip budget** and no lazy-loading split brings it back. The cost of shipping React would then be real rather than theoretical, and options C and D deserve re-reading — together with the guard they would have to loosen.
2. **A second official renderer appears**, which is already the first reopening rule of ADR 0007 and reopens both records together.

Does not reopen this: the duplication of React between the panel bundle and a host application that happens to use React. They never share a page.
