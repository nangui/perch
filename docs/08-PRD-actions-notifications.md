# PRD 08 — Actions, modals & notifications

**Tier:** v0.1 → v0.3 · **Depends on:** PRD 02, 03, 04

## 1. Objective

Two coupled systems. Filament presents them as *"defining reusable actions with buttons, dropdowns and bulk triggers, with confirmation steps, modal forms, authorization checks and synchronous or queued execution"* — and notifications as the user feedback that goes with them.

This is the system that turns a CRUD into a business tool: "archive", "refund", "resend the email", "approve the order".

## 2. API — one action

```ts
Action.make('archive')
  .label('Archive')
  .icon('archive-box')
  .color('warning')
  .requiresConfirmation()
  .modalHeading('Archive this article?')
  .modalDescription('It will no longer be editable.')
  .modalSubmitActionLabel('Archive')
  .schema([                                        // form inside the modal
    TextInput.make('reason').label('Reason').maxLength(255).required(),
  ])
  .authorize((user, record) => user.isAdmin)
  .visible((ctx) => !ctx.record.archivedAt)
  .action(async (record, data) => {
    await this.posts.archive(record.id, data.reason);
    return Notification.make()
      .title('Article archived')
      .body('It can no longer be edited.')
      .success();
  });
```

This contract is **identical** everywhere: table row, header, Edit page, bulk, notification, relation manager, infolist. One single `Action` class. That is the strength of Filament's model — do not fragment it.

## 3. Trigger contexts

| Context | Receives | Tier |
|---|---|---|
| Row action (table) | 1 record | v0.1 |
| Header action (List / Edit) | none, or 1 record | v0.1 |
| Bulk action | N records or a predicate | v0.1 |
| Form action (Submit, Save & another) | the form state | v0.1 |
| Grouped action (dropdown) | same | v0.2 |
| Action inside a notification | the carried context | v0.2 |
| Action inside a relation manager | the child record | v0.2 |
| Action inside an infolist | the record | v0.2 |
| Action on a global search result | the record | v0.3 |

## 4. Ready-made actions

| Action | Tier | Notes |
|---|---|---|
| `CreateAction` | v0.1 | navigation or modal |
| `EditAction` | v0.1 | navigation or modal |
| `ViewAction` | v0.2 | infolist in a modal or a page |
| `DeleteAction` / `DeleteBulkAction` | v0.1 | confirmation mandatory by default |
| `ReplicateAction` | v0.2 | `.excludeAttributes()` `.beforeReplicaSaved()` |
| `RestoreAction` / `ForceDeleteAction` (+ bulk) | v0.2 | soft deletes |
| `ImportAction` | v0.3 | CSV, column mapping, row-by-row validation, failure report |
| `ExportAction` | v0.3 | CSV/XLSX of the filtered result, queued beyond a threshold |
| `AssociateAction` / `AttachAction` / `DetachAction` | v0.2 | n-n relations |

## 5. Modals

| Capability | Tier |
|---|---|
| Confirmation (heading, description, labels, icon, color) | v0.1 |
| Form in a modal (complete schema, reactivity included) | v0.1 |
| Slide-over | v0.2 |
| Sizes (`sm` → `7xl`, `screen`) | v0.2 |
| Free-content modal (infolist, custom) | v0.2 |
| Stepped modal (wizard) | v0.3 |
| Configurable close on escape / outside click | v0.1 |

**Constraint**: a modal containing a schema uses **exactly** the same engine and the same state protocol as a page form. No parallel code path — otherwise reactivity will be broken in it and nobody will understand why.

## 6. Execution

| Mode | Tier | Notes |
|---|---|---|
| Synchronous | v0.1 | default |
| Notification return | v0.1 | the action returns one or more notifications |
| Redirect after the action | v0.1 | `.successRedirectUrl()` |
| Table refresh | v0.1 | automatic after a mutation |
| Queue (BullMQ) | v0.3 | for import/export and long batches |
| Progress tracking | v0.3 | a progress bar on a long action |
| Cancellation | out of scope | — |

**Security**: `authorize()` is checked **on the server at execution time**, not only when the button is rendered. A hidden button is not a protection. Explicit test: calling the endpoint of an unauthorized action returns 404 and mutates nothing — the same answer an action that does not exist gets, as the error taxonomy in `docs/12-ARCH-backend.md` §7 requires.

## 7. Notifications

### 7.1 API

```ts
Notification.make()
  .title('Report generated')
  .body('The monthly report is ready.')
  .icon('document-chart-bar')
  .success()                       // .warning() .danger() .info()
  .persistent()                    // does not disappear on its own
  .duration(5000)
  .actions([
    Action.make('download').color('primary').url(`/reports/${id}`),
    Action.make('view').color('gray').url(`/reports/${id}/view`),
  ])
  .send();
```

### 7.2 Channels

| Channel | Tier | Notes |
|---|---|---|
| In-app toast (request response) | v0.1 | the only indispensable one |
| In-app toast (flash across requests / after a redirect) | v0.1 | survives a redirect |
| Notifications persisted in the database + a bell panel | v0.3 | a dedicated table, read/unread marking |
| Real-time broadcast (WebSocket) | v0.3 | for asynchronous jobs |
| Email / push | **out of scope** | that is the host app's job |

## 8. Acceptance criteria

1. An action with confirmation + a modal form + a success notification works as a row action, a bulk action and a header action, **with the same code**.
2. `authorize()` refused → the endpoint returns 404, no mutation, no information about the reason. Never 403: telling the two apart is what lets a caller map what exists, and `docs/03-PRD-protocol-renderer.md` §3.2 names that as the mitigation for resource enumeration.
3. A modal containing a dependent `Select` is reactive (the state protocol works inside a modal).
4. A bulk action over 500 rows runs in one transaction and reports the number of items processed.
5. An action that fails shows a readable error notification — never a stack trace, never silence.
6. A success notification survives a redirect to the List page.
7. An action triggered twice by a double click performs the mutation only once (client-side idempotence + a server guard).

## 9. Out of scope

- Sending email / SMS / push (the host app handles it).
- Scheduled actions (cron).
- Undo / action cancellation.
- Action chaining / workflow engine.
- Multi-user approval sign-off.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Two code paths for schemas in a modal versus on a page | **High** | one engine, one protocol — a cross test is mandatory |
| Authorization checked only at render time | **Critical** | an attack test in CI on every ready-made action |
| Double submission on a non-idempotent action | Medium | button disabled + a request token |
| Import/export blocks the Node process | Medium | a threshold beyond which execution goes to a queue (v0.3) |
| Database notifications drift into a messaging system | Low | the scope is written down: action feedback, nothing else |
