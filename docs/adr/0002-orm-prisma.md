# ADR 0002 — Prisma plutôt que Drizzle

**Statut :** acceptée · **Portée :** Perch (`@perch/prisma`)

## Contexte

Perch n'est pas une application : c'est **une bibliothèque qui lit le schéma d'autrui**. Les critères usuels des comparatifs Prisma/Drizzle (taille de bundle, démarrage à froid en serverless, proximité au SQL) sont donc largement hors sujet. Cinq critères comptent réellement.

## Options

| Critère | Prisma | Drizzle |
|---|---|---|
| **Introspection runtime** | DMMF : graphe complet, relations first-class, enums, longueurs `@db.VarChar`, **commentaires `///` → helperText gratuit** | `getTableConfig` / `getColumns` donnent colonnes, index, FK, checks, PK — mais **les relations sont un second registre** (`defineRelations()`), et pas de commentaires |
| **Écritures imbriquées** | `create({ data: { addresses: { create: [...] } } })` = littéralement le `WriteTree` du PRD 01 | **aucune** — transactions multi-statements à écrire à la main |
| **Stabilité de l'API** | DMMF non public, mais Prisma 7 a réécrit le moteur Rust en TypeScript/WASM **sans casser la surface client** | encore en **0.45.x** ; la v1 supprime RQBv1, renomme `getTableColumns` → `getColumns`, déplace `db.query` → `db._query` |
| Chemins typés | types générés | schéma **est** du TS, pas d'étape de génération |
| Marché | historiquement leader | **a dépassé Prisma en téléchargements npm en mai 2026** |
| Friction d'intégration | impose `prisma generate` chez l'utilisateur | rien à générer |

## Décision

**Prisma**, pour la v1.

**Ce qui tranche : les écritures imbriquées.** Le jalon A3 (Repeater sauvegardant une relation hasMany en transaction) est bloquant. En Prisma c'est une traduction directe ; en Drizzle c'est un sous-système entier — ordre d'insertion, propagation de clés étrangères, diff entre l'état soumis et les lignes existantes pour décider create/update/delete. Environ trois semaines ajoutées au chemin critique.

**Facteur secondaire :** bâtir une bibliothèque publique sur un ORM pré-1.0 dont la prochaine majeure renomme précisément les deux API porteuses de la couche métadonnées, c'est s'infliger une migration au pire moment.

## Ce que Drizzle gagne, honnêtement

Le seul point où il l'emporte franchement pour un projet open-source : **pas d'étape `generate` chez l'utilisateur**, schéma TypeScript lisible, et une équipe cœur employée à plein temps par PlanetScale sous licence Apache 2.0. Ce n'est pas rien — c'est simplement moins lourd que les écritures imbriquées.

## Conséquences

Deux garde-fous, non négociables et déjà inscrits au PRD 01 :

1. **L'accès au DMMF est isolé dans un seul fichier** (`dmmf-reader.ts`), avec un test de contrat qui échoue bruyamment si la forme change, et une plage de versions Prisma documentée.
2. **L'interface `DataAdapter` reste la frontière.** C'est elle qui rend un adaptateur Drizzle possible en v0.3 ou v1.1 sans réécrire le cœur.

Le coût d'avoir tort est donc borné à un package. C'est précisément la raison de ne pas agoniser sur ce choix.

## Règle de réouverture

- Drizzle atteint la **1.0 stable** *et* introduit des écritures imbriquées natives → réévaluer pour un second adaptateur, pas pour un remplacement.
- Le DMMF casse de façon non contournable entre deux versions de Prisma → le test de contrat le détectera avant les utilisateurs.
- La demande utilisateur pour Drizzle devient majoritaire → écrire l'adaptateur, garder les deux.
