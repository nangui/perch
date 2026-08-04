# Documentation

## Décisions (ADR) — à lire en premier

Les cinq décisions structurantes, avec leur contexte, les options écartées et **la règle qui rouvrirait le débat**. Une décision non écrite est une décision qui sera reprise.

| # | Décision | Portée |
|---|---|---|
| [0001](adr/0001-ecosysteme-nestjs.md) | NestJS plutôt que Go ou Rust | Perch |
| [0002](adr/0002-orm-prisma.md) | Prisma plutôt que Drizzle | Perch |
| [0003](adr/0003-protocole-etat.md) | État autoritatif serveur, transport JSON + React | Perch |
| [0004](adr/0004-nommage.md) | Perch et Atelier — et le principe de nommage | les deux |
| [0005](adr/0005-rendu-rn.md) | Primitives RN stylées plutôt qu'Expo UI | Atelier |

## Perch — framework UI pour NestJS

Ordre de lecture recommandé : **ADR → REF → 00 → 12 → 13 → 01 → 02 → 03**, puis le reste selon le lot en cours.

| Doc | Titre | Tier | Rôle |
|---|---|---|---|
| [00](perch/00-PRD-MASTER.md) | **Master** | — | vision, inventaire Filament, roadmap, nom et marque |
| [01](perch/01-PRD-metadata-layer.md) | Couche métadonnées (Prisma → IR) | v0.1 | premier lot à construire |
| [02](perch/02-PRD-schema-engine.md) | Moteur de schémas | v0.1 | le cœur |
| [03](perch/03-PRD-protocol-renderer.md) | Protocole d'état & renderer | v0.1 | remplace Livewire |
| [04](perch/04-PRD-panel-nest.md) | PanelModule Nest | v0.1 | routing, auth, navigation |
| [05](perch/05-PRD-resources.md) | Resources & pages CRUD | v0.1 | |
| [06](perch/06-PRD-forms-fields.md) | Forms — catalogue de champs | v0.1→v0.3 | |
| [07](perch/07-PRD-tables.md) | Table builder | v0.1→v0.3 | |
| [08](perch/08-PRD-actions-notifications.md) | Actions, modales, notifications | v0.1 | |
| [09](perch/09-PRD-infolists-widgets.md) | Infolists, widgets, dashboard | v0.2→v0.3 | |
| [10](perch/10-PRD-cli-testing-docs.md) | CLI, testing, documentation | v0.1→v0.2 | |
| [11](perch/11-PRD-plugins-ecosystem.md) | Extensibilité & plugins | v0.1 (contrat) | le vrai fossé concurrentiel |
| [12](perch/12-ARCH-backend.md) | **Architecture backend** | — | couches, pipeline 9 étages, caches |
| [13](perch/13-ARCH-frontend.md) | **Architecture frontend** | — | 3 zones d'état, réconciliation |
| [REF](perch/REF-filament.md) | *Filament déconstruit* | — | la cible, ses 6 pré-conditions, le paysage |

### Les 4 jalons bloquants

| # | Cas | Valide | Si ça échoue |
|---|---|---|---|
| **A1** | Select dépendant pays → ville, zéro JS | le protocole d'état | **arrêter et redessiner le protocole** |
| **A2** | Table : colonne de relation + filtre + bulk + modale | la couche requêtes | revoir le QueryPlanner |
| **A3** | Repeater imbriqué en transaction | l'arbre de schéma | revoir le WriteTree |
| **A4** | Module tiers injectant un champ | l'extensibilité | pas d'écosystème possible |

## Atelier — kit de maquettes React Native

| Doc | Titre | Rôle |
|---|---|---|
| [00](atelier/00-BRIEF.md) | **Brief** | positionnement, nom, décision de rendu actée |
| [01](atelier/01-ecosysteme-2026.md) | État de l'écosystème 2026 | versions, ruptures, pièges |
| [02](atelier/02-sandbox-navigateur.md) | Sandbox navigateur | les trois niveaux d'aperçu |
| [03](atelier/03-angles-morts.md) | Angles morts | ce que les kits oublient |
| [04](atelier/04-ARCH-catalogue.md) | **Architecture du catalogue** | monorepo, tokens, URL de preuve, jalon B1 |

---

## Conventions

- Chaque PRD porte : objectif · spécification · **critères d'acceptation** · hors périmètre · risques.
- Le « hors périmètre » est aussi contraignant que le périmètre. Il empêche la dérive vers un CMS.
- Un budget de performance chiffré est une exigence testée en CI, pas une intention.
