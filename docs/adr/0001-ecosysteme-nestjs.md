# ADR 0001 — NestJS plutôt que Go ou Rust

**Statut :** acceptée · **Portée :** Perch · **Rouverte 3 fois avant d'être tranchée**

## Contexte

Construire un équivalent de Laravel Filament suppose six pré-conditions, dérivées de l'analyse de Filament (voir `../REF-filament.md`) :

1. un ORM introspectable à l'exécution
2. de la métaprogrammation
3. un modèle de rendu réactif piloté par le serveur
4. **un framework hôte à conventions fortes**
5. un gestionnaire de paquets et une culture de plugins
6. un moteur de composants côté serveur

Filament ne réimplémente ni l'auth, ni les policies, ni la validation, ni les migrations, ni les queues, ni l'injection de dépendances. Il **branche Laravel**. La pré-condition 4 est donc la plus lourde de conséquences.

## Options

| | Introspection runtime | Framework hôte | Concurrence | Public cherchant la vélocité |
|---|---|---|---|---|
| **Go** | **la meilleure des trois** — `reflect` + struct tags, le plus proche d'Eloquent | **aucun** — Gin, Echo, Chi sont des routeurs | faible : GoAdmin sur pjax/AdminLTE, QOR sous 900 étoiles | partiel |
| **Rust** | la pire — compilation uniquement, pas de réflexion | Loco (~8,9k étoiles), sans couche UI | axum-admin existe déjà, SeaORM Pro couvre le CRUD | **le plus faible des trois** |
| **NestJS** | bonne — décorateurs + `reflect-metadata`, DMMF Prisma | **oui** — modules, DI, guards, interceptors, CLI | **forte** : Payload ~42k, Refine ~29k, AdminJS ~8k | fort |

## Décision

**NestJS.** Pas parce que Node est supérieur, mais parce que c'est le seul écosystème où l'on n'a pas à construire *aussi* le framework hôte.

En Go, le périmètre passe de « un framework UI » à « un framework web **plus** un framework UI » — ×3, en solo. C'est l'écueil dans lequel le projet meurt.

En Rust, deux arguments s'ajoutent : la métaprogrammation est compile-time, or **le vrai fossé concurrentiel est l'écosystème de plugins** (949+ chez Filament) — une base lourde en proc macros a un vivier de contributeurs minuscule, donc on optimiserait contre son propre atout. Et la promesse « ship fast » adresse la plus petite intersection possible dans un langage dont la promesse est « correctness first ».

## Conséquences

- La concurrence est le vrai risque, pas la faisabilité. La différenciation doit être **la profondeur d'intégration Nest** : guards, DI, modules, policies existants réutilisés sans adaptation.
- Un champ vide depuis dix ans en Go n'est pas seulement une opportunité — c'est aussi un signal de demande. Assumé.
- L'argument technique honnête pour Go (`reflect` natif) est réel et perdu. Compensé par le DMMF de Prisma (ADR 0002).

## Règle de réouverture

Trois conditions, et rien d'autre :

1. Le jalon **A1** s'avère inélégant ou lent en TypeScript — problème d'architecture, pas de langage, mais mérite réexamen.
2. Un concurrent Node livre exactement ce produit avant nous.
3. Le public réel s'avère être infra/DevOps plutôt que produit.

**Test bon marché disponible :** le spike A1 représente environ deux jours dans chaque langage. En cas de doute persistant, l'écrire en Go *et* en TypeScript et laisser le code trancher — plutôt que de raisonner une quatrième fois.
