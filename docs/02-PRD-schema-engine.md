# PRD 02 — Moteur de schémas (`@perch/core`)

**Tier :** v0.1 · **Dépendances :** PRD 01 · **Débloque :** tout le reste

## 1. Objectif

Le cœur. Un arbre de composants déclaratif, composable et **résolu côté serveur**, qui unifie formulaires, vues en lecture seule et mise en page — exactement comme les **Schemas** de Filament, qui depuis la v4 englobent forms, infolists *et* la structure des pages.

`@perch/core` ne connaît **ni Nest, ni Prisma, ni React**. Il ne dépend que de l'interface `DataAdapter` (PRD 01).

## 2. Le DSL cible — à figer AVANT tout code

Ce fichier est le livrable n°1 du projet. S'il n'est pas agréable à lire, aucun moteur ne le sauvera.

```ts
@PanelResource({ model: 'User', navigationGroup: 'Access', icon: 'users' })
export class UserResource {
  constructor(private readonly cities: CityService) {}   // DI Nest normale

  form() {
    return Schema.make([
      Section.make('Identity').columns(2).schema([
        TextInput.make('name').required(),
        TextInput.make('email').email().unique(),
        Select.make('countryId').relationship('country', 'name').live(),
        Select.make('cityId')
          .options(({ get }) => this.cities.byCountry(get('countryId')))
          .visible(({ get }) => !!get('countryId'))
          .helperText('Choisis d\'abord un pays'),
      ]),
      Section.make('Addresses').collapsible().schema([
        Repeater.make('addresses').relationship().schema([
          TextInput.make('street').required(),
          TextInput.make('zip').maxLength(10),
        ]).minItems(1).maxItems(5),
      ]),
    ]);
  }
}
```

## 3. Modèle d'objets

### 3.1 Hiérarchie

```
Component (abstrait)
├── Field (a un state, participe à la validation)
│   ├── TextInput, Select, Toggle, DateTimePicker, …
│   └── ContainerField (a des enfants ET un state)
│       ├── Repeater
│       └── Builder
├── Layout (pas de state, groupe des enfants)
│   ├── Schema (racine), Grid, Section, Tabs, Wizard, Fieldset
├── Entry (lecture seule — PRD 09)
└── Prime (statique : Text, Image, Icon)
```

### 3.2 Contrat de base

```ts
abstract class Component {
  static make(name?: string): this;

  // Structure
  schema(children: Component[]): this;
  columnSpan(span: number | 'full' | Responsive): this;
  key(k: string): this;                 // identité stable pour le diff

  // Conditionnel — TOUJOURS évalué côté serveur
  visible(v: boolean | Resolver<boolean>): this;
  hidden(v: boolean | Resolver<boolean>): this;
  disabled(v: boolean | Resolver<boolean>): this;

  // Métadonnées
  label(l: string | Resolver<string>): this;
  helperText(t: string | Resolver<string>): this;

  // Extension (PRD 11)
  static configureUsing(fn: (c: this) => void): void;
  extend(fn: (c: this) => void): this;
}
```

### 3.3 Le `Resolver` — la clé de la réactivité

```ts
type Resolver<T> = (ctx: ResolverContext) => T | Promise<T>;

interface ResolverContext {
  get(path: FieldPath): unknown;     // lit l'état d'un autre champ
  set(path: FieldPath, v: unknown): void;
  record?: Row;                      // l'enregistrement en cours (Edit)
  operation: 'create' | 'edit' | 'view';
  user: unknown;                     // l'utilisateur authentifié
  livewireOf?: never;                // (rappel : pas de fuite de transport ici)
}
```

**Toute** option d'un composant accepte une valeur ou un `Resolver`. C'est ce qui remplace Livewire : le serveur réévalue les resolvers concernés à chaque changement d'état.

### 3.4 Immutabilité des builders

Chaque appel fluide retourne un **clone**. Raison : les composants sont définis une fois au bootstrap et réutilisés entre requêtes concurrentes. Un builder mutable = fuite d'état entre utilisateurs. **C'est un risque de sécurité, pas un détail de style.**

## 4. Cycle de résolution

Le lot le plus délicat. Séquence pour un changement d'état :

```
1. HYDRATE    état client + record → arbre d'état interne
2. APPLY      appliquer le patch { path, value }
3. HOOKS      exécuter afterStateUpdated() du champ modifié
              (peut set() d'autres champs → boucle contrôlée, max 5 passes)
4. RESOLVE    réévaluer visible / disabled / options / label
              UNIQUEMENT pour les composants dont les dépendances ont changé
5. PRUNE      retirer de l'état les champs devenus invisibles
6. VALIDATE   valider les champs visibles seulement
7. DEHYDRATE  produire { state, schemaPatch, errors }
```

**Graphe de dépendances.** À l'étape 4, réévaluer tout l'arbre est inacceptable en performance. Chaque `Resolver` déclare ses dépendances, soit explicitement (`.dependsOn(['countryId'])`), soit par **traçage** : au premier appel, on instrumente `get()` pour enregistrer les chemins lus. Décision : **traçage automatique**, avec `.dependsOn()` disponible comme échappatoire.

**Détection de cycle** : si deux passes produisent le même état, on s'arrête. Si 5 passes sont dépassées, on lève une erreur explicite nommant les champs impliqués (pas un stack overflow silencieux).

## 5. Type-safety des chemins de champs

L'exercice le plus exigeant du projet. Objectif :

```ts
TextColumn.make('author.country.name')   // ✅ compile
TextColumn.make('author.contry.name')    // ❌ erreur de compilation
```

Approche : types utilitaires générant l'union des chemins valides depuis les types Prisma générés, avec limite de profondeur pour éviter l'explosion de l'inférence.

```ts
type Paths<T, D extends number = 3> = D extends 0 ? never
  : { [K in keyof T & string]:
        T[K] extends object ? K | `${K}.${Paths<T[K], Prev[D]>}` : K
    }[keyof T & string];
```

**Décision de repli explicite** : si le coût de compilation dépasse **3 s sur un schéma de 50 modèles**, on livre v0.1 avec `string` faiblement typé + validation runtime au bootstrap, et on durcit en v0.2. Ne pas bloquer le produit sur un exploit de type-level.

## 6. Validation

- **Source de vérité** : le schéma déclaré, pas un DTO parallèle.
- **Moteur** : Zod, généré depuis l'arbre de composants. Choisi plutôt que `class-validator` car composable dynamiquement au runtime (indispensable quand la visibilité conditionne la validation).
- **Règles v0.1** : `required`, `email`, `url`, `minLength`, `maxLength`, `min`, `max`, `numeric`, `regex`, `unique` (async, avec `ignoreRecord`), `confirmed`, `in`.
- **Règles custom** : `.rule(fn)` synchrone ou async.
- **Invariant** : un champ invisible n'est **jamais** validé et **jamais** persisté.

## 7. Critères d'acceptation

1. **A1** — un `Select` dont les `options` dépendent d'un autre champ se met à jour après un seul round-trip, avec le champ dépendant masqué tant que le parent est vide.
2. Réévaluation ciblée : sur un formulaire de 40 champs, changer 1 champ réévalue ≤ 3 resolvers (mesuré par compteur).
3. Un champ masqué par `visible()` disparaît de l'état persisté.
4. Un `Repeater` de 3 lignes × 4 champs se valide, se sauvegarde et se recharge intégralement (**A3**).
5. Deux requêtes concurrentes sur la même resource ne partagent aucun état (test de concurrence sur 100 requêtes parallèles).
6. Un cycle `afterStateUpdated` lève une erreur nommant les champs, en < 5 passes.
7. `@perch/core` n'importe ni `@nestjs/*`, ni `@prisma/client`, ni `react` (vérifié par un test de dépendances).

## 8. Hors périmètre

- Wizards, Builder, Tabs → v0.2/v0.3 (l'architecture doit les permettre).
- Rendu : ce package ne produit **aucun** HTML. Il produit du JSON.
- Persistance : déléguée au `DataAdapter`.
- i18n.

## 9. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Le graphe de dépendances par traçage rate un cas | Élevé | `.dependsOn()` en échappatoire + mode debug listant les dépendances tracées |
| Explosion du temps de compilation TS | Moyen | repli documenté au §5 |
| Builders mutables → fuite d'état inter-requêtes | **Critique** | immutabilité imposée + test de concurrence en CI dès le premier jour |
| Le DSL diverge en 4 dialectes (form/table/infolist/page) | Élevé | une seule classe `Component` racine, comme les Schemas de Filament v4 |
