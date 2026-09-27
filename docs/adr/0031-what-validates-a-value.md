# ADR 0031 — What validates a value

**Status:** accepted · **Scope:** `@perchjs/core`

*Corrects the engine named in [PRD 02](../02-PRD-schema-engine.md) §5 and in the pipeline and cache tables of [ARCH 12](../12-ARCH-backend.md).*

## Context

PRD 02 names Zod as the validation engine, "generated from the component tree". ARCH 12 repeats it twice: stage 7 of the pipeline is "Zod compiled from the tree, visible fields only", and the bootstrap cache holds "base Zod schemas".

Nothing in the tree depends on Zod. Validation was built without it, and has been shipped in two releases. The standing context file has carried the contradiction as an open question since it was noticed, with an instruction not to settle it in passing, because there are two ways to make the documents true and they are not the same project.

The question became worth answering now rather than later for a reason outside the tree: NestJS 12 makes Standard Schema first class, which puts a third answer on the table that did not exist when PRD 02 was written.

## What verification established

1. **Three mentions, in two documents, and nowhere else.** Not in an ADR, not in the guide, not in a manifest. Nothing was built on the claim.
2. **`@perchjs/core` has no dependencies at all.** Zod would be its first, in the one package whose whole discipline is that the arrows point inward.
3. **It would not be a bundle cost.** The domain never reaches the browser: every import `@perchjs/ui` makes from it is `import type`, and the published panel bundle contains no reference to it. The panel is at 122 KB gzip against a 250 KB budget, and this would not touch that number. What it would cost is install weight on a server.
4. **What was built meets what PRD 02 asked for, by another route.** The document wanted Zod because it "composes dynamically at runtime", which visibility-conditioned validation needs. The engine composes nothing: it walks the already-resolved tree, checks the visible nodes, and keys errors by node path so one declaration inside a repeater reports per row. A rule is a callable that receives the request's context and can read any other path, the record and the operation. That is more than a static schema does, not less.
5. **Standard Schema is a shape, not a package.** A schema says it conforms by carrying a `~standard` property. Reading one needs a type, and a type can be spelled locally. Zod, Valibot and ArkType all carry it.
6. **NestJS 12's own support does not apply here.** Its `StandardSchemaValidationPipe` validates a route parameter or a body on the way into a handler. Stage 5 judges the state map itself, against the schema tree, and never sees a DTO. The news makes the vocabulary current; it does not offer this project a mechanism.

## Options

**A. Adopt Zod.** The documents become true. The engine is rebuilt around a schema compiled per request, which the cache table already anticipated, and the context-carrying rules become closures inside `superRefine` — which is what the callable already is. Buys nothing the framework needs, and costs the domain its first dependency.

**B. Correct the documents.** They describe what exists. Three lines, and a record saying why.

**C. B, and accept a Standard Schema where a rule is taken.** The reader who already has a schema passes it. No dependency, because the shape is the contract.

## Decision

**1. The engine is the one that exists, and the documents move.** A rule is a callable carrying the request's context, evaluated over the resolved tree. PRD 02 §5 and both ARCH 12 tables are corrected to say so. The reason PRD 02 gave for Zod is not withdrawn: dynamic composition was the requirement, and it is met.

**2. `.rule()` and `.rules()` also take a Standard Schema.** Anything carrying `~standard` is read as a check. It becomes a rule with no kind, for the reason a function passed there has none: whoever wrote it wrote the words, and `validationMessages` has nothing to override.

**3. A schema is read as an answer, never as a replacement.** Issues present is a refusal and the first one's message is shown; a refusal carrying no message at all is still a refusal, with words of ours. What a schema returns as its output is dropped. Transforming a value is what `formatStateUsing` is for, and a check that quietly rewrote what it checked would be a rule that edits the row.

**4. Nothing is depended on for it.** The property and the outcome are spelled in `field.ts`, narrower than the specification: what is read, and nothing else.

## Consequences

The domain keeps its empty dependency list, which is the property the boundary test exists to protect.

A reader who wants Zod has it, in the place where it is worth having: their own rules, not our engine. They install it; we do not.

The contract is proved twice. Once against schemas spelled out by hand, which is the specification read back, and once against Zod, which did not help write that reading. Zod is a dev dependency of the domain and of the tooling, and of nothing that ships: it is what the interoperability test runs and what the guide's example compiles against. A hand-written conformer agrees with whoever wrote it, and that is not evidence; the second suite is there because the first one is not.

An unmet expectation is now possible that was not before: a schema that transforms looks like it works and silently does not change what is saved. Decision 3 makes that explicit, and the guide says it where somebody would do it.

## Reopening rule

**One:** the framework itself needs to hand a schema to somebody else — a client that validates before sending, a write validated in one call rather than per field. Then a builder is a thing we need rather than a thing we accept, and A returns as a real option.

**Two:** the specification reaches a version this type cannot read. Then the spelled shape moves with it, which is a line, and this record stands.

Does not reopen it: preferring Zod's ergonomics for writing a rule. That is what decision 2 is for.
