# PRD 00 — Master · Projet « Perch »

> Un framework UI open-source pour NestJS. Définis une resource en TypeScript, obtiens un panel complet, n'écris jamais de front.

| | |
|---|---|
| **Nom** | **Perch** — scope npm `@perchjs/*` vérifié libre · marque à déposer (voir §14) |
| **Statut** | Draft v1 — pré-implémentation |
| **Objectif produit** | Build apps & admin panels fast — vélocité de livraison |
| **Stack cible** | NestJS + Prisma + PostgreSQL + React |
| **Licence visée** | MIT (cœur) |

---

## 1. Référence : ce que fait Filament

Filament est la cible fonctionnelle à égaler. Ce n'est pas un template d'admin, c'est un framework UI complet pour Laravel.

**Traction observée (site officiel, 2026)** : 31,7K+ étoiles GitHub · 19,5K+ membres Discord · 32,8M+ téléchargements · **949+ plugins communautaires**. Version stable : v5.

**Sa promesse** : « Build apps & admin panels fast, for your bright ideas. With a solid Laravel foundation and a polished UI, you can focus on what makes your product unique. »

**Son socle technique** : le TALL stack — Tailwind, Alpine.js, Laravel, **Livewire**. Livewire est décrit par Filament comme de la *« réactivité pilotée par le serveur pour construire des interfaces dynamiques sans écrire d'API »*. C'est le pilier à reproduire, pas la couche cosmétique.

**Son taxon fonctionnel** (6 blocs annoncés en page d'accueil) : Tables · Forms · Infolists · Notifications · Dashboard widgets · Action modals.

## 2. Problème

Un dev backend Node/Nest qui doit livrer un back-office a trois mauvaises options :

1. **AdminJS** — auto-génère depuis les modèles, mais c'est une boîte noire montée à côté de l'app. Dès que le besoin sort du CRUD, on se bat contre l'outil.
2. **Refine / react-admin** — puissants, mais l'utilisateur doit écrire le frontend. Le coût est déplacé, pas supprimé.
3. **Payload** — excellent, mais c'est un CMS devenu framework, arrimé à Next.js, avec son propre modèle de données.

Aucun ne propose l'expérience Filament : **je décris mon UI en backend, dans mon framework, avec mes conventions, et l'UI est réactive sans que j'écrive de JS.**

## 3. Proposition de valeur

> **Définis une resource en TypeScript. Obtiens un panel complet. N'écris jamais de front.**

**Différenciation par rapport à chaque concurrent :**

| Concurrent | Sa limite | Notre réponse |
|---|---|---|
| AdminJS | boîte noire, custom = combat | tout surchargeable par composition (modèle Schemas) |
| Refine / react-admin | l'utilisateur écrit le front | l'utilisateur n'écrit que du backend |
| Payload | CMS-first, Next.js-first | Nest-first, s'intègre dans l'app Nest existante |
| Directus / Strapi | data model imposé | ton schéma Prisma est la source de vérité |

## 4. Personas

| # | Persona | Besoin | Critère de succès |
|---|---|---|---|
| P1 | **Dev backend Nest solo / petite équipe** | livrer un back-office en jours, pas en semaines | premier CRUD utilisable en < 15 min |
| P2 | **Équipe produit avec app Nest existante** | ajouter un panel sans réécrire l'auth ni le data model | branche les guards Nest existants sans code d'adaptation |
| P3 | **Auteur de plugin** (v2+) | étendre les panels d'autrui | publie un package npm qui injecte champs/pages/actions |
| P4 | **Utilisateur final du panel** (non-dev) | interface rapide, claire, sans jank | table de 10k lignes fluide, formulaires réactifs |

## 5. Principes directeurs (non négociables)

1. **L'état est autoritatif côté serveur.** C'est l'essence de Livewire, donc de Filament. Le client est un renderer, pas la source de vérité.
2. **Zéro JS demandé à l'utilisateur** pour tout le périmètre couvert.
3. **Composition, pas configuration.** Tout objet est un builder immuable et surchargeable. Aucune option booléenne « magique » qui bloque l'extension.
4. **Réutiliser Nest, ne pas le réimplémenter.** Auth, guards, DI, validation, modules, logging : on branche, on ne recrée pas.
5. **Prisma est la source de vérité du data model.** On n'introduit jamais un second schéma.
6. **Type-safety de bout en bout.** Un chemin de champ invalide doit échouer à la compilation, pas au runtime.
7. **Le contrat d'extensibilité est conçu en v0.1**, même si les plugins n'arrivent qu'en v2. On ne rétrofitte pas une architecture de plugins.

## 6. Inventaire exhaustif Filament → décisions Perch

Périmètre complet relevé dans la doc officielle (v4.x/5.x), avec tier d'attribution.

### 6.1 Panel & configuration

| Fonctionnalité Filament | Décision | Tier | PRD |
|---|---|---|---|
| Panel configuration (id, path, colors, brand) | Reprendre, via `PanelModule.forRoot()` | v0.1 | 04 |
| Multi-panels dans une app | Reprendre | v0.3 | 04 |
| Navigation : sidebar, groupes, tri, badges | Reprendre | v0.1 | 04 |
| Navigation : Clusters (regroupement de resources) | Reprendre | v0.3 | 04 |
| User menu | Reprendre | v0.2 | 04 |
| Custom pages (canvas libre) | Reprendre | v0.2 | 04 |
| Auth : login, register, password reset, email verify | **Ne pas reproduire** — brancher les guards Nest | v0.1 | 04 |
| Auth : MFA / 2FA | Hors périmètre, laissé à l'app hôte | — | — |
| Multi-tenancy avec scoping auto des requêtes | Reprendre (architecture prévue dès v0.1) | v0.3 | 04 |
| Global search (multi-resources) | Reprendre | v0.3 | 05 |
| Render hooks (injection de contenu par position) | Reprendre — clé pour les plugins | v0.2 | 11 |
| Registering assets (CSS/JS de plugin) | Reprendre | v0.2 | 11 |
| Modular architecture (DDD) | Natif : les modules Nest le font déjà | v0.1 | 04 |
| Deployment guide | Doc | v0.2 | — |

### 6.2 Resources

| Fonctionnalité | Décision | Tier | PRD |
|---|---|---|---|
| Pages List / Create / Edit générées | Reprendre | v0.1 | 05 |
| Page View (lecture seule, infolist) | Reprendre | v0.2 | 05 |
| Deleting + soft deletes + restore / force delete | Reprendre | v0.2 | 05 |
| Managing relationships (relation managers) | Reprendre | v0.2 | 05 |
| Nested resources (parent/enfant, routing + breadcrumbs) | Reprendre | v0.3 | 05 |
| Singular resources (une seule instance, ex. Settings) | Reprendre | v0.3 | 05 |
| Widgets sur pages de resource | Reprendre | v0.3 | 09 |
| Custom resource pages | Reprendre | v0.2 | 05 |
| Redirection configurable après création | Reprendre | v0.2 | 05 |

### 6.3 Schemas (le moteur déclaratif)

| Fonctionnalité | Décision | Tier | PRD |
|---|---|---|---|
| Arbre de composants unifié (forms + infolists + layout) | **Cœur.** Reprendre intégralement | v0.1 | 02 |
| Layouts : Grid, colonnes responsives, `columnSpan` | Reprendre | v0.1 | 02 |
| Sections (repliables, avec description, icône) | Reprendre | v0.1 | 02 |
| Tabs | Reprendre | v0.2 | 02 |
| Wizards (formulaires multi-étapes) | Reprendre | v0.3 | 02 |
| Callouts | Reprendre | v0.2 | 02 |
| Empty states | Reprendre | v0.2 | 02 |
| Prime components (texte, image, icône statiques) | Reprendre | v0.2 | 02 |
| Custom components (échappatoire React) | Reprendre | v0.2 | 03 |
| Page schema (`content()` — structure de page pilotée par schéma) | Reprendre — apport majeur de v4 | v0.3 | 04 |

### 6.4 Forms — catalogue de champs

| Champ Filament | Tier | Champ Filament | Tier |
|---|---|---|---|
| TextInput | v0.1 | Repeater | v0.2 |
| Textarea | v0.1 | Builder (blocs polymorphes) | v0.3 |
| Select (+ relationship, searchable, multiple, createOption) | v0.1 | TagsInput | v0.2 |
| Checkbox | v0.1 | KeyValue | v0.2 |
| Toggle | v0.1 | ColorPicker | v0.2 |
| Radio | v0.1 | ToggleButtons | v0.2 |
| CheckboxList | v0.2 | Slider | v0.3 |
| DateTimePicker | v0.1 | CodeEditor | v0.3 |
| FileUpload | v0.1 | Hidden | v0.1 |
| RichEditor (Filament v4 : TipTap, pas Trix) | v0.2 | MarkdownEditor | v0.2 |
| Custom fields (API d'extension) | v0.2 | Validation | v0.1 |

Détail des comportements transverses (`->required()`, `->live()`, `->visible()`, `->disabled()`, `->helperText()`, `->default()`, `->afterStateUpdated()`, `->dehydrated()`) : voir PRD 06.

### 6.5 Tables

| Fonctionnalité | Décision | Tier | PRD |
|---|---|---|---|
| Colonnes : Text, Icon, Image, Color, Select, Toggle, Checkbox | v0.1 (Text, Icon) / v0.2 (reste) | | 07 |
| Colonnes de relation (`user.email`) | Reprendre | v0.1 | 07 |
| Recherche (globale + par colonne), tri | Reprendre | v0.1 | 07 |
| Pagination | Reprendre | v0.1 | 07 |
| Filtres : Select, Ternary, Date range, Query builder | v0.1 (Select, Text) / v0.2 / v0.3 | | 07 |
| Actions de ligne + bulk actions | Reprendre | v0.1 | 07 |
| Layout responsive (split, stack, panels) | Reprendre | v0.2 | 07 |
| Summaries (agrégats en pied de colonne) | Reprendre | v0.3 | 07 |
| Grouping rows | Reprendre | v0.3 | 07 |
| Empty state configurable | Reprendre | v0.2 | 07 |
| Custom data (source non-ORM : API, tableau) | Reprendre | v0.3 | 07 |
| Réordonnancement drag & drop | Reprendre | v0.3 | 07 |
| **Perf** : Filament v4 a réécrit le rendu des cellules pour les grandes tables | Contrainte de conception dès v0.1 | v0.1 | 07 |

### 6.6 Actions & Notifications

| Fonctionnalité | Décision | Tier | PRD |
|---|---|---|---|
| Actions : Create, Edit, View, Delete | v0.1 | | 08 |
| Actions : Replicate, ForceDelete, Restore | v0.2 | | 08 |
| Actions : Import / Export (CSV) | v0.3 | | 08 |
| Modales : confirmation, formulaire, slide-over | v0.1 | | 08 |
| Grouping actions (dropdown) | v0.2 | | 08 |
| Autorisation par action | v0.1 | | 08 |
| Exécution synchrone ou en queue | v0.3 | | 08 |
| Notifications in-app (toast) | v0.1 | | 08 |
| Notifications persistées en base | v0.3 | | 08 |
| Notifications broadcast (temps réel) | v0.3 | | 08 |

### 6.7 Infolists & Widgets

| Fonctionnalité | Décision | Tier | PRD |
|---|---|---|---|
| Entries : Text, Icon, Image, Color, Code, KeyValue, Repeatable | v0.2 | | 09 |
| Custom entries | v0.2 | | 09 |
| Widgets : Stats overview | v0.3 | | 09 |
| Widgets : Charts | v0.3 | | 09 |
| Widgets : Table widget | v0.3 | | 09 |
| Dashboard configurable | v0.3 | | 09 |
| Dashboards drag & drop | **Hors périmètre** — c'est un plugin payant chez Filament | v2+ | 11 |

### 6.8 Styling, Testing, DX

| Fonctionnalité | Décision | Tier | PRD |
|---|---|---|---|
| Thème unique soigné | v0.1 | | 03 |
| Couleurs / icônes configurables | v0.2 | | 03 |
| CSS hooks (classes stables pour surcharge) | v0.2 | | 03 |
| Dark mode | v0.1 | | 03 |
| Thèmes custom | v0.3 | | 03 |
| Helpers de test (resources, tables, schemas, actions) | v0.2 | | 10 |
| CLI de génération (`nest g panel-resource`) | v0.1 | | 10 |
| Doc + guide d'upgrade | v0.2 | | — |
| Usage hors panel (composants standalone) | **Hors périmètre v1** | v2+ | — |

## 7. Architecture — monorepo, 5 packages

| Package | Responsabilité | Dépend de |
|---|---|---|
| `@perchjs/core` | moteur de schémas : `Component`, `Field`, `Column`, `Action`, résolution d'état, validation. **Aucune dépendance Nest ni Prisma.** | — |
| `@perchjs/prisma` | adaptateur métadonnées (DMMF → IR) + exécution des requêtes | core |
| `@perchjs/nest` | `PanelModule` : découverte des resources, routing, guards, tenancy | core |
| `@perchjs/ui` | renderer React + registre de champs (livré compilé) | core (types only) |
| `@perchjs/cli` | génération de code | core |

La frontière `core` ↔ `prisma` est ce qui permettra d'ajouter Drizzle plus tard sans réécriture. **On ne l'implémente pas en v0.1, on ne la franchit jamais.**

## 8. Roadmap par tier

| Tier | Nom | Contenu | Critère de sortie |
|---|---|---|---|
| **v0.1** | *Spike* | Prisma+Postgres · CRUD List/Create/Edit · 10 champs · belongsTo/hasMany · filtres select+text · actions ligne+bulk · modales · notifications toast · auth branchée · 1 thème | Les 4 critères d'acceptation du §9 passent |
| **v0.2** | *Usable* | Page View + infolists · relation managers · soft deletes · Repeater · Tabs · custom pages · render hooks · custom fields · helpers de test · doc | Un tiers construit un panel réel sans aide |
| **v0.3** | *Complete* | tenancy · global search · widgets/dashboard · wizards · Builder · summaries · grouping · import/export · nested & singular resources · thèmes | Parité fonctionnelle ≈ Filament v3 |
| **v1.0** | *Stable* | API gelée · guide d'upgrade · perf validée à 100k lignes | Engagement de stabilité publique |
| **v2+** | *Ecosystem* | API de plugins publique · registre · surface commerciale | Voir PRD 11 |

## 9. Critères d'acceptation v0.1 (les 4 cas durs)

Ce sont les jalons. Chacun valide une décision d'architecture. **Dans cet ordre.**

| # | Cas | Valide | Bloquant |
|---|---|---|---|
| **A1** | Select dépendant réactif pays → ville, zéro JS utilisateur | le protocole d'état | **Oui — si A1 n'est pas élégant, redessiner le protocole avant tout le reste** |
| **A2** | Table : colonne de relation + filtre + bulk action + modale de confirmation | la couche requêtes | Oui |
| **A3** | Repeater imbriqué sauvegardant une relation hasMany en transaction | l'arbre de schéma + persistance | Oui |
| **A4** | Un module Nest tiers injecte un champ dans une resource existante | l'extensibilité | Oui — sans A4, aucun écosystème n'est possible |

## 10. Métriques de succès

| Métrique | Cible v0.2 | Cible v1.0 |
|---|---|---|
| Time-to-first-CRUD (dev n'ayant jamais vu l'outil) | < 15 min | < 10 min |
| Lignes de code utilisateur pour un CRUD complet | < 40 | < 30 |
| Lignes de JS écrites par l'utilisateur | **0** | **0** |
| Latence p95 d'un round-trip d'état réactif | < 150 ms | < 80 ms |
| Rendu d'une table de 10k lignes paginée | < 300 ms | < 150 ms |
| Étoiles GitHub | 500 | 5 000 |
| Plugins tiers | 0 (API non publiée) | 10 |

## 11. Surface de monétisation — **hors périmètre actuel**

Documenté pour que l'architecture ne la ferme pas, pas pour être construit. Modèle observé chez Filament :

1. **Sponsoring par tiers** (Agency Partner / Gold / Silver / Bronze) via GitHub Sponsors — le cœur reste MIT.
2. **Plugins officiels payants.** Filament vend par ex. son plugin *Custom Dashboards* (dashboards en drag & drop) tout en gardant le framework gratuit.
3. **Marché de plugins tiers**, dont des plugins commerciaux (tables enrichies, command palette…). Filament héberge le catalogue mais ne vend pas.
4. **Consulting** et **shop** (goodies).

**Décision** : le cœur reste MIT et complet. Toute monétisation future passe par des plugins, jamais par la mutilation du cœur. **Conséquence architecturale immédiate** : le contrat d'extensibilité (PRD 11) doit être conçu en v0.1 — c'est la seule chose qu'on ne peut pas rétrofitter.

## 12. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Le protocole d'état ne tient pas la charge / la latence | Fatal | A1 en premier jalon ; budget latence explicite |
| Le DSL est laid et personne ne l'aime | Fatal | Écrire le fichier `UserResource` cible **avant** tout moteur |
| Dérive de périmètre vers un CMS | Élevé | Non-goals écrits dans le README dès le jour 1 |
| Le type-safety des chemins de champs est trop complexe | Moyen | Fallback : `string` typé faiblement en v0.1, durcissement en v0.2 |
| Concurrence (Payload, Refine, AdminJS) | Moyen | Positionnement Nest-native, non frontal |
| Marque « Perch » indisponible | Faible | Vérifier npm + INPI/USPTO avant publication |

## 13. Non-goals — v1.0

Écrits dans le README dès le premier commit :

- Ce n'est **pas un CMS** (pas de gestion de contenu, pas d'API de contenu, pas de multi-projets).
- Ce n'est **pas un builder visuel** (pas de drag & drop de champs, pas de génération d'UI par clic).
- Ce n'est **pas multi-ORM** en v1 (Prisma seulement).
- Ce n'est **pas multi-base** en v1 (PostgreSQL seulement).
- Ce n'est **pas un remplaçant de l'auth** de l'app hôte.
- Pas de GraphQL, pas de Mongo, pas d'i18n en v0.1.

## 14. Nom, marque et défense

### 14.1 Décision

**Perch.** Le perchoir : le poste d'observation sur tes données.

Principe directeur du nommage, appris à nos dépens : **un nom de dev tool ne porte pas la thèse du produit.** Filament ne dit pas « admin panel » — il dit « fil incandescent », et c'est l'ampoule du logo plus la baseline *« for your bright ideas »* qui portent le sens. Prisma sépare la lumière. Keystone tient l'arc. Le nom porte une **image appropriable** ; le logo et la baseline portent l'argument.

Critères retenus : appropriable · court et dictable · scope npm libre · **pas sémantiquement faux**. Rien de plus. Exiger d'un nom qu'il argumente produit des métaphores à trois sauts que personne ne décode.

### 14.2 Risque résiduel assumé

« Perch » connote l'observation, pas la construction — il rétrécit vers le tableau de bord alors que le produit vise « build apps ». **La baseline doit porter la moitié manquante :**

> **Perch** — le poste d'observation de ton app Nest.
> Déclare en TypeScript. Regarde apparaître.

Le second vers fait le travail que le nom ne fait pas. Il n'est pas optionnel.

### 14.3 Défense rhétorique

- **Une ligne d'origine dans le README**, jamais plus. Une entrée « Why the name? » dans la FAQ.
- **Ne jamais débattre d'un nom dans un fil de PR.** Le bikeshedding sur les noms est infini et sans issue. Réponse unique : lien vers la FAQ.
- Le nom est une **décision close**, pas une proposition ouverte. Le dire explicitement dans `CONTRIBUTING.md`.

### 14.4 Défense pratique — par ordre de priorité

| # | Action | Coût | Urgence |
|---|---|---|---|
| 1 | Réserver l'organisation npm `perch` et publier un `@perchjs/core@0.0.0` placeholder | 5 min | **aujourd'hui** |
| 2 | Recherche d'antériorité de marque, **classes 9 et 42**, FR (INPI) + UE (EUIPO) + US (USPTO) | quelques heures | **avant toute ligne de code** |
| 3 | Vérifier le statut du CMS PHP homonyme : marque vivante ou dormante, et dans quelle classe | 1 h | avant dépôt |
| 4 | Organisation GitHub, domaine `.dev`, handles sociaux | 1 h | semaine 1 |
| 5 | Dépôt de marque effectif | selon juridiction | avant la v0.1 publique |
| 6 | `TRADEMARK.md` dans le dépôt | 1 h | avant l'ouverture des plugins |

**Règle de décision sur l'antériorité :** s'il existe une marque vivante enregistrée en classe 9 ou 42 sur tes marchés cibles, **renomme maintenant**. Renommer coûte deux heures aujourd'hui et plusieurs mois après le premier millier d'utilisateurs.

*(Ceci n'est pas un avis juridique — je ne suis pas juriste. Une recherche d'antériorité par un conseil en propriété industrielle avant dépôt reste la seule vérification fiable.)*

### 14.5 Politique de marque (`TRADEMARK.md`)

À écrire avant d'ouvrir l'API de plugins, pas après — Filament en a une, et c'est ce qui permet de demander poliment un renommage sans conflit.

| Usage | Autorisé |
|---|---|
| « Plugin Perch pour X », « compatible Perch » | ✅ |
| `perch-plugin-x` sur npm | ✅ |
| Un fork nommé « Perch » | ❌ |
| Un produit commercial nommé « Perch Pro », « Perch Cloud » | ❌ |
| Le logo modifié | ❌ |

### 14.6 Repli

Si la recherche d'antériorité bloque : **Facet** — la face visible d'un cristal existe *à cause* du réseau interne. Scope `@facet` vérifié libre. Risque connu : collision de catégorie avec la recherche à facettes, courante dans l'outillage data.

## 15. Index des PRDs

| PRD | Titre | Tier principal |
|---|---|---|
| 01 | Couche métadonnées (Prisma → IR) | v0.1 |
| 02 | Moteur de schémas | v0.1 |
| 03 | Protocole d'état & renderer UI | v0.1 |
| 04 | PanelModule Nest : routing, auth, navigation | v0.1 |
| 05 | Resources & pages CRUD | v0.1 |
| 06 | Forms : catalogue de champs | v0.1 → v0.3 |
| 07 | Table builder | v0.1 → v0.3 |
| 08 | Actions, modales & notifications | v0.1 |
| 09 | Infolists, widgets & dashboard | v0.2 → v0.3 |
| 10 | CLI, codegen & testing | v0.1 |
| 11 | Extensibilité, plugins & écosystème | v0.1 (contrat) → v2 (public) |
