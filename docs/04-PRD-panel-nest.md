# PRD 04 — PanelModule Nest (`@perch/nest`)

**Tier :** v0.1 · **Dépendances :** PRD 02, 03 · **Débloque :** PRD 05

## 1. Objectif

Le point d'intégration. C'est ce qui doit rendre le produit *Nest-native* plutôt que « un admin monté à côté » — le reproche principal fait à AdminJS.

Principe : **réutiliser Nest, ne rien réimplémenter.** Filament ne réécrit ni l'auth ni les policies de Laravel ; on ne réécrit ni les guards ni la DI de Nest.

## 2. API d'installation

```ts
@Module({
  imports: [
    PanelModule.forRoot({
      id: 'admin',
      path: '/admin',
      resources: [UserResource, PostResource, OrderResource],
      pages: [SettingsPage],
      guards: [JwtAuthGuard, AdminRoleGuard],      // guards Nest existants
      brand: { name: 'Acme', logo: '/logo.svg' },
      colors: { primary: 'indigo' },
      navigationGroups: ['Access', 'Content', 'Commerce'],
    }),
  ],
})
export class AdminModule {}
```

**Objectif produit : cette configuration + une resource = un panel qui tourne.** Time-to-first-CRUD < 15 min.

## 3. Découverte des resources

Deux modes, dans cet ordre de priorité :

1. **Explicite** — le tableau `resources: []`. Recommandé, prévisible, tree-shakable.
2. **Par scan de dossier** (v0.2) — `discoverResources({ in: 'src/**/*.resource.ts' })`, à la manière du `discoverResources()` de Filament.

Chaque resource est **instanciée par le conteneur Nest**, donc bénéficie de l'injection de dépendances normale. C'est non négociable : c'est ce qui permet à un resolver d'appeler un service métier (`this.cities.byCountry(...)`).

Les resources sont résolues **une fois au bootstrap** ; l'arbre de schéma est reconstruit par requête (immutabilité, PRD 02 §3.4).

## 4. Routing

| Route | Rôle |
|---|---|
| `GET {path}` | shell HTML du panel (une page, assets statiques) |
| `GET {path}/assets/*` | assets de `@perch/ui` |
| `{path}/api/*` | les 4 routes du protocole (PRD 03 §3) |

Toutes les routes API sont enregistrées **dynamiquement** par le module, jamais écrites à la main par l'utilisateur. Le préfixe global Nest (`setGlobalPrefix`) et le versioning doivent être respectés.

## 5. Authentification & autorisation

### 5.1 Position

**On ne fournit pas d'auth.** Pas de page de login, pas de reset de mot de passe, pas de MFA. Filament les fournit parce que Laravel a un système d'auth canonique ; Node n'en a pas — chaque app a le sien (Passport, JWT, Clerk, Auth.js, session…). Fournir le nôtre créerait un conflit dans 100 % des apps existantes.

**On fournit un point de branchement.** Les guards passés à `forRoot()` s'appliquent à toutes les routes du panel. L'utilisateur authentifié est extrait via un `UserResolver` configurable et injecté dans le `ResolverContext`.

### 5.2 Autorisation par resource

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

**Invariants de sécurité :**
- Un refus `viewAny` retire l'entrée de navigation **et** protège les routes (pas seulement l'UI).
- L'autorisation est vérifiée **côté serveur à chaque requête**, jamais déduite du client.
- Défaut si `can` est absent : **autorisé** (le panel est déjà derrière les guards). Documenté explicitement, car c'est un choix discutable.

## 6. Navigation

- Items générés depuis les resources (label, icône, groupe, tri, badge dynamique).
- Groupes déclarés au niveau du panel, avec ordre stable.
- Badge dynamique : `navigationBadge: () => this.orders.pendingCount()` — résolu côté serveur, mis en cache par requête.
- Filtrage automatique par autorisation.
- v0.3 : **Clusters** (regroupement de resources partageant une sous-navigation), comme Filament.

## 7. Custom pages (v0.2)

Une page = une classe avec un schéma, sans modèle Prisma derrière. Cas d'usage : settings, documentation, écran d'import, tableau de bord métier.

```ts
@PanelPage({ path: 'settings', navigationGroup: 'System', icon: 'cog' })
export class SettingsPage {
  schema() { return Schema.make([ /* … */ ]); }
  async submit(state: State) { /* … */ }
}
```

En v0.3, la structure de la page elle-même devient un schéma (`content()`), reprenant l'apport majeur de Filament v4 : réorganiser une page sans publier de template.

## 8. Multi-tenancy (v0.3, architecture prévue en v0.1)

Filament v4 **scope automatiquement toutes les requêtes du panel au tenant courant et associe les nouveaux enregistrements au tenant**. C'est puissant et dangereux : sa propre doc renvoie vers des considérations de sécurité.

Décisions à graver dès v0.1, même sans implémenter :
- Le scoping se fait dans le `DataAdapter`, **pas** dans les resources — sinon une resource oubliée devient une fuite de données.
- Le tenant courant vit dans un contexte de requête (`AsyncLocalStorage`), jamais dans une variable de module.
- Une resource explicitement non scopée doit le **déclarer** (`tenantScoped: false`), pour que l'audit soit possible par grep.
- Test obligatoire : une requête du tenant A ne retourne jamais une ligne du tenant B, sur toutes les routes.

## 9. Critères d'acceptation

1. `PanelModule.forRoot()` + une resource → panel fonctionnel avec CRUD, en < 15 min pour un dev qui découvre l'outil.
2. Un guard Nest existant protège le panel sans une ligne d'adaptation.
3. Un resolver peut injecter et appeler un service Nest arbitraire.
4. `can.viewAny` à `false` retire l'item de navigation **et** renvoie 404 sur les routes de la resource.
5. Le panel cohabite avec `setGlobalPrefix('api')` sans collision de routes.
6. Bootstrap sur 30 resources < 500 ms.
7. Aucun accès à `@perch/prisma` depuis ce package (passe par l'interface `DataAdapter`).

## 10. Hors périmètre

- Login, register, reset password, email verification, MFA.
- Impersonation.
- Gestion des rôles/permissions (on consomme celle de l'app).
- Multi-panels (v0.3).
- Fastify adapter en v0.1 (Express uniquement ; l'abstraction Nest doit permettre les deux ensuite).

## 11. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Refuser de fournir l'auth est perçu comme une lacune | Moyen | recettes documentées pour Passport-JWT, session, Clerk, Auth.js |
| Défaut « autorisé » cause une fuite chez un utilisateur | Élevé | avertissement dans la doc + warning au bootstrap si aucune resource ne déclare `can` |
| Le scoping tenant est contourné par une requête custom | **Critique** | scoping au niveau adapter, jamais resource ; test cross-tenant en CI |
| Conflits de routes avec l'app hôte | Moyen | préfixe configurable + détection de collision au bootstrap |
