# PRD 10 — CLI, code generation, testing & docs

**Tier:** v0.1 (CLI) · v0.2 (testing, docs) · **Depends on:** PRD 01, 02, 05

## 1. Objective

Three things that are not features but that decide adoption: the first minute (CLI), confidence (testing), discoverability (docs).

Filament addresses all three explicitly: Artisan generators, a dedicated Testing chapter (resources, tables, schemas, actions, notifications), and documentation reorganized in v4 to give *"a clearer picture of how features fit together"*, with more examples and more explanation of internals. It also has an **"AI-assisted development"** page and an `llms.txt` indexing the whole documentation — a sign that documentation being consumed by agents has become a product criterion.

## 2. CLI (v0.1)

### 2.1 Commands

```bash
# Installing into an existing Nest app
npx perch init
#  → creates src/panel/panel.module.ts, registers it in AppModule,
#    detects the Prisma client, writes the config, prints the panel URL

# Generating a resource from a Prisma model
npx perch resource User
npx perch resource User --with-view --with-relations --soft-deletes
#  → src/panel/resources/user.resource.ts, registered in the module

npx perch page Settings
npx perch field StarRating      # server skeleton + React component
npx perch doctor                # configuration diagnosis
```

Integration with the Nest schematic as well: `nest g -c @perchjs/cli resource User`. Both entry points have to exist — habits differ.

### 2.2 Quality of the generated output

**This is the differentiating criterion.** A generated resource has to be immediately good, not an empty skeleton. It uses the inference from PRD 01 §3.2:

```ts
// npx perch resource User  →  produces this, not an empty file
@PanelResource({ model: 'User', navigationGroup: 'Access', icon: 'users' })
export class UserResource {
  form() {
    return Schema.make([
      Section.make('User').columns(2).schema([
        TextInput.make('name').required().maxLength(255),
        TextInput.make('email').email().required().unique(ignoreRecord: true),
        Select.make('roleId').relationship('role', 'name').required(),
        Toggle.make('isActive'),
      ]),
    ]);
  }

  table() {
    return Table.make()
      .columns([
        TextColumn.make('name').searchable().sortable(),
        TextColumn.make('email').searchable(),
        TextColumn.make('role.name').badge(),
        TextColumn.make('createdAt').dateTime().sortable().toggleable(hiddenByDefault: true),
      ])
      .filters([SelectFilter.make('roleId').relationship('role', 'name')])
      .actions([EditAction.make(), DeleteAction.make()])
      .headerActions([CreateAction.make()]);
  }
}
```

**Generation rules:**

- Idempotent: regenerating does not destroy manual edits → ask for confirmation, offer a diff.
- Formatted with the project's Prettier/ESLint, not ours.
- Fields excluded automatically: `id`, `createdAt`, `updatedAt`, `deletedAt`, `many` relations.
- At most 6 table columns, prioritized: the label field, uniques, `one` relations, booleans, dates.
- No dependency added without saying so.

### 2.3 Time-to-first-CRUD

This is product metric number one. Target path, **< 15 min** for a developer seeing the tool for the first time:

```
npm i @perchjs/nest @perchjs/prisma @perchjs/ui   (1 min)
npx perch init                                   (1 min)
npx perch resource User                          (30 s)
npm run start:dev  →  open /admin                  (1 min)
```

Any deviation from that path is a product bug, not a documentation detail.

## 3. Testing (v0.2)

### 3.1 Helpers provided

Without helpers, nobody will test their panel, and regressions will be invisible.

```ts
const panel = await createPanelTest({ module: AdminModule, as: adminUser });

// Schemas
await panel.resource(UserResource).form()
  .assertHasField('email')
  .fill({ countryId: 1 })
  .assertFieldVisible('cityId')
  .assertFieldOptions('cityId', ['Paris', 'Lyon'])
  .fill({ cityId: 2 })
  .submit()
  .assertNoErrors()
  .assertRecordCreated({ email: 'a@b.c' });

// Tables
await panel.resource(UserResource).table()
  .assertCanSeeRecords([u1, u2])
  .filter('roleId', adminRole.id)
  .assertCanSeeRecords([u1])
  .assertQueryCount(3);          // ← N+1 guardrail

// Actions
await panel.resource(PostResource).action('archive', post)
  .assertVisible()
  .call({ reason: 'obsolete' })
  .assertNotification('success', 'Article archived');

// Authorization
await panel.as(guestUser).resource(UserResource).assertForbidden();
```

### 3.2 What CI has to hold

| Guardrail | Why | Source PRD |
|---|---|---|
| SQL query counter per page | prevent N+1 | 01, 07 |
| p95 latency budget on `/state` and `/records` | prevent performance drift | 03, 07 |
| Concurrency test (100 parallel requests, no shared state) | builder immutability | 02 |
| Attack tests: forged state, unauthorized action, unknown path | security | 03, 08 |
| Cross-tenant test | data leaks | 04 |
| Dependency test: `core` imports neither Nest, nor Prisma, nor React | architectural integrity | 02 |
| DMMF contract test | fragility of the Prisma API | 01 |

These guardrails exist **from v0.1**, even though the public helpers only arrive in v0.2.

## 4. Documentation (v0.2)

### 4.1 Structure

Take up Filament's organization, which is excellent: Introduction → Getting started (an overview of how the pieces fit together) → Resources → Tables → Schemas → Forms → Infolists → Actions → Notifications → Widgets → Configuration → Navigation → Users → Styling → Advanced → Testing → Plugins → Deployment → Upgrade.

### 4.2 Requirements

| Requirement | Detail |
|---|---|
| Every page has a copyable example that **works** | tested in CI by extracting the code blocks |
| Every field / column / action has its own page | no catch-all page |
| A public deployed demo | Filament has one, open-source, with a real dataset. Indispensable. |
| An `llms.txt` indexing the whole documentation | the user's coding agent is a first-class reader |
| An "AI-assisted development" page | project rules for agents, conventions, pitfalls |
| An upgrade guide from the first breaking change | never retroactively |
| Auth integration recipes | Passport-JWT, sessions, Clerk, Auth.js (PRD 04 §5.1) |

**The `llms.txt` is not a gimmick.** In 2026, a significant share of users will discover the tool through an agent. Documentation that agents read badly means a tool that agents recommend badly.

## 5. Acceptance criteria

1. Time-to-first-CRUD measured at < 15 min on 3 developers who have never seen the tool (a real, timed user test).
2. `npx perch resource User` produces a file that compiles, passes the project's lint and works with no editing.
3. Regenerating a modified resource destroys nothing without explicit confirmation.
4. `npx perch doctor` detects: Prisma missing, client not generated, module not registered, route collision, unsupported Prisma version.
5. The 7 CI guardrails from §3.2 are in place and blocking on the main branch from v0.1.
6. Every code block in the documentation is extracted and compiled in CI.
7. The public demo is deployed and its code is open-source.

## 6. Out of scope

- A graphical generation interface.
- Automatic migration from AdminJS / Payload / Refine.
- Translating the documentation (English in v1; French will come from the community).
- An online playground of the StackBlitz kind (v0.3 if possible).

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Poor generation quality → a bad first impression | **Fatal** | the inference from PRD 01 is a prerequisite, not a bonus; a timed user test |
| Nobody tests their panel → regressions invisible to users | High | helpers shipped in v0.2, not in v1 |
| Documentation lagging behind the code | High | code blocks tested in CI; no feature merged without a documentation page |
| The CLI breaks on every Nest version | Medium | lean on the official schematics rather than rewriting a generator |
| `perch init` edits user code and breaks something | Medium | dry run by default with the diff shown, confirmation before writing |
