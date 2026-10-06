# ADR 0038 — Who writes the stylesheet

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`) · **Settles:** what ADR 0037 decision 5 left open

## Context

ADR 0037 settled who draws the behaviour and said, in its own decision 5, that how the panel looks was *"the question shadcn/ui is actually the answer to and which no decision has been taken on"*. This is that decision.

What forced it is not a complaint about the look. It is that the appearance was 5 043 lines of hand-written CSS and 217 more of hand-written tokens, and three of its properties were measurable defects nobody could see: a shadow reading a token declared nowhere, a backdrop naming its own ink, and a dark ramp kept seventy lines away from the light one with only a test holding the two level. A stylesheet that size is a thing nobody can hold in their head, and the guards it needed were being written one defect at a time.

ARCH 13 §9 is the constraint everything had to pass: *"CSS variables only — no theming in JavaScript"*, and level two of it, *"a stable class on every structural element, as in Filament, to override without forking"*.

## What verification established

1. **Panda CSS runs at build time and ships no CSS runtime.** Measured on its own output, not taken from its README: `panda cssgen` writes a plain stylesheet, `@layer reset, base, tokens, recipes, utilities` first, every value a custom property. There is a small JavaScript runtime for resolving class strings — about 3.5 kB gzip — and it is the only JavaScript involved.

2. **Its recipes emit stable semantic classes, not utilities.** This is the finding that decided the engine. A slot recipe named `perch-stat` with a `label` slot emits `.perch-stat__label` — which is the name the hand-written sheet already used. So ARCH 13 §9 level two survives the move unchanged, where a utility framework would have replaced `.perch-input` with `flex h-9 w-full rounded-md border` and dissolved it.

3. **Park UI cannot be used, and it was the reason to choose this engine.** Its preset declares `@pandacss/dev: >0.22.0`, which admits the current major, and contributes configuration that major rejects: `Array conditions are not supported in v2`. No compatible release exists. Holding the styling engine a major version back to borrow a palette is the worse trade.

4. **Panda names its own custom properties after their category.** `prefix: { cssVar: "perch" }` gives `--perch-colors-surface`, not `--perch-surface`. Letting it own the properties outright would have renamed all 108 and broken every theme in existence, since a theme is a file that redefines them.

5. **`globalCss` is an escape hatch that resolves that.** The values are declared there under the published names, and each token points at one: `--perch-colors-surface: var(--perch-surface)`. Verified end to end — a theme overriding `--perch-surface` reaches a recipe that reads it.

6. **The cost is a fixed one.** Converting one card moved the bundle from 112.45 kB gzip to 116.00; the engine is ~3.5 kB of that and the card's own recipe is 247 bytes. Moving the 108 tokens after it moved the bundle not at all and the stylesheet from 12.70 kB to 12.65. So the first surface pays for the engine and the rest are nearly free.

7. **The generated helpers do not resolve as Node resolves modules.** They import each other without file extensions. Measured: this holds with `outExtension: "ts"` as well, so there is no setting that avoids it.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Keep writing it by hand** | No tool, no generated code, no concession. | Not kept. Five thousand lines nobody can hold, and a guard per defect found. |
| **B. Tailwind v4** | The most used engine, CSS-first config, modern output. | Not kept. Verification 2: utilities dissolve the stable class every structural element is promised, which is a published contract rather than a preference. |
| **C. Chakra UI v3** | The most complete components. | Not kept, and not close. Its theme is a JavaScript object evaluated at run time, against ARCH 13 §9's first sentence. |
| **D. Panda CSS, Panda's own design** | Build-time CSS, custom properties, recipes that keep the class names. | **Kept.** |
| **E. Panda CSS with Park UI's design** | D, plus a look nobody here has to draw. | Not available. Verification 3. |

## Decision

**1. Panda CSS writes the stylesheet, and `panda.config.ts` is where the design lives.** Every colour, size, radius and shadow is declared there once, with its dark value beside its light one. `tokens.css` is deleted.

**2. The published custom properties do not move.** They are declared through `globalCss` under the names they already had, and the engine's tokens alias them. Verification 4 and 5: the alternative renamed the panel's entire public theming surface to suit a tool, and this costs one indirection instead.

**3. A recipe names its own class, always.** Left to itself the engine invents one. The names it is given are the ones the hand-written sheet used, so a reader overriding `.perch-stat__label` keeps working and the promise in ARCH 13 §9 is kept rather than renegotiated.

**4. Only a token a recipe reads is declared.** The engine emits an alias for each one, and this package already refuses to ship a custom property nothing reads. So the token list in the config is the register of which surfaces have moved, and it grows as they do rather than arriving complete and mostly dead.

**5. `preflight` is off.** The panel resets what it owns, scoped under `.perch-root`. A document-wide reset would be this package deciding how the other half of somebody's page looks.

**6. `@perchjs/ui` resolves modules as a bundler rather than as Node.** Verification 7 leaves no alternative, and the package is bundled at both ends, so it describes it accurately. It is a repository convention bent for one tool and is named here so nobody has to discover it.

**7. Deliberately not here:** the rest of the surfaces. This record covers the engine, the tokens and one card. The widget grid, the controls and the table move one at a time, each measured, because a five-thousand-line rewrite in one commit is a change nobody can review.

## Consequences

- **The dark ramp is written beside the light one.** Forty pairs, one declaration each, and the compiler holds them level: the table's value type is a two-element tuple, so a colour cannot be given a light value and no dark one. Probed by removing one half, which does not compile. Nothing enforced that before — the two blocks were seventy lines apart and parity was a thing somebody noticed or did not.
- **Two ways of writing this coexist until the last surface moves.** The generated sheet is imported first so its layers are declared before anything; the hand-written rules sit in no layer at all, and unlayered beats every layer, so a leftover rule outranks a recipe. That is deliberate while migrating and a hazard afterwards: a surface converted without its old rules deleted will look converted and render from the old ones.
- **Nothing breaks for anybody.** The published property names are unchanged and the class names are unchanged, so there is no upgrade note to write — which is the measure of whether decision 2 was right.
- **The bundle carries a styling runtime it did not before**, ~3.5 kB gzip, on the panel entry and on the library entry both. Removable in principle through source transforms; the installed release does not ship them.
- **The repository has a second generated directory**, ignored by git, formatting and linting, excluded from the dependency cruise, and produced by a `generate` script chained into build, typecheck and lint — which the guard written for the Prisma client already required of any package in this position.

## Reopening rule

**One:** Park UI ships a preset the current Panda major accepts. Then option E exists for the first time, and decision 1's "Panda's own design" is worth re-pricing against a palette somebody else maintains.

**Two:** the panel entry passes 200 kB gzip against the 250 kB budget. Then 3.5 kB of styling runtime is worth attacking rather than accepting, and source transforms — or dropping the runtime for generated class strings — becomes the question.

**Three:** a surface is found rendering from a deleted rule's replacement and the old rule both. Then the coexistence in the second consequence has cost more than it bought, and the remaining surfaces should move in one change rather than in several.

Does not reopen this: that utilities are more popular. Verification 2 is about a contract this project published, not about taste, and the engine chosen keeps it.
