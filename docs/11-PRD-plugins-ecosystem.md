# PRD 11 — Extensibility, plugins & ecosystem

**Tier:** v0.1 (the contract) → v2 (the public ecosystem) · **Depends on:** PRD 02, 03, 04

## 1. Why this PRD exists now

**949+ community plugins.** That is the figure Filament shows, next to its 31.7K stars and 32.8M downloads. It is not a consequence of success, it is **the cause**: one Filament user reports that *"whenever he runs into something not already in the framework, the community has almost always solved the problem with a plugin"*.

Filament's real competitive moat is not its code. It is its ecosystem.

**Operational consequence:** we do **not** publish a plugin API in v0.1. But we **design the contract in v0.1**, because it is the one thing in this entire project that cannot be retrofitted. An architecture that did not plan for extension never becomes extensible — it gets forked.

## 2. The 6 extension points to wire in v0.1

Even without a public API, these seams have to exist in the code from the start.

| # | Extension point | Mechanism | Real use case |
|---|---|---|---|
| E1 | **Global configuration of a component** | `TextInput.configureUsing(fn)` | force a default `maxLength` everywhere, change a global style |
| E2 | **Injection into an existing schema** | a `SchemaHook` per resource + position | an "audit" module adds `createdBy` to every resource |
| E3 | **A new field / column / entry type** | server registry + React registry | a `StarRating` field, a `Sparkline` column |
| E4 | **Render hooks** | named positions in the chrome | inject a banner, a button in the topbar |
| E5 | **A new resource / page provided by a package** | the plugin is a Nest `DynamicModule` | a "Permissions" plugin ships its `Role` resource |
| E6 | **A plugin's assets (CSS/JS)** | registration with `PanelModule` | a plugin that needs its own front-end library |

**E2 is acceptance criterion A4 of PRD 00.** If a third-party Nest module cannot inject a field into a resource it does not own, no ecosystem is possible. That is a v0.1 milestone, not a v2 one.

## 3. The plugin contract (v2, designed in v0.1)

Filament distinguishes two kinds of plugin, a distinction worth taking up:

| Kind | Reach | Example |
|---|---|---|
| **Panel plugin** | registers resources, pages, widgets, navigation in a panel | a role-management plugin |
| **Standalone plugin** | provides a reusable component, with no panel | a field, a column |

```ts
export class AuditLogPlugin implements PanelPlugin {
  id = 'audit-log';

  register(panel: PanelBuilder) {
    panel
      .resources([AuditLogResource])
      .widgets([RecentActivityWidget])
      .renderHook('topbar.end', AuditIndicator)
      .assets({ css: ['audit.css'] });
  }

  // E2: injection into other people's schemas
  extendResourceSchemas(resource: ResourceMeta, schema: Schema) {
    if (!resource.auditable) return schema;
    return schema.push(
      Section.make('Audit').collapsed().schema([
        TextEntry.make('createdBy.name'),
        TextEntry.make('updatedAt').dateTime(),
      ]),
    );
  }
}
```

Filament also offers **configurable resources and pages** for plugins — the ability for the end user to reconfigure what a plugin provides. To take up in v2: a plugin whose resources are frozen is a plugin people fork.

## 4. Non-negotiable design rules

1. **The core has no plugin special cases.** If a plugin needs access the core does not give everyone, it is the core that has to be fixed.
2. **Every extension point is versioned and documented.** An undocumented extension point will be used anyway, then broken, then held against you.
3. **A plugin cannot bypass authorization.** Injected schemas go through the same server-side filtering (PRD 03 §3.2). A plugin must not be able to expose a field a user has no right to see.
4. **Deterministic execution order.** Two plugins modifying the same resource apply in a stable, declared order, not in module resolution order.
5. **Isolated failure.** A plugin that throws degrades its own area, not the whole panel.
6. **No premature opening.** The API is only published in v2, once the core is stable. Publishing early means freezing mistakes and preventing plugins from surviving v1.

## 5. Ecosystem (v2)

| Piece | Description |
|---|---|
| Catalog | a page listing plugins, searchable, with version compatibility. Filament hosts a catalog of 949+ plugins without selling them. |
| Naming convention | `perch-plugin-*` on npm, for discoverability |
| Plugin template | `npx perch plugin create` |
| Compatibility matrix | plugin version × core version, checked automatically |
| Quality badge | tests present, documentation present, recently maintained |

## 6. Future commercial surface — **out of current scope**

Documented so as not to close doors. The model observed at Filament, in order of what works:

| # | Lever | What Filament does | Applicability |
|---|---|---|---|
| 1 | **Tiered sponsorship** | GitHub Sponsors with Agency Partner / Gold / Silver / Bronze tiers, logos on the site and in the documentation | The simplest, as soon as traction exists |
| 2 | **Paid official plugins** | sells its *Custom Dashboards* plugin (drag-and-drop dashboards) while keeping the framework free | The most promising. Candidates identified across the PRDs: drag-and-drop dashboards (09), saved table views + quick filters (07), command palette, RBAC with a graphical editor |
| 3 | **Third-party plugin market** | hosts the catalog, takes no commission; third parties sell their own commercial plugins | Network effect, indirect revenue |
| 4 | **Consulting** | a dedicated page + a network of partner agencies | Depends on personal reputation |
| 5 | **Shop** | merchandise | Marginal |

### Decisions of principle, to carve in now

- **The core stays MIT and functionally complete.** We never mutilate the core in order to sell. That is what made Filament's reputation against Nova (paid) and Backpack (tiered).
- All monetization goes through **additive plugins**, never through features removed from the core.
- A paid plugin must **never** need a private extension point. If it needs one, the extension point becomes public for everyone.
- No telemetry, no required account, no phoning home.
- A licensing decision to document before v1: MIT for the core, a separate commercial license per plugin.

**Status: none of this is built before v2.** This PRD exists solely to guarantee that the architecture does not forbid it.

## 7. Acceptance criteria

### v0.1

1. **A4** — a third-party Nest module, in a separate package, adds a field to `UserResource` without modifying its source.
2. `TextInput.configureUsing()` applied at bootstrap affects every `TextInput` in every panel.
3. A custom field (server class + React component) works end to end, including reactivity and validation.
4. An unknown component on the client does not wipe out the page's rendering.
5. A schema injected by a third party undergoes the same authorization filtering as a native one (attack test).

### v2

6. Two plugins modifying the same resource apply in a deterministic, documented order.
7. A plugin that throws in `register()` is disabled with a clear message; the panel still starts.
8. A plugin declaring an incompatible core version is refused at bootstrap with an actionable message.

## 8. Out of scope

- The catalog, the plugin template, the compatibility matrix (v2).
- Any form of billing, licensing, key management.
- Sandboxing / security isolation of plugins (they run in-process; documented as such).
- A marketplace with integrated payment.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The v0.1 architecture does not allow extension → everything has to be rewritten for v2 | **Fatal** | A4 is a **v0.1** milestone, tested, not deferrable |
| Publishing the API too early freezes design mistakes | High | internal but working API in v0.1; public only in v2 |
| A plugin bypasses authorization → a leak for some user | **Critical** | one single server-side filter, never bypassable; attack test on an injected schema |
| No ecosystem means no competitive moat | High | write 3 plugins ourselves in v2 to prove the API and prime the pump |
| Monetization erodes trust | High | a principle stated publicly: the core will never be mutilated |
