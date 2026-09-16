---
title: AI-assisted development
---

# AI-assisted development

Most people who add Perch to an application will do it with an agent sitting beside them.
This page is what that agent needs to know, and what you should check before you believe
it.

## Give it the index first

The guide publishes an `llms.txt`: every page, as one list, with a sentence on each.
Every page is also served as plain markdown at its own address with `.md` appended, so an
agent fetching one gets the page rather than a wrapper of navigation.

Point yours at the index rather than at a search engine. A model working from memory will
write Perch the way it writes every other admin framework, and those are not the same
framework.

## The one mistake worth watching for

Every builder here is immutable. A fluent call returns a new one and changes nothing:

```ts
import { Schema, TextInput } from "@perchjs/core";

const field = TextInput.make("title");
field.required(); // does nothing at all: the result is thrown away
const required = field.required(); // this one is the required field

export const schema = Schema.make([required]);
```

This is the shape an agent gets wrong, because most builder APIs it has seen mutate. The
result compiles, passes review and silently drops the rule, and nothing tells you: the
form simply accepts an empty title.

It is that way on purpose. A builder shared between requests that could be written to
would leak one reader's state into another's, which is a security bug rather than a
matter of taste. The cost is this one trap, and it is worth knowing before an agent walks
into it for you.

## Nothing is decided in the browser

There is no client-side validation to add, no condition to evaluate in the browser, no
option list to compute there. If your agent proposes any of those, it is writing for a
different framework.

The client is an interpreter. It draws what the server resolved and sends back what the
reader typed. Everything else happens on the server, including visibility, options and
every rule.

An agent that reaches for "just make it feel faster on the client" is reaching for the
one thing this design refuses. The answer is the server, with a debounce.

## Do not accept a generated front end

If an agent starts writing React for your panel, stop it. The panel has no front end for
you to write: that is the whole point of it. A custom field is a registered component and
[Advanced](./advanced) says how; everything else is declared.

## Declared, not default

A column is not sortable because it holds something sortable, and not searchable because
it holds text. Both are permissions, and the server refuses what no column declared,
because sorting a column reveals the order of its values and searching one answers
questions about values nobody displayed.

An agent that writes `TextColumn.make("email")` and then tells you sorting works has
guessed. See [TextColumn](./columns/text).

## Read the boot error, do not work around it

The panel refuses to start rather than behaving oddly, and the message names the field
and the problem. A switch over a text field, a select in a cell whose list comes from a
resolver, a replicate that copies a unique column: each is refused at boot, by name.

Those messages are written to be acted on. An agent that catches one and changes the
declaration until the panel starts has usually removed the thing the message was about.
Paste the message to it instead.

## A refusal looks like an absence

An unauthorised record answers 404, not 403, so that nobody can learn what exists by
being refused. Two consequences for a debugging session: "not found" often means "not
allowed", and an agent chasing a missing row may be chasing a policy.

See [Users](./users) and [Auth recipes](./auth-recipes), where the same thing bites: a
policy comparing a field your principal does not carry denies every row, quietly, for
ever.

## What to ask it to check

Before you believe a panel is done, four questions worth putting to your agent, each of
which the framework can answer for itself:

- Does `npx perch doctor` pass?
- Does the panel boot? Most declaration mistakes are refused there.
- Is there a test? [Testing](./testing) drives a panel over HTTP the way a browser does,
  and a panel nobody tests regresses invisibly, because an admin screen looks the same
  whether or not it saved.
- Does a policy exist for every resource, and is one of them tested against a reader who
  may not?
