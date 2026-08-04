# PRD 05 — Resources & pages CRUD

**Tier :** v0.1 → v0.3 · **Dépendances :** PRD 01, 02, 03, 04

## 1. Objectif

Reproduire ce que la doc Filament appelle *« le cœur de ton application »* : les resources sont des UI CRUD pour tes modèles. Filament génère d'office trois pages — **List** (table paginée), **Create** (formulaire) et **Edit** (formulaire) — plus une page **View** optionnelle en lecture seule, et enregistre automatiquement l'item de sidebar dès qu'une resource est créée.

## 2. Anatomie d'une resource

```ts
@PanelResource({
  model: 'Post',
  slug: 'posts',                    // défaut : pluriel kebab-case du modèle
  label: 'Article',
  pluralLabel: 'Articles',
  recordTitle: 'title',             // défaut : inféré (PRD 01 §3.2)
  navigationGroup: 'Content',
  navigationSort: 10,
  icon: 'document-text',
  softDeletes: true,
})
export class PostResource {
  form(): Schema { }               // Create + Edit
  table(): Table { }               // List
  infolist?(): Schema { }          // View        (v0.2)
  relations?(): RelationManager[] { } //           (v0.2)
  can?: Authorization;             // PRD 04 §5.2
  pages?(): PageOverride[] { }     //             (v0.2)
  navigationBadge?(): Promise<string | number>;
  globalSearch?: GlobalSearchConfig; //           (v0.3)
}
```

Une seule méthode `form()` sert Create et Edit, différenciées par `ctx.operation` — comme Filament. Un `form()` par opération est possible mais non requis.

## 3. Pages générées

| Page | Route | Tier | Contenu |
|---|---|---|---|
| **List** | `{path}/posts` | v0.1 | table + header actions (Create) |
| **Create** | `{path}/posts/create` | v0.1 | formulaire + Save / Save & create another |
| **Edit** | `{path}/posts/:id/edit` | v0.1 | formulaire + Save + actions (Delete, Replicate…) |
| **View** | `{path}/posts/:id` | v0.2 | infolist en lecture seule |

### 3.1 Cycle de vie (hooks)

Points d'extension, indispensables pour les cas réels et pour les plugins :

```ts
mutateFormDataBeforeCreate(data)   // v0.1
mutateFormDataBeforeSave(data)     // v0.1
mutateFormDataBeforeFill(data)     // v0.1  (Edit : DB → formulaire)
beforeCreate() / afterCreate(record)
beforeSave()   / afterSave(record)
beforeDelete() / afterDelete(record)
handleRecordCreation(data)         // v0.2 — remplacer entièrement la persistance
handleRecordUpdate(record, data)   // v0.2
```

`handleRecord*` est l'échappatoire qui permet de brancher un service métier ou un event bus au lieu d'écrire en base directement. Sans elle, l'outil est inutilisable dans une app avec de la logique domaine.

### 3.2 Redirection après création

Configurable **au niveau du panel** (index / view / edit), surchargeable par resource — reprise directe d'un ajout de Filament v4.

## 4. Suppression & soft deletes (v0.2)

| Comportement | Détail |
|---|---|
| Delete | confirmation obligatoire par défaut |
| Bulk delete | confirmation + compteur |
| Soft delete | détecté via `deletedAt` ou déclaré ; ajoute un filtre ternaire *avec/sans supprimés* |
| Restore / Force delete | actions dédiées, autorisation séparée |
| Contraintes FK | une erreur de contrainte remonte en **notification lisible**, pas en 500 |

## 5. Relation managers (v0.2)

Gérer les enfants depuis la page parente — la fonctionnalité qui sépare un vrai admin d'un CRUD jouet.

```ts
relations() {
  return [
    RelationManager.make('comments')
      .table(t => t.columns([TextColumn.make('body'), TextColumn.make('author.name')]))
      .form(s => s.schema([Textarea.make('body').required()]))
      .actions([EditAction.make(), DeleteAction.make()])
      .headerActions([CreateAction.make()]),
    RelationManager.make('tags').attachable(),   // n-n : attach/detach
  ];
}
```

**Distinction fonctionnelle à respecter** : `Repeater` (PRD 06) édite les enfants *dans* le formulaire parent, en une transaction. `RelationManager` les gère *à côté*, avec sa propre pagination et ses propres actions. Les deux sont nécessaires ; les confondre est l'erreur classique.

Rendu : onglets sous le formulaire (défaut), ou emplacement libre en v0.3 quand la structure de page devient un schéma.

## 6. Nested resources (v0.3)

Filament v4 les supporte nativement : déclarer une resource comme enfant d'une autre, le framework gérant routing et breadcrumbs.

```ts
@PanelResource({ model: 'Product', parent: { resource: CategoryResource, relation: 'category' } })
```

Routes : `{path}/categories/:parentId/products/:id/edit`. Le scoping au parent est automatique. Pas d'item de navigation propre.

## 7. Singular resources (v0.3)

Une seule instance, pas de page List : Settings, Profil de l'organisation, Configuration de facturation. Route unique, formulaire direct.

## 8. Global search (v0.3)

Recherche transverse à toutes les resources, avec palette de commandes (⌘K).

```ts
globalSearch = {
  attributes: ['title', 'excerpt'],
  resultTitle: (r) => r.title,
  resultDetails: (r) => ({ Auteur: r.author.name }),
  actions: [ /* actions rapides depuis le résultat */ ],
};
```

**Contrainte de performance** : Filament a dû ajouter une option pour désactiver le découpage du terme de recherche en mots, celui-ci s'écroulant sur de gros jeux de données. → décision : **pas de découpage par défaut**, activable.

## 9. Critères d'acceptation

1. Une resource de 15 lignes de code produit List/Create/Edit fonctionnels avec navigation.
2. `mutateFormDataBeforeCreate` permet de hacher un mot de passe avant persistance.
3. `handleRecordCreation` permet de router la création vers un service métier sans que l'outil touche la base.
4. **A2** — table avec colonne de relation + filtre + bulk delete + confirmation.
5. **A3** — un Repeater sur `addresses` crée, met à jour et supprime les enfants en une transaction.
6. Un relation manager pagine 500 enfants sans dégrader la page parente.
7. Une violation de contrainte FK produit une notification d'erreur lisible.
8. Une resource sans `table()` déclaré génère une table par défaut depuis l'IR (PRD 01) — utilisable immédiatement.

## 10. Hors périmètre

- Versioning / historique des enregistrements.
- Workflows d'approbation.
- Audit log (candidat plugin, v2+).
- Import massif (v0.3, PRD 08).
- Résolution de conflits d'édition concurrente (afficher un avertissement suffit en v1).

## 11. Risques

| Risque | Mitigation |
|---|---|
| Le couple Repeater / RelationManager confond les utilisateurs | arbre de décision explicite dans la doc, dès la page Resources |
| Les hooks ne couvrent pas un cas réel → fork | `handleRecord*` comme échappatoire totale dès v0.2 |
| Table par défaut inutilisable (trop de colonnes) | limite à 6 colonnes inférées, priorisées : titre, uniques, relations, dates |
| Nested resources explosent la complexité du routing | reporté en v0.3, après stabilisation du routing simple |
