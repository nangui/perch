# ADR 0043 — What a notification carries

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/ui`)

## Context

PRD 08 §7.1 describes a notification built with `.icon()`, `.persistent()`, `.duration(5000)`, `.actions([...])` and sent with `.send()`, and §6 says an action returns "one or more notifications". What shipped is a builder holding a title, a body and a tone, returned by an action's callback, one or none — and both the builder's own header and the notifications guide say it carries no timing and no channel, because where a message is shown and for how long is the renderer's business.

So two documents and the code disagree with a third, and the third is the one a contributor reads first when they set out to build what is missing. Left alone, the next person to read §7.1 adds `.duration()` to a class whose first comment says it must not have one.

## What verification established

1. **The builder has `title`, `body`, `success`, `warning` and `danger`, and nothing else.** `info` is what `make()` starts from. Every method clones, as invariant 3 asks.
2. **A callback returns one or nothing.** ADR 0017 decision 1 settled the signature as `(record, data) => Notification | void`, and there is no `.send()`: the answer is what the callback returns, carried back on the response or across a redirect by the flash.
3. **The renderer already decides the timing, and by something an action cannot know.** The toast lets a success or a note go after five seconds and keeps a warning or a danger until it is closed, holds its timer while the pointer or the focus is on it, and replaces one message with the next. An action deciding its own duration would be deciding it without knowing whether the reader is on a phone, whether five other things just happened, or whether the page it is shown on still exists.
4. **What `.persistent()` was for is met by the tone.** A message that must not leave on its own is a message about something that went wrong or needs watching, which is what `warning` and `danger` already say. The cases are the same cases.
5. **An action inside a message is a control that can vanish.** A button in a toast that leaves after five seconds is a button a reader who looked away never reaches, and one reachable only by F8 is one a keyboard reader has to know about. Neither is built, and building it is a decision about the toast as much as about the builder.
6. **An icon is additive.** The panel's icon names are a closed vocabulary refused at boot when unknown (ADR 0027). A tone already carries the meaning a default icon would, and adding `.icon()` later breaks nothing that returns a notification today.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Keep the builder as shipped, correct the PRD** | The code, the guide and ADR 0017 stay as they are, and the document that disagreed says what they say. | **Kept.** |
| **B. Add `.duration()` and `.persistent()`** | The PRD becomes true for timing. | Not kept. It gives an action a decision verification 3 says it cannot make well, and two ways to say "stay" — `.persistent()` and `.danger()` — that a reader would have to reconcile. |
| **C. Build all of §7.1** | The PRD becomes true. | Not kept. Beyond B, it adds a control that can leave on its own (verification 5) and a `.send()` that contradicts ADR 0017's signature, to match a document written before either existed. |

## Decision

**1. A notification carries a title, an optional body and a tone, and nothing else.** `success`, `warning`, `danger`, or `info` by default.

**2. How long it is shown is the renderer's.** The builder takes no duration and no persistence. The panel's renderer decides by tone; another renderer, or another channel when one arrives, decides by what it can see.

**3. It is returned, not sent.** One per callback, or none, as ADR 0017 settled. There is no `.send()`.

**4. Deliberately not decided here: icons and actions in a message.** Neither is built. An icon can be added without breaking anything (verification 6); an action in a message cannot be added without deciding what happens when the message leaves (verification 5), and that is a decision for when one is wanted.

**5. PRD 08 is corrected to match**, in §7.1 and in the row of §6 that said "one or more". The document was written before the builder and describes a shape that was never built; it is the document that moves, as it did for PRD 07 in ADR 0026.

## Consequences

- **The PRD, the guide and the builder say one thing.** Somebody building the next channel starts from what an action returns rather than from what it was once imagined to.
- **A message's timing changes in one place.** Five seconds, or which tones stay, is a change to the renderer, made once for every action in every panel.
- **An action cannot keep a success on screen.** If something a reader must act on needs to stay, it is a warning, or it is not a notification — a page or a modal says it instead.

## Reopening rule

**One:** a channel whose renderer cannot decide timing from what it sees — a persisted notification in a bell panel (PRD 08 §7.2, v0.3) that needs an expiry the reader set nothing for. Then decision 2 is asked again for that channel, not for the toast.

**Two:** an action that needs a control in its message, an undo or a "view it" link that a page cannot carry instead. Then decision 4 is taken, with verification 5 as the first thing to answer.

Not a reason: that PRD 08 §7.1 once listed these methods. That listing is what this decision corrects.
