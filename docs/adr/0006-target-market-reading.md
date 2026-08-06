# ADR 0006 — What "target market" means in the name's reopening rule

**Status:** accepted · **Scope:** Perch

*Refines and replaces the reopening rule of [ADR 0004](0004-naming.md). The naming decision itself is not reopened.*

## Context

ADR 0004 closes the name with a single reopening rule:

> A live trademark registered in **class 9 or 42 in a target market**.

At the point of running the clearance search planned in `../00-PRD-MASTER.md` §14.4, that wording
turned out to be unusable as written: "target market" supports two readings that reach opposite
decisions on the same registry result.

- **Territorial reading** — a target market is a country or a zone: France, the European Union,
  the United States. Any live class 9 mark there would trigger the rule.
- **Sectoral reading** — a target market is a product market: developer tooling. A class 9 mark
  covering something else would trigger nothing.

A reopening rule that can be read two ways protects nothing: it moves the debate from "should we
rename" to "what did the rule mean". That is the opposite of its function.

## What trademark law imposes

Three facts, which constrain the answer more than a drafting preference could.

1. **A trademark is territorial.** It only protects where it is filed. A US filing has no effect
   in France.
2. **A trademark is specific to the goods and services it designates.** Protection does not cover
   "class 9" but the **specification** filed inside that class.
3. **The Nice class is not the extent of protection.** It is an administrative filing category.
   Likelihood of confusion is assessed on the real similarity of the goods, not on the identity of
   a class number. Class 9 covers a video game as readily as a printer driver or a server
   framework.

The first two conditions are **cumulative**. Neither proposed reading respects them: the
territorial one ignores the second, the sectoral one ignores the first.

## Decision

**"Target market" reads as the conjunction of both conditions.** ADR 0004's reopening rule becomes:

> **A live trademark triggers a rename if, cumulatively:**
>
> 1. it is in force in a **targeted territory** — France, the European Union, the United States,
>    the United Kingdom;
> 2. **and** its specification of goods and services **covers software tooling aimed at
>    developers**, whichever class carries it.
>
> **The Nice class only serves to find candidates, never to decide.** The specification decides.

Three clarifications that are part of the decision:

**The United Kingdom is a targeted territory in its own right.** Since Brexit, a European Union
trademark no longer has effect there: an EUIPO search says nothing about the UK. Omitting it is
the easiest mistake to make.

**Prior unregistered commercial use counts.** ADR 0004 said "registered", which let the most
likely case escape: a product sold for years under the same name, in the same category, without a
filing. In the United Kingdom and the United States, that use grounds enforceable rights. It does
not trigger a rename automatically, but it **bars a trademark filing** and forces an explicit,
documented judgment call.

**A class 9 overlap with a specification foreign to software development triggers nothing** — but
it stays a gray area if the mark in question enjoys a reputation, well-known marks being protected
beyond similar goods. That gray area calls for an opinion from counsel, not a developer's
decision.

## Consequences

1. Every clearance search must record, for each result, the **exact specification** of goods and
   services. A record holding only a class number is unusable.
2. The registers to query include **UKIPO**, in addition to INPI, EUIPO, USPTO and the aggregated
   databases.
3. The factual results of the search are kept **outside this repository**. A public repository is
   not where you record the analysis of your own name's legal weaknesses.
4. No trademark filing is started before the specifications of the prior marks found have been
   read.
5. Repositories stay private until the search has concluded in Perch's favor. A private
   repository renames at no cost; a public, indexed one does not.

## Why this clarification is not a reopening

The name is not called into question. What is corrected is a **defective decision tool**: an
ambiguous rule, doubled by an omission — unregistered use. ADR 0004's discipline stands entire: no
aesthetic preference, no contributor opinion, no public comment reopens the name.

This is the second time a check on this file has failed for the same underlying reason, after the
npm availability table corrected by [ADR 0005](0005-npm-scope.md): **a check that does not say
which question it asked verifies nothing.** Recording the question, the exact term, the register
and the date is now part of the search.

## Reopening rule

**One only:** a change in applicable law that would alter the articulation between territory and
specification — a new unitary title covering the United Kingdom, or a reform of the scope of
classes.

Dissatisfaction with the wording does not reopen this.
