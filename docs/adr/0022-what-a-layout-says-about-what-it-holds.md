# ADR 0022 — What a layout says about what it holds

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/ui`)

## Context

Two of the eight invariants are about a field nobody can see. Invariant 4: every piece of client state is replayed against the schema tree, and an unknown path, or one belonging to a field that is invisible, disabled or read-only, is discarded **silently**. Invariant 5: an invisible field is never validated nor persisted.

Both are written about a field. Neither says what happens to a field that is itself perfectly visible and sits inside a section that is not.

Every layout has carried `.visible()` and `.disabled()` since the first one, because both live on `Component` and a layout is a component. So the declaration has always been available, and what it meant for the fields underneath had never been decided.

## What verification established

Measured against a form holding one field inside a `.hidden()` section, before any change:

1. **The payload was already right.** It is built by walking the tree, so an invisible parent takes its whole subtree with it. An honest browser never learned the field existed.
2. **Admission accepted it.** `sanitize` reads each node's own flags from the flat node list, which has no ancestry in it. A forged state naming the field's path was admitted.
3. **The write took it.** `dehydrate` asks the same per-node question, so the value reached the database.
4. **Validation ran on it.** The prune-and-validate steps filter on `n.visible`, one node at a time.
5. **Resolution runs children first.** `resolveNode` resolves a node's children before the node itself, so a parent's answer does not exist when its children are computed.
6. **A pass reuses nodes.** A node whose traced reads do not intersect the changed paths is carried from the previous round trip verbatim.

1 and 2 together are the finding: **invisible to everyone who plays by the rules, and writable by anyone who types the path.** That is the worst shape a trust boundary takes, because nothing on the honest path can reveal it.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Inherit the flags down the tree** — a node's effective flags fold in every ancestor's | One rule, applied once, and every reader downstream — pruning, validation, admission, the write, the payload — is correct without being touched. | **Kept.** |
| **B. Ask each consumer to walk up** — `sanitize` and the rest look at ancestors themselves | No change to the tree. | Not kept. Five consumers, five chances to forget, and the one that forgets fails open. Finding 2 is what that looks like already. |
| **C. Refuse the declaration** — a layout may not be hidden or disabled | Nothing to inherit. | Not kept. Hiding a whole section on a condition is the ordinary case a form has, and refusing it would push authors to hide each field separately — the same rule, written by hand, once per field. |

## Decision

**1. A layout's flags apply to everything it holds.** Effective visibility is a node's own answer and every ancestor's; effective disabled-ness is its own or any ancestor's. Hidden wins over shown in both directions: a layout cannot reveal what a child hid, and a child cannot show itself inside a hidden parent.

**2. It is one pass, after resolution, over the whole tree.** Not folded into the resolution itself, which runs children first — the two directions are opposite, and a rule applied halfway is worse than one applied late.

**3. A node keeps its own answer apart from its effective one.** Verification 6 is why: a pass reuses a node whose own reads have not changed, and a child carrying an inherited `false` would stay hidden after the section above it came back. The effective flags are recomputed from the own ones every time, so nothing carried can be stale.

**4. What the reader is shown follows from the same flags.** A field inside a disabled group arrives disabled in its own right, and a `Fieldset` also carries the browser's own `disabled` attribute. Neither is the mechanism — the server refusing the value is — but a control that looks writable and is not is a control somebody fills in twice.

## Consequences

- **The trust boundary is a tree question, not a node question.** Anything added later that judges a node — a new consumer of `ResolveResult`, a new kind of component — reads the effective flags and inherits this for free. Reading `own` instead is the mistake to look for.
- **`own` is on the public `ResolvedNode`.** It has exactly one legitimate reader, which is the inheritance pass itself. Anything else reading it is asking a question it does not want the answer to.
- **An author can hide a group cheaply**, which is what makes decision 1 worth having: one resolver on a section rather than the same resolver copied onto six fields.
- **The invariants are unchanged in wording and wider in effect.** Nothing in invariant 4 or 5 needed rewriting; they now mean what they always read as meaning.

## Reopening rule

A component that must be visible to the server while hidden from the reader — a value the cycle needs but the page must not show. Decision 1 would refuse it, and `Hidden` is not that: it is a field the payload carries and the reader does not see, which is a different thing from one the tree prunes.

Nothing else. In particular, performance is not a reason: the pass is one walk of a tree that has already been walked several times, and the measurement to beat is the one the latency budget already covers.
