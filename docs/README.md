# Documentation

## Décisions (ADR) — à lire en premier

Les décisions structurantes, avec leur contexte, les options écartées et **la règle qui rouvrirait le débat**. Une décision non écrite est une décision qui sera reprise. Ces documents sont en anglais.

| # | Decision |
|---|---|
| [0001](adr/0001-nestjs-ecosystem.md) | NestJS rather than Go or Rust |
| [0002](adr/0002-prisma-orm.md) | Prisma rather than Drizzle |
| [0003](adr/0003-state-protocol.md) | Server-authoritative state, JSON transport + React |
| [0004](adr/0004-naming.md) | Perch — and the naming principle |
| [0005](adr/0005-npm-scope.md) | npm scope `@perchjs` rather than `@perch` |
| [0006](adr/0006-target-market-reading.md) | Reading "target market" in the name's reopening rule |
| [0007](adr/0007-panel-asset-delivery.md) | `@perchjs/nest` depends on `@perchjs/ui` to serve its assets — *proposed* |
| [0008](adr/0008-versioning-policy.md) | Lockstep versioning across the five packages — *proposed* |

## Perch — framework UI pour NestJS

Ordre de lecture recommandé : **ADR → REF → 00 → 12 → 13 → 01 → 02 → 03**, puis le reste selon le lot en cours.

| Doc | Titre | Tier | Rôle |
|---|---|---|---|
| [00](00-PRD-MASTER.md) | **Master** | — | vision, inventaire Filament, roadmap, nom et marque |
| [01](01-PRD-metadata-layer.md) | Couche métadonnées (Prisma → IR) | v0.1 | premier lot à construire |
| [02](02-PRD-schema-engine.md) | Moteur de schémas | v0.1 | le cœur |
| [03](03-PRD-protocol-renderer.md) | Protocole d'état & renderer | v0.1 | remplace Livewire |
| [04](04-PRD-panel-nest.md) | PanelModule Nest | v0.1 | routing, auth, navigation |
| [05](05-PRD-resources.md) | Resources & pages CRUD | v0.1 | |
| [06](06-PRD-forms-fields.md) | Forms — catalogue de champs | v0.1→v0.3 | |
| [07](07-PRD-tables.md) | Table builder | v0.1→v0.3 | |
| [08](08-PRD-actions-notifications.md) | Actions, modales, notifications | v0.1 | |
| [09](09-PRD-infolists-widgets.md) | Infolists, widgets, dashboard | v0.2→v0.3 | |
| [10](10-PRD-cli-testing-docs.md) | CLI, testing, documentation | v0.1→v0.2 | |
| [11](11-PRD-plugins-ecosystem.md) | Extensibilité & plugins | v0.1 (contrat) | le vrai fossé concurrentiel |
| [12](12-ARCH-backend.md) | **Architecture backend** | — | couches, pipeline 9 étages, caches |
| [13](13-ARCH-frontend.md) | **Architecture frontend** | — | 3 zones d'état, réconciliation |
| [REF](REF-filament.md) | *Filament déconstruit* | — | la cible, ses 6 pré-conditions, le paysage |

### Les 4 jalons bloquants

| # | Cas | Valide | Si ça échoue |
|---|---|---|---|
| **A1** | Select dépendant pays → ville, zéro JS | le protocole d'état | **arrêter et redessiner le protocole** |
| **A2** | Table : colonne de relation + filtre + bulk + modale | la couche requêtes | revoir le QueryPlanner |
| **A3** | Repeater imbriqué en transaction | l'arbre de schéma | revoir le WriteTree |
| **A4** | Module tiers injectant un champ | l'extensibilité | pas d'écosystème possible |

---

## Conventions

- Chaque PRD porte : objectif · spécification · **critères d'acceptation** · hors périmètre · risques.
- Le « hors périmètre » est aussi contraignant que le périmètre. Il empêche la dérive vers un CMS.
- Un budget de performance chiffré est une exigence testée en CI, pas une intention.
