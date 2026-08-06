# ADR 0004 — Naming: Perch

**Status:** accepted · **Scope:** Perch

## Context

Two projects to name, in opposite registers: a framework that has to say authority and structure, a kit that has to say craft and ready-made screens.

A first candidate, **Plumage**, was proposed and then rejected after an adversarial review. The post-mortem is more useful than the decision.

## "Plumage" post-mortem

Initial justification: plumage is the visible part of the bird and **grows out of** the animal — hence the UI emerging from the backend. Nest → bird → plumage.

Six objections, two of them fatal:

| # | Objection | Severity |
|---|---|---|
| 1 | **Inverted semantics** — *plumage* connotes finery, ornament. Yet accusation number one against admin generators is that they are **superficial**. The name hands detractors the very word for their criticism. | fatal |
| 2 | **Three inferential leaps, and the first one is false** — the NestJS brand is not ornithological; the nest → bird link was an invention, not a shared perception. | fatal |
| 3 | Two diverging pronunciations: *PLOO-mij* / *plu-MAHZH* | serious |
| 4 | No verb form | moderate |
| 5 | Zero functional information, without the awareness budget to pay for it | moderate |
| 6 | A dictionary word heavily used in fashion and beauty → risk of opposition in classes 9 and 42 | moderate |

## The underlying error, and the principle that follows

The error was not the three leaps. It was **the premise that a name must carry the product's thesis.**

Checked against names that succeeded:

| Name | What the word says | What actually carries the thesis |
|---|---|---|
| Filament | an incandescent thread | the light bulb in the logo + *"for your bright ideas"* |
| Prisma | a prism splits light | the positioning |
| Keystone | the stone that holds the arch | the docs |
| Payload | what you carry | the product |

> **Principle adopted: a dev-tool name carries an image you can own. The logo and the tagline carry the argument.**

**Criteria, in this order:** ownable · short and easy to say aloud · npm scope free · **not semantically wrong**. Nothing more. Demanding that a name make the argument produces metaphors nobody decodes.

## Decision

### Perch — the framework

> The lookout over your Nest app.
> **Declare it in TypeScript. Watch it appear.**

Five letters, says itself aloud, one single leap. **Residual risk, owned:** *perch* connotes observation rather than construction — it narrows toward the dashboard. The second line of the tagline recovers the missing half; **it is not optional**.

Fallback: **Facet**.

## Availability checked (npm, August 2026)

| Name | Scope `@name` | Unscoped name |
|---|---|---|
| `perch` | **free** | dead squat, v1.0.0 from 2022 |
| `facet` | free | abandoned, v0.5.0 from 2022 |

⚠️ Zero search results does not prove a scope is unreserved without a publication. To be confirmed with `npm org`.

## Consequences — the defense

**Rhetorically: by not defending it.** A name you argue for is a name you reopen.

1. One line of origin in the README, one "Why the name?" entry in the FAQ. Never more.
2. **Never debate a name in a PR thread.** One reply only: a link to the FAQ.
3. `CONTRIBUTING.md` says it: the name is a closed decision.

**In practice:** see `../00-PRD-MASTER.md` §14.4 for the prioritized sequence. The only irreversible action if someone gets there first: **reserve the npm organizations**, five minutes.

## Reopening rule

**One only:** a live trademark registered in class 9 or 42 in a target market. In that case, rename **immediately** — two hours today, several months after the first thousand users.

No aesthetic preference, no contributor opinion, no public comment reopens this.
