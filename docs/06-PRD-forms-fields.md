# PRD 06 — Forms : catalogue de champs

**Tier :** v0.1 → v0.3 · **Dépendances :** PRD 02, 03

## 1. Objectif

Le catalogue de champs est ce que l'utilisateur touche 90 % du temps. Filament en propose une vingtaine plus une API de champs custom. Chaque champ doit être **complet** — un champ à moitié fini est pire qu'un champ absent, car il pousse au fork.

## 2. API transverse (héritée par tous les champs)

Ces méthodes valent pour **tous** les champs. Elles sont plus importantes que le catalogue lui-même.

| Méthode | Rôle | Tier |
|---|---|---|
| `.required()` | validation + astérisque | v0.1 |
| `.default(v \| Resolver)` | valeur initiale en création | v0.1 |
| `.label()` / `.helperText()` / `.placeholder()` | libellés (acceptent un `Resolver`) | v0.1 |
| `.hint()` / `.hintIcon()` / `.hintAction()` | indication à droite du label | v0.2 |
| `.visible()` / `.hidden()` / `.disabled()` | conditionnel, **évalué serveur** | v0.1 |
| `.readOnly()` | affiché, non éditable, non persisté | v0.1 |
| `.live()` | déclenche un round-trip au changement | v0.1 |
| `.live({ onBlur: true })` / `.live({ debounce: 500 })` | granularité du déclenchement | v0.1 |
| `.afterStateUpdated(fn)` | effet de bord serveur (peut `set()` d'autres champs) | v0.1 |
| `.dehydrated(false)` | présent dans le formulaire, exclu de la persistance | v0.1 |
| `.dehydrateStateUsing(fn)` / `.formatStateUsing(fn)` | transformation à l'écriture / à la lecture | v0.1 |
| `.rule(fn)` / `.rules([...])` | validation custom | v0.1 |
| `.validationMessages({})` | messages personnalisés | v0.2 |
| `.columnSpan()` | mise en page | v0.1 |
| `.prefix()` / `.suffix()` / `.prefixIcon()` | affixes | v0.2 |
| `.autofocus()` / `.extraAttributes()` | divers | v0.2 |
| `.extend(fn)` / `.configureUsing(fn)` | extension globale ou locale (PRD 11) | v0.1 |

**Invariant** : `.dehydrated(false)` et `.visible(false)` doivent tous deux garantir la **non-persistance**. C'est un invariant de sécurité, testé.

## 3. Catalogue

### 3.1 Tier v0.1 — les 10 indispensables

| Champ | Spécificités attendues |
|---|---|
| `TextInput` | `.email()` `.url()` `.password()` `.numeric()` `.tel()` `.minLength()` `.maxLength()` `.unique(ignoreRecord)` `.mask()` (v0.2) |
| `Textarea` | `.rows()` `.autosize()` `.maxLength()` avec compteur |
| `Select` | `.options(v \| Resolver)` · **`.relationship(name, labelField)`** · `.searchable()` (recherche **serveur**, pas filtrage client) · `.multiple()` · `.preload()` · `.createOptionForm()` (v0.2) · `.optionsLimit()` |
| `Checkbox` | `.inline()` |
| `Toggle` | `.onIcon()` `.offIcon()` `.onColor()` |
| `Radio` | `.options()` `.inline()` · *(note : Filament v4 a séparé « boutons inline » et « label inline » — reprendre cette distinction)* |
| `DateTimePicker` | `.date()` `.time()` `.minDate()` `.maxDate()` `.timezone()` `.format()` · **gestion explicite des timezones** |
| `FileUpload` | `.disk()` `.directory()` `.image()` `.maxSize()` `.acceptedFileTypes()` `.multiple()` `.imageEditor()` (v0.3) |
| `Hidden` | — |
| `Placeholder` | affichage d'une valeur calculée non éditable |

**`Select.relationship()` est le champ le plus important du catalogue.** C'est lui qui porte la promesse : `Select.make('authorId').relationship('author', 'name')` doit charger, chercher côté serveur, paginer et persister la clé étrangère, sans configuration.

**`.searchable()` doit être serveur.** Filtrer 10 000 options côté client est le bug classique. Une recherche `searchable` déclenche une requête paginée.

### 3.2 Tier v0.2

| Champ | Notes |
|---|---|
| `Repeater` | `.relationship()` · `.schema([])` · `.minItems()` `.maxItems()` · `.reorderable()` · `.collapsible()` · `.itemLabel(Resolver)` · `.cloneable()` · `.deleteAction()`. **Le cas dur du projet (A3).** |
| `CheckboxList` | `.options()` `.relationship()` `.searchable()` `.bulkToggleable()` `.columns()` |
| `TagsInput` | `.separator()` `.suggestions()` `.nestedRecursiveRules()` |
| `KeyValue` | `.keyLabel()` `.valueLabel()` `.reorderable()` · pour les champs `Json` |
| `RichEditor` | **TipTap**, pas Trix — Filament v4 a fait ce basculement. Toolbar configurable, upload d'images, placeholders de variables |
| `MarkdownEditor` | preview, toolbar |
| `ColorPicker` | hex / rgb / hsl |
| `ToggleButtons` | alternative visuelle au Radio, `.inline()` `.grouped()` |

### 3.3 Tier v0.3

| Champ | Notes |
|---|---|
| `Builder` | blocs polymorphes réordonnables — le champ « page builder ». Complexité élevée, valeur élevée. |
| `Slider` | min/max/step |
| `CodeEditor` | coloration syntaxique, langage configurable |
| `Wizard` (layout) | étapes, validation par étape, navigation conditionnelle |

### 3.4 Champs custom (v0.2) — PRD 11

Contrat en deux parties : une classe serveur étendant `Field`, un composant React enregistré dans le registre. Documenté comme un chemin de première classe, pas comme un hack.

## 4. Layouts (composants de schéma)

| Composant | Tier | Notes |
|---|---|---|
| `Schema` (racine) | v0.1 | `.columns(n \| Responsive)` |
| `Grid` | v0.1 | grille responsive |
| `Section` | v0.1 | `.description()` `.icon()` `.collapsible()` `.collapsed()` `.aside()` |
| `Fieldset` | v0.2 | groupement léger |
| `Tabs` | v0.2 | `.persistTab()` dans l'URL |
| `Callout` | v0.2 | encart info/warning/danger |
| `Prime` (Text/Image/Icon) | v0.2 | contenu statique dans un schéma |
| `EmptyState` | v0.2 | — |
| `Wizard` | v0.3 | — |
| `Split` | v0.3 | — |

## 5. Critères d'acceptation

1. Les 10 champs v0.1 passent une matrice de tests commune : rendu, saisie, validation, conditionnel, persistance, rechargement.
2. `Select.relationship()` sur une table de 50 000 options : ouverture < 200 ms, recherche serveur < 200 ms, aucune requête N+1.
3. `.visible(false)` et `.dehydrated(false)` garantissent tous deux la non-persistance — test explicite pour chacun.
4. `DateTimePicker` : une date saisie en UTC+2 est persistée en UTC et réaffichée en UTC+2 sans dérive (test sur changement d'heure d'été).
5. `FileUpload` : un upload interrompu ne laisse pas de fichier orphelin ni de ligne partielle.
6. **A3** — Repeater : ajout, modification, réordonnancement et suppression de lignes dans une transaction unique, avec rollback intégral en cas d'échec.
7. Chaque champ est navigable au clavier et annoncé correctement par un lecteur d'écran.

## 6. Hors périmètre

- Champs de géolocalisation / cartes (candidat plugin).
- Signature manuscrite (candidat plugin).
- Éditeur de tableaux WYSIWYG.
- Champs de paiement.
- i18n des libellés en v0.1.

## 7. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Trop de champs à moitié finis | **Élevé** | matrice de tests commune obligatoire avant de livrer un champ ; mieux vaut 10 champs finis que 20 approximatifs |
| Timezones (le piège classique des admins) | Élevé | politique explicite : stockage UTC, affichage dans le fuseau de l'utilisateur, tests sur DST |
| `Repeater` et `Builder` consomment tout le budget | Moyen | `Repeater` en v0.2 car requis par A3 ; `Builder` repoussé en v0.3 |
| `RichEditor` (TipTap) alourdit le bundle | Moyen | chargement paresseux du champ, hors du bundle principal |
