# PRD 04 — Nest PanelModule (`@perchjs/nest`)

**Tier:** v0.1 · **Depends on:** PRD 02, 03 · **Unblocks:** PRD 05

## 1. Objective

The integration point. This is what has to make the product *Nest-native* rather than "an admin bolted on beside the app" — the main charge against AdminJS.

Principle: **reuse Nest, reimplement nothing.** Filament rewrites neither Laravel's auth nor its policies; we rewrite neither Nest's guards nor its DI.

## 2. Installation API

```ts
@Module({
  imports: [
    PanelModule.forRoot({
      id: 'admin',
      path: '/admin',
      resources: [UserResource, PostResource, OrderResource],
      pages: [SettingsPage],
      guards: [JwtAuthGuard, AdminRoleGuard],      // existing Nest guards
      brand: { name: 'Acme', logo: '/logo.svg' },
      colors: { primary: 'indigo' },
      navigationGroups: ['Access', 'Content', 'Commerce'],
    }),
  ],
})
export class AdminModule {}
```

**Product goal: this configuration + one resource = a working panel.** Time-to-first-CRUD < 15 min.

## 3. Resource discovery

Two modes, in this order of precedence:

1. **Explicit** — the `resources: []` array. Recommended, predictable, tree-shakable.
2. **By folder scan** (v0.2) — `discoverResources({ in: 'src/**/*.resource.ts' })`, in the manner of Filament's `discoverResources()`.

Every resource is **instantiated by the Nest container**, and therefore gets ordinary dependency injection. That is non-negotiable: it is what lets a resolver call a business service (`this.cities.byCountry(...)`).

Resources are resolved **once at bootstrap**; the schema tree is rebuilt per request (immutability, PRD 02 §3.4).

## 4. Routing

| Route | Role |
|---|---|
| `GET {path}` | the panel's HTML shell (one page, static assets) |
| `GET {path}/assets/*` | assets from `@perchjs/ui` |
| `{path}/api/*` | the 4 protocol routes (PRD 03 §3) |

All API routes are registered **dynamically** by the module, never written by hand by the user. Nest's global prefix (`setGlobalPrefix`) and versioning must be respected.

## 5. Authentication & authorization

### 5.1 Position

**We do not provide auth.** No login page, no password reset, no MFA. Filament provides them because Laravel has a canonical auth system; Node does not — every app has its own (Passport, JWT, Clerk, Auth.js, sessions, and so on). Providing ours would create a conflict in 100% of existing apps.

**We provide a plug-in point.** The guards passed to `forRoot()` apply to every panel route. The authenticated user is extracted through a configurable `UserResolver` and injected into the `ResolverContext`.

### 5.2 Per-resource authorization

```ts
@PanelResource({ model: 'Post' })
export class PostResource {
  can = {
    viewAny: (u: User) => u.role !== 'guest',
    view:    (u: User, r: Post) => r.authorId === u.id || u.isAdmin,
    create:  (u: User) => u.can('post.create'),
    update:  (u: User, r: Post) => r.authorId === u.id,
    delete:  (u: User) => u.isAdmin,
  };
}
```

**Security invariants:**

- A `viewAny` refusal removes the navigation entry **and** protects the routes (not only the UI).
- Authorization is checked **on the server on every request**, never inferred from the client.
- Default when `can` is absent: **allowed** (the panel already sits behind the guards). Documented explicitly, because it is a debatable choice.

## 6. Navigation

- Items generated from the resources (label, icon, group, sort order, dynamic badge).
- Groups declared at panel level, with a stable order.
- Dynamic badge: `navigationBadge: () => this.orders.pendingCount()` — resolved on the server, cached per request.
- Automatic filtering by authorization.
- v0.3: **Clusters** (grouping resources that share a sub-navigation), like Filament.

## 7. Custom pages (v0.2)

A page is a class with a schema and no Prisma model behind it. Use cases: settings, documentation, an import screen, a business dashboard.

```ts
@PanelPage({ path: 'settings', navigationGroup: 'System', icon: 'cog' })
export class SettingsPage {
  schema() { return Schema.make([ /* … */ ]); }
  async submit(state: State) { /* … */ }
}
```

In v0.3, the page's structure itself becomes a schema (`content()`), taking up Filament v4's major addition: reorganizing a page without publishing a template.

## 8. Multi-tenancy (v0.3, architecture planned in v0.1)

Filament v4 **automatically scopes every panel query to the current tenant and associates new records with the tenant**. That is powerful and dangerous: its own documentation points to security considerations.

Decisions to carve in from v0.1, even without implementing:

- Scoping happens in the `DataAdapter`, **not** in the resources — otherwise one forgotten resource becomes a data leak.
- The current tenant lives in a request context (`AsyncLocalStorage`), never in a module variable.
- A resource that is explicitly not scoped has to **declare** it (`tenantScoped: false`), so that an audit can be done by grep.
- Mandatory test: a request from tenant A never returns a row from tenant B, on any route.

## 9. Acceptance criteria

1. `PanelModule.forRoot()` + one resource → a working panel with CRUD, in < 15 min for a developer seeing the tool for the first time.
2. An existing Nest guard protects the panel with no adapter code.
3. A resolver can inject and call an arbitrary Nest service.
4. `can.viewAny` at `false` removes the navigation item **and** returns 404 on the resource's routes.
5. The panel coexists with `setGlobalPrefix('api')` without route collisions.
6. Bootstrap on 30 resources < 500 ms.
7. No access to `@perchjs/prisma` from this package (it goes through the `DataAdapter` interface).

## 10. Out of scope

- Login, register, password reset, email verification, MFA.
- Impersonation.
- Role/permission management (we consume the app's).
- Multiple panels (v0.3).
- The Fastify adapter in v0.1 (Express only; the Nest abstraction has to allow both later).

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Refusing to provide auth is read as a gap | Medium | documented recipes for Passport-JWT, sessions, Clerk, Auth.js |
| The "allowed" default causes a leak for some user | High | a warning in the docs + a bootstrap warning if no resource declares `can` |
| Tenant scoping is bypassed by a custom query | **Critical** | scoping at adapter level, never at resource level; cross-tenant test in CI |
| Route conflicts with the host app | Medium | configurable prefix + collision detection at bootstrap |
