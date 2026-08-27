# ADR 0025 — What a header may offer

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/ui`)

## Context

PRD 08 §3 lists a header action as v0.1, receiving "none, or 1 record". `Table.headerActions()` has accepted any `Action` since it was written.

The renderer has never drawn more than one. `headerActions()` in `PanelList` filters the list to `action.type === "CreateAction"` and maps that to a link; everything else is mapped to nothing. So a header action of any other kind is declared, audited, serialised, sent — and does not appear. No error, no gap on the page, nothing to notice.

Adding `ActionGroup` made it worth deciding rather than leaving. Grouping is exactly what somebody reaches for when a header has more than one thing in it, which is exactly when they would discover it has none.

## What verification established

1. **The server does not support a recordless run either.** `runAction` loops over the records it was given. A header action on a list page has no selection, so the loop body never executes and the callback never runs. Drawing the button would produce a control that reports "0 records" and did nothing.
2. **The one that works, works because it is a link.** `CreateAction` never asks the server anything: the browser follows an address the client composes from the resource path. That is why it is the only one drawn.
3. **Nothing in the repository declares another.** The example's header carries `CreateAction` alone, and the boot passes.
4. **Making it work is a signature change.** `ActionRun` takes a record. A header action that runs against none needs that parameter to be optional, and every callback ever written to trust it would have to be re-read.

## Options

**Draw them anyway.** A button that reports nothing happened. That is the control-that-does-nothing this codebase spends its boot audits eliminating.

**Leave the silence.** A declaration that compiles, boots and disappears. The fault this project names most often, kept deliberately.

**Make recordless actions work.** The honest end state, and a change to the one signature every author's callback is written against. It wants its own step and its own record.

**Refuse what cannot be drawn, and say why.** The boot names the declaration and the reason. Nothing is lost — nothing was drawn before — and the author finds out at boot rather than by staring at a header.

## Decision

**A header action must be a `CreateAction`. Anything else stops the boot, naming what would have to exist.**

This narrows what `Table.headerActions()` accepts in practice without narrowing its type: the list still holds any action, and the boot is what refuses. Typing it to `CreateAction` would close the door on the recordless work rather than hold it open.

It is a breaking change for a resource that declares one today, and it breaks a boot rather than a page — which is the direction this project prefers, and the reason nothing is lost is that nothing was working.

## Consequences

- **The PRD and the code disagree, and now say so out loud.** PRD 08 lists the capability at v0.1; the panel refuses it. That was already true and invisible; it is now true and loud. The PRD is not amended here — a document that describes an intention is not wrong for describing one.
- **`ActionGroup` in a header is refused with the rest.** A group of things a header cannot draw is a group of nothing.
- **The refusal is by name.** The complaint says which action and what a header offers, so the fix is either to move it to the rows or to build the missing half.
- **The missing half is one signature.** Whoever takes it makes the record optional in `ActionRun`, decides what a guard is asked about when there is no record, and draws the button.

## Reopening rule

Recordless actions arriving: the `ActionRun` signature gaining an optional record, and a route that runs a callback once for a page rather than once per row. Then this refusal is replaced by the thing it was standing in for, and that work carries its own record.

Nothing else. In particular, "a resource wants a header button" is not a reason to draw one that does nothing — it is the reason to build the half that is missing.
