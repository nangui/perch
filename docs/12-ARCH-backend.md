# ARCH 12 — Backend architecture

**Status:** architecture decision · **Completes:** PRD 01, 02, 03, 04

## 1. The 4 layers and the dependency rule

```
┌─────────────────────────────────────────────────────────┐
│  ADAPTERS IN        PanelController · routes · PanelModule│
├─────────────────────────────────────────────────────────┤
│  APPLICATION        ResourceRuntime · StateMachine        │
│                     QueryPlanner · ActionRunner           │
├─────────────────────────────────────────────────────────┤
│  DOMAIN             Component · Field · Schema · Table    │
│                     Action  (= @perchjs/core)             │
├─────────────────────────────────────────────────────────┤
│  ADAPTERS OUT       DataAdapter(Prisma) · Storage · Clock │
└─────────────────────────────────────────────────────────┘
```

**One rule, non-negotiable:** the arrows only point inward.

| Layer | May import | May never import |
|---|---|---|
| Domain | nothing | Nest, Prisma, React, Express |
| Application | Domain + port interfaces | concrete adapter implementations |
| Adapters | Application + Domain | another adapter |

Verified by a dependency test (`dependency-cruiser`), **blocking in CI from v0.1**. That is what guarantees a future Drizzle or Fastify adapter needs no rewrite.

## 2. Lifecycle of a `/state` request — a 9-stage pipeline

The core of the product. Each stage is an isolated function, testable on its own.

| # | Stage | Responsibility | Layer |
|---|---|---|---|
| 1 | **Decode** | parse the body, validate the transport shape | Adapter in |
| 2 | **Authenticate** | Nest guards → `principal` | Adapter in |
| 3 | **Locate** | resolve resource + operation + authorization (`can`) | Application |
| 4 | **Build** | build the schema tree for this request | Application |
| 5 | **Sanitize** | filter incoming state against the tree, in waves | Application |
| 6 | **Reduce** | state machine: apply → hooks → resolve → prune | Application |
| 7 | **Validate** | Zod compiled from the tree, visible fields only | Application |
| 8 | **Dehydrate** | produce `{ schema, state, errors }` ([ADR 0010](adr/0010-state-response-shape.md)) | Application |
| 9 | **Encode** | serialize, headers, status | Adapter in |

**Stage 5 is the trust boundary.** Everything arriving from the client is confronted with the tree there: an unknown path, an invisible field, a `disabled` or `readOnly` field → **discarded silently**. No explicit error: a message saying "this field is read-only" informs the attacker.

**Stages 5 and 6 are the loops in the system**, and both are bounded to 5 passes. Stage 6 exits when a pass changes nothing; stage 5 exits when a pass admits nothing new. Beyond 5, either raises an exception naming the fields involved — never a silent stack overflow.

Stage 5 loops because a field and the field that reveals it arrive together: judging both against a tree that knows neither discards the second every time. Each pass resolves the tree from the values already admitted and confronts the payload again, so nothing the client sent ever decides its own fate ([ADR 0011](adr/0011-admission-in-waves.md)).

## 3. Where the state machine lives

**In the application layer, not in the domain, not in the controller.**

The reason: it orchestrates domain objects *and* adapter calls (asynchronous options, `unique` validation, navigation badges). It needs I/O. The domain stays pure — which is what makes it testable without a database and without Nest.

A domain `Resolver` never performs I/O itself: it receives a `ResolverContext` that the application populated.

## 4. Request context

A single `AsyncLocalStorage`, created at stage 2, carrying:

```ts
interface RequestContext {
  requestId: string;
  principal: unknown;
  tenantId?: string;         // scoping (PRD 04 §8)
  sqlQueryCount: number;     // feeds the anti-N+1 test
  resolverTrace: string[];   // traced dependencies (PRD 02 §4)
  cache: Map<string, unknown>;
}
```

**No mutable module variable, anywhere.** That is what makes multi-tenant scoping, the SQL query counter in CI and the concurrency test all possible at once. Three guardrails from one decision.

## 5. Three cache levels, three lifetimes

| Level | Lifetime | Contents | Forbidden |
|---|---|---|---|
| **Bootstrap** | the process's life | the DMMF's IR, resource metadata, the navigation tree, component prototypes, base Zod schemas | anything that depends on a user |
| **Request** | one request | relation labels, authorization results, badges | — |
| **None** | — | — | **never** cache a value derived from user input across requests |

The third row is the most important rule in the table.

## 6. Immutability and concurrency

Components are defined **once** at bootstrap, as prototypes. Each request makes a `clone()` of them. Each fluent method returns a new object.

A mutable builder shared across requests leaks one user's state to another. **That is a vulnerability, not a style choice.** Concurrency test: 100 parallel requests on the same resource, with divergent states, no contamination.

## 7. Error taxonomy

| Class | Origin | Response | Information leaked |
|---|---|---|---|
| `ValidationError` | stage 7 | 422 + per-field errors | none |
| `AuthorizationError` | stages 3, 8 | **404**, indistinguishable from "does not exist" | none |
| `IntegrityError` | an FK / unique constraint in the database | 409 + a readable notification | a translated message, never the SQL |
| `ResolverError` | user code inside a resolver | **local** degradation of the component | the requestId only |
| `InternalError` | us | 500 + requestId | nothing, never a stack |

A resolver that throws must **never** produce a 500: the component concerned degrades, the page lives.

## 8. Extension seams in the pipeline

The plugin contract (PRD 11) is not a separate layer: it is three named points in the pipeline.

| Stage | Seam | Used by |
|---|---|---|
| 4 (Build) | `SchemaHook` — a third party modifies the tree | E2, field injection |
| 6 (Reduce) | resolver tracing | the dependency graph |
| 8 (Dehydrate) | payload filters | hiding by authorization |

A plugin has **no** privileged code path. If it needs access the pipeline does not give, it is the pipeline that gets fixed.

## 9. What this architecture buys

| Decision | What it makes possible later |
|---|---|
| A dependency-free domain | a Drizzle adapter, a Fastify adapter, tests without a database |
| A staged pipeline | inserting tenancy, audit, i18n without touching the rest |
| A request context | scoping, counters, tracing, with no global variables |
| The trust boundary at stage 5 | security lives in one place, auditable |
| Immutable prototypes | safe concurrency by construction |
