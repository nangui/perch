# PRD 07 — Table builder

**Tier :** v0.1 → v0.3 · **Dépendances :** PRD 01, 02, 03

## 1. Objectif

Reprendre ce que Filament décrit comme *« parcourir et filtrer de grands jeux de données avec des colonnes, actions et opérations en masse puissantes »*. La table est la première chose que voit un utilisateur final : c'est là que se juge la qualité perçue du produit.

## 2. Leçon à intégrer avant d'écrire une ligne

Filament v3 rendait ses cellules avec des composants Blade profondément imbriqués, ce qui s'écroulait sur les tables volumineuses. La v4 a **entièrement réécrit** le rendu des cellules pour cette raison.

**Conséquence de conception, non négociable :** le rendu de cellule est **plat**. Pas de composant React par cellule avec contexte et hooks. Un registre par type de colonne, une fonction de rendu, mémoïsation par colonne et non par cellule. Cette contrainte est structurelle — on ne la rétrofitte pas.

## 3. API

```ts
table() {
  return Table.make()
    .query(q => q.where({ published: true }))     // scope de base
    .columns([
      TextColumn.make('title').searchable().sortable(),
      TextColumn.make('author.name').label('Auteur').sortable(),
      IconColumn.make('isPriority').boolean(),
      TextColumn.make('status').badge().color(s => STATUS_COLORS[s]),
      TextColumn.make('createdAt').dateTime().sortable().toggleable(hiddenByDefault: true),
    ])
    .filters([
      SelectFilter.make('status').options(Status),
      SelectFilter.make('authorId').relationship('author', 'name').searchable(),
      TernaryFilter.make('published'),
      DateRangeFilter.make('createdAt'),
    ])
    .actions([ViewAction.make(), EditAction.make(), DeleteAction.make()])
    .bulkActions([DeleteBulkAction.make(), ExportBulkAction.make()])
    .headerActions([CreateAction.make()])
    .defaultSort('createdAt', 'desc')
    .paginated([10, 25, 50, 100])
    .searchPlaceholder('Rechercher un article…')
    .emptyState(e => e.heading('Aucun article').description('Crée le premier.'));
}
```

## 4. Colonnes

| Colonne | Tier | Options clés |
|---|---|---|
| `TextColumn` | v0.1 | `.searchable()` `.sortable()` `.badge()` `.color()` `.icon()` `.limit()` `.tooltip()` `.money()` `.dateTime()` `.numeric()` `.copyable()` `.wrap()` `.listWithLineBreaks()` |
| `IconColumn` | v0.1 | `.boolean()` `.icons()` `.colors()` |
| `ImageColumn` | v0.2 | `.circular()` `.stacked()` `.size()` `.limit()` |
| `ColorColumn` | v0.2 | `.copyable()` |
| `SelectColumn` | v0.2 | édition inline |
| `ToggleColumn` | v0.2 | édition inline |
| `TextInputColumn` | v0.2 | édition inline |
| `CheckboxColumn` | v0.2 | édition inline |

**Options transverses** : `.label()` `.alignment()` `.width()` `.toggleable()` `.visible()` `.extraAttributes()` `.state(Resolver)` `.default()` `.placeholder()`.

**Colonnes d'agrégat** (v0.3) : `.counts('comments')`, `.sum('items', 'total')`, `.avg()`, `.max()` — traduits en sous-requêtes, jamais en boucle applicative.

**Édition inline** (v0.2) : c'est une écriture depuis une table. Elle doit passer par la même autorisation et la même validation que le formulaire. Piège classique : contourner les policies. Interdit.

## 5. Filtres

| Filtre | Tier |
|---|---|
| `SelectFilter` (+ `.relationship()` `.multiple()` `.searchable()`) | v0.1 |
| `TextFilter` | v0.1 |
| `TernaryFilter` (oui / non / tous — incl. soft deletes) | v0.2 |
| `DateRangeFilter` | v0.2 |
| `NumberRangeFilter` | v0.2 |
| `Filter.make().schema([...])` — filtre custom à schéma libre | v0.2 |
| `QueryBuilder` (conditions imbriquées AND/OR) | v0.3 |

Comportements : persistance des filtres dans l'URL (partageable, rechargeable), badge du nombre de filtres actifs, `.deferFilters()` (appliquer sur clic plutôt qu'à chaque frappe), indicateurs de filtres actifs supprimables un par un.

## 6. Recherche, tri, pagination

- **Recherche** : globale sur les colonnes `searchable()`, ou par colonne (`isIndividual`). Recherche sur relation supportée. **Pas de découpage du terme en mots par défaut** — Filament a dû ajouter cette option pour raisons de performance ; on prend le défaut performant.
- **Tri** : simple en v0.1 ; multi-colonnes en v0.3. Filament v4 trie automatiquement par clé primaire en complément, pour garantir un ordre stable entre pages — **reprendre ce comportement**, c'est un correctif de justesse, pas une préférence.
- **Pagination** : offset en v0.1 ; curseur en v0.3 pour les très gros volumes. `perPage` persisté par utilisateur (v0.2).

## 7. Sélection & bulk actions

- Sélection de page, sélection de tout le résultat filtré (attention : ne pas charger 100k IDs en mémoire — sur « tout sélectionner », transmettre le **prédicat**, pas la liste d'IDs).
- Compteur, désélection, barre d'actions flottante.
- Bulk actions avec confirmation, progression pour les lots longs (v0.3, via queue).

## 8. Fonctionnalités avancées

| Fonctionnalité | Tier |
|---|---|
| Layout responsive (split, stack, colonnes masquées sur mobile) | v0.2 |
| Empty state configurable (heading, description, icône, actions) | v0.2 |
| Summaries (agrégats en pied : count, sum, avg, range) | v0.3 |
| Grouping rows (groupes repliables avec compteurs) | v0.3 |
| Réordonnancement drag & drop (colonne d'ordre) | v0.3 |
| Custom data (source non-ORM : API externe, tableau en mémoire) | v0.3 |
| Colonnes toggleables persistées par utilisateur | v0.2 |
| Export CSV du résultat filtré | v0.3 (PRD 08) |

**Note écosystème** : certaines fonctions haut de gamme (vues sauvegardées par l'utilisateur, quick filters, tri multi-colonnes, gestion de vues) sont vendues comme **plugins commerciaux** dans l'écosystème Filament. → candidates naturelles pour notre propre couche plugin (PRD 11), **pas** pour le cœur.

## 9. Budget de performance

| Scénario | Budget v0.1 | Budget v1.0 |
|---|---|---|
| 10k lignes, 8 colonnes dont 2 de relation, page 25 | 300 ms | 150 ms |
| Tri sur colonne indexée | 200 ms | 100 ms |
| Recherche globale sur 3 colonnes | 400 ms | 200 ms |
| 100k lignes, pagination curseur | — | 200 ms |
| Requêtes SQL par rendu de page | **≤ 3** (count + rows + filtres) | ≤ 3 |

Le compteur de requêtes SQL est un test de non-régression en CI, pas une bonne intention.

## 10. Critères d'acceptation

1. **A2** — colonne de relation + filtre select + bulk delete + modale de confirmation, sur une resource réelle.
2. 10 000 lignes : premier rendu < 300 ms, ≤ 3 requêtes SQL, aucune requête par ligne.
3. Filtres et tri persistés dans l'URL : recharger la page restitue l'état exact ; l'URL est partageable.
4. Deux pages consécutives ne montrent jamais deux fois la même ligne (ordre stable garanti par le tri complémentaire sur clé primaire).
5. « Tout sélectionner » sur 100 000 lignes filtrées ne charge pas 100 000 IDs côté client.
6. Une édition inline sur une ligne non autorisée est refusée côté serveur.
7. Une table sans `columns()` déclaré est générée depuis l'IR (max 6 colonnes) et est immédiatement utilisable.

## 11. Hors périmètre

- Vue Kanban / calendrier / carte (candidats plugins).
- Vues sauvegardées par utilisateur (candidat plugin commercial).
- Tableaux croisés dynamiques.
- Édition de masse via cellules type tableur.
- Virtual scrolling (la pagination suffit en v1).

## 12. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Rendu de cellule imbriqué → le mur de performance de Filament v3 | **Élevé** | rendu plat imposé dès le premier commit ; budget mesuré en CI |
| N+1 sur colonnes de relation | Élevé | compteur de requêtes SQL en test |
| Filtres complexes générant du SQL non indexé | Moyen | avertissement en mode dev sur les full scans |
| « Tout sélectionner » fait exploser la mémoire | Moyen | transmission de prédicat, jamais de liste d'IDs |
