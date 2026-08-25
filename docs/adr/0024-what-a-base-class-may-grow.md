# ADR 0024 — What a base class may grow

**Status:** accepted · **Scope:** Perch (`@perchjs/core`)

## Context

`Component` is the base of every field, layout, entry and prime, and its fluent methods are the vocabulary a resource is written in: `.label()`, `.helperText()`, `.visible()`, `.columnSpan()`. ADR 0007 settled that a plugin declares a field by extending `Field` and registering a renderer for its type. That is the whole extension model — a subclass, and a name in the registry.

The two facts meet badly. A plugin's field is a subclass of a class we keep adding to, and the names it chose were free when it chose them.

Adding `.hint()` to `Component` collided with a fixture in this repository that had declared its own `hint()`. The collision was caught, but only because the fixture lives here. What made it worth writing down is what the collision would have done outside.

## What verification established

The fixture is a custom field holding a prop deliberately valued with a function, to prove the serialiser refuses to put one on the wire. Its `hint()` stored that function; the boundary test asserted it never crossed.

1. **The subclass wins, silently.** A method declared on a subclass overrides the base. TypeScript refuses the two only when their signatures disagree — and `hint(value: () => string)` against `hint(value: Resolvable<string>)` disagrees, so this one was refused at compile time.
2. **A signature that agrees would not have been.** `Resolvable<string>` already admits a function. A plugin whose `hint()` took a string, or took a resolver, compiles clean against the new base.
3. **What changes then is the meaning, not the type.** The base resolves `state.hint` and ships the result. A plugin that stored something else under that key finds it resolved and serialised — a value it never intended to be read, on the wire, with nothing failing.
4. **The renderer keeps working.** A custom renderer draws what it drew. The new prop arrives beside it and is drawn by the shell as well, so the page grows a word nobody asked for rather than losing one.

## Options

**Namespace every new base method.** `.perchHint()`. Ugly at the call site, which is the surface this project is judged on, and it buys nothing a plugin author could not also have chosen.

**Freeze `Component`.** Cross-cutting options go on an interface a field opts into. It moves the collision rather than removing it, and it costs every field a declaration to gain a label.

**Reserve a prefix for plugins.** A rule nothing enforces is a rule that holds until somebody is in a hurry.

**Add to the base, and treat the surface as versioned.** The base's method list is part of the published interface. Growing it is a change plugins can be broken by, so it belongs in the release notes rather than in a silent minor.

## Decision

**`Component` may grow, and each new method on it is a breaking change for plugins.**

A new fluent method on `Component`, `Field`, `Layout` or `Entry` is recorded in the release notes as such, with the name it takes. Plugin authors get a list to check against rather than a surprise.

The alternative was making every cross-cutting option opt-in, and that is a worse framework: `.label()` on every field is the thing this project exists to give, and a subclass that has to ask for it is a subclass that will forget.

## Consequences

- **Names on the base are scarce.** A method that is really about one field goes on that field. `.prefix()` is on `TextInput` and not on `Component`, because an affix is a thing that sits beside a line of text and there is no left-hand side of a checkbox.
- **A collision is loudest when the signatures differ.** Nothing can be done about the case where they agree; what can be done is to keep base methods narrowly typed, so a plugin storing something else under the name fails to compile rather than quietly shipping it.
- **The fixture was renamed rather than the method.** `custom-component.test.ts` now calls its prop `explain`. It tests the same thing, and it no longer answers for a name the base owns.
- **This is not a reason to stop adding to the base.** Six of PRD 06's cross-cutting options are still unbuilt, and they belong where the others are.

## Reopening rule

A plugin ecosystem large enough that a breaking change to `Component` is expensive to coordinate. Then the question is a real one — a stable base with an opt-in surface beside it — and it wants its own record with the ecosystem's size as evidence.

Nothing else. In particular, one more collision inside this repository is not evidence: a fixture is not a plugin, and renaming it costs a line.
