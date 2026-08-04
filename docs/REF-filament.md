# Référence — Filament déconstruit

*Document de recherche. La cible fonctionnelle de Perch, et pourquoi elle fonctionne.*
*Relevé au 4 août 2026, sur `filamentphp.com` et sa documentation v5.*

## 1. Ce que c'est

Pas un template d'admin : **un framework UI complet pour Laravel**.

> « Build apps & admin panels fast, for your bright ideas. With a solid Laravel foundation and a polished UI, you can focus on what makes your product unique. »

**Traction :** 31,7K+ étoiles GitHub · 19,5K+ membres Discord · 32,8M+ téléchargements · **949+ plugins communautaires**. Version stable : v5.

**Socle :** le TALL stack — Tailwind, Alpine.js, Laravel, **Livewire**, ce dernier décrit par Filament comme *« la réactivité pilotée par le serveur pour construire des interfaces dynamiques sans écrire d'API »*.

**Taxon en six blocs** : Tables · Forms · Infolists · Notifications · Dashboard widgets · Action modals.

## 2. Les quatre couches

| Couche | Rôle |
|---|---|
| Panel builder | routing, auth, navigation, clusters, multi-tenancy |
| Resources | *« le cœur de ton application »* — CRUD pour les modèles, avec List / Create / Edit générés d'office (+ View optionnel), et l'item de sidebar enregistré automatiquement |
| Schemas | moteur déclaratif unifié — forms, infolists, layouts, et depuis la v4 la structure des pages elles-mêmes |
| Actions & Notifications | modales, confirmations, retour utilisateur |

Le fait technique décisif : **chaque page d'un panel est un composant Livewire**. On écrit du PHP, on obtient de l'interactif sans JavaScript.

## 3. Les six pré-conditions

C'est l'analyse qui a déterminé le choix d'écosystème (ADR 0001). Filament n'est pas portable « parce que c'est du CRUD » — il repose sur un empilement :

1. **Un ORM introspectable à l'exécution.** `TextColumn::make('author.name')` fonctionne parce qu'Eloquent résout relations, casts et attributs dynamiquement.
2. **De la métaprogrammation.** Attributs PHP, réflexion, late static binding → le DSL fluide.
3. **Un rendu réactif piloté par le serveur.** Le pilier le plus dur à remplacer.
4. **Un framework hôte à conventions fortes.** Filament ne réimplémente ni l'auth, ni les policies, ni les migrations, ni les queues, ni la validation. Il branche Laravel.
5. **Un gestionnaire de paquets et une culture de plugins.** Le vrai fossé concurrentiel.
6. **Un moteur de composants côté serveur.**

**Corollaire :** la proposition de valeur est la **vélocité**. L'écosystème cible doit donc être peuplé de gens qui optimisent la vélocité.

## 4. Deux leçons héritées de leurs erreurs

Les deux corrections que Filament a dû apporter, devenues des contraintes de conception chez nous :

| Problème rencontré | Correction Filament | Conséquence pour Perch |
|---|---|---|
| Le rendu des cellules de table s'écroulait sur les gros volumes — composants Blade profondément imbriqués | **réécriture complète** du rendu en v4 | **rendu de cellule plat imposé dès le premier commit** (PRD 07 §2) |
| Le découpage du terme de recherche globale en mots s'écroulait sur de gros jeux de données | option `$shouldSplitGlobalSearchTerms` pour le désactiver | **pas de découpage par défaut** (PRD 05 §8) |

Reprendre les corrections sans repasser par les erreurs est le principal avantage d'arriver après.

## 5. Paysage concurrentiel

### Node / TypeScript — encombré

| Produit | Approche | Sa limite |
|---|---|---|
| **AdminJS** (~8k ⭐) | auto-génère depuis Sequelize, TypeORM, Mongoose ou Prisma ; s'intègre à Express, Hapi, Koa, NestJS, Fastify | boîte noire montée à côté ; le custom devient un combat |
| **Refine** (~29k ⭐) | headless | l'utilisateur écrit le frontend |
| **react-admin** | data providers | idem |
| **Payload** (~42k ⭐) | code-first, config TypeScript, tourne comme plugin Next.js depuis la v3 | CMS devenu framework, arrimé à Next.js |
| **KeystoneJS** (~10k ⭐) | schema-first, GraphQL | activité de développement faible |

### Rust — champ presque libre

- **Loco** (~8,9k ⭐) — « Rails pour Rust », générateurs, SeaORM, jobs, mailers. Pas de couche UI.
- **axum-admin** (2026) — CRUD depuis des entités, SSR MiniJinja, HTMX + Alpine, RBAC Casbin, hooks, agnostique à l'ORM. Explicitement inspiré de Django Admin et Laravel Nova.
- **SeaORM Pro** — CRUD complet sur modèles SeaORM, tier Plus réservé aux sponsors.

### Go — vide, depuis longtemps

- **GoAdmin** — encore sur pjax et thèmes AdminLTE.
- **QOR Admin** — sous 900 étoiles.
- **go-advanced-admin** — naissant.

Un champ vide depuis dix ans n'est pas seulement une opportunité.

## 6. Modèle économique observé

Utile pour savoir ce qui a une valeur marchande — voir PRD 11 §6.

| Levier | Ce que fait Filament |
|---|---|
| Sponsoring par tiers | GitHub Sponsors — Agency Partner, Gold, Silver, Bronze ; logos sur le site et dans la doc |
| **Plugins officiels payants** | vend *Custom Dashboards* (dashboards en drag & drop) tout en gardant le framework gratuit |
| Marché de plugins tiers | héberge le catalogue de 949+ plugins sans prendre de commission |
| Consulting | page dédiée, réseau d'agences partenaires |
| Shop | goodies |

**Le signal le plus informatif :** ce qu'ils choisissent de vendre. Les dashboards configurables en drag & drop sont donc hors du cœur de Perch (PRD 09), et listés comme candidat commercial.

## 7. Ce qui fait vraiment leur fossé

Un témoignage du site, plus révélateur que les chiffres :

> Dès qu'on rencontre quelque chose qui n'est pas déjà dans le framework, la communauté a presque toujours résolu le problème avec un plugin.

**949+ plugins n'est pas une conséquence du succès, c'est la cause.** D'où la décision de concevoir le contrat d'extensibilité en v0.1 alors que l'API publique n'arrive qu'en v2 — c'est la seule chose de tout le projet qu'on ne peut pas rétrofitter.
