# PRD 03 — Protocole d'état & renderer UI (`@perch/ui`)

**Tier :** v0.1 · **Dépendances :** PRD 02 · **Débloque :** A1, A2

## 1. Objectif

Remplacer Livewire. Filament décrit Livewire comme *« la réactivité pilotée par le serveur pour construire des interfaces dynamiques sans écrire d'API »*, et précise que **chaque page d'un panel est un composant Livewire**. C'est ce comportement qu'il faut obtenir, pas son implémentation.

**Décision d'architecture centrale :** on garde **l'essence de Livewire** (l'état est autoritatif côté serveur) et on prend **un transport JSON + renderer React** (la voie pragmatique, celle de Payload). On ne réimplémente pas le diffing DOM.

## 2. Pourquoi ce choix

| Option | Avantage | Coût | Verdict |
|---|---|---|---|
| Renderer React piloté par schéma JSON | type-safe de bout en bout, écosystème React, debuggable | il faut écrire un renderer | **retenu** |
| HTML piloté par le serveur (HTMX/Datastar/SSE) | plus proche de Livewire, moins de JS livré | idiome étranger à TS ; diffing DOM à gérer | rejeté |
| SPA React classique avec API REST | familier | l'état devient client-autoritatif → **perd l'essence de Filament** | rejeté |

## 3. Le protocole

Quatre routes. C'est le contrat le plus stable du produit — le figer tôt.

```
GET  /panel/api/:resource/schema?operation=create|edit&id=…
     → { schema: SchemaTree, state: State, meta: {…} }

POST /panel/api/:resource/state
     ← { state: State, dirtyPath: string, operation, id? }
     → { state: State, schemaPatch: Patch[], errors: FieldErrors }

GET  /panel/api/:resource/records?page&perPage&sort&search&filters
     → { rows: Row[], total: number, columns: ColumnTree }

POST /panel/api/:resource/actions/:action
     ← { ids?: unknown[], id?: unknown, formState?: State }
     → { result, notifications: Notification[], redirect?: string, refresh?: boolean }
```

### 3.1 La route `/state` — le cœur

Quand un champ `live()` change :

1. le client POST l'état complet + le chemin modifié ;
2. le serveur exécute le cycle de résolution (PRD 02 §4) ;
3. le serveur renvoie l'état canonique + un **patch de schéma** (visibilité, options, labels, disabled) + les erreurs.

**Le client n'invente rien.** Il n'évalue aucune condition, ne calcule aucune option, ne décide d'aucune visibilité.

### 3.2 Sécurité — non négociable

| Menace | Contre-mesure |
|---|---|
| L'état renvoyé est falsifié (champ readonly modifié, champ masqué injecté) | **Le serveur ne fait jamais confiance à l'état entrant.** Il le rejoue contre le schéma : tout chemin inconnu, invisible ou `disabled` est **écarté silencieusement**, pas rejeté avec un message qui renseigne l'attaquant. |
| Rejeu / manipulation d'ID | l'`id` est autorisé via le guard Nest à chaque requête, jamais déduit de l'état client |
| Fuite de données via `include` | le plan de chargement est dérivé du schéma serveur, jamais de paramètres client |
| Resolver exécutant du code utilisateur sur entrée client | les resolvers reçoivent l'état **après** filtrage |
| Enumération de resources | 404 indistinguable entre « n'existe pas » et « non autorisé » |

Filament expose une page « Security » dans sa doc — traiter ce chapitre comme obligatoire, pas optionnel.

### 3.3 Budget de performance

| Métrique | Budget v0.1 | Budget v1.0 |
|---|---|---|
| Round-trip `/state` p95 | 150 ms | 80 ms |
| Taille du payload d'état (form de 40 champs) | < 30 Ko | < 15 Ko |
| Debounce d'un champ texte `live()` | 400 ms (configurable) | idem |
| Rendu table 10k lignes paginée 25 | 300 ms | 150 ms |

**Note de conception issue de Filament** : la v4 a dû réécrire complètement le rendu des cellules de table pour les gros jeux de données, les composants profondément imbriqués s'écroulant en v3. → Le renderer de cellules doit être **plat dès le départ** : pas de composant React par cellule avec contexte, mais un rendu par colonne piloté par un registre.

## 4. Le renderer

### 4.1 Registre de champs

```ts
registerField('TextInput', TextInputRenderer);
registerField('Select', SelectRenderer);
// un plugin peut enregistrer le sien (PRD 11)
```

Un composant inconnu affiche un placeholder d'erreur visible en dev, silencieux en prod — jamais un écran blanc.

### 4.2 Composants v0.1

Champs : `TextInput`, `Textarea`, `Select`, `Checkbox`, `Toggle`, `Radio`, `DateTimePicker`, `FileUpload`, `Hidden`.
Layout : `Schema`, `Grid`, `Section`.
Table : en-têtes triables, recherche, pagination, sélection de lignes, barre de bulk actions.
Chrome : sidebar de navigation, breadcrumbs, topbar, modales, slide-overs, toasts.

### 4.3 Stack front

| Choix | Décision | Justification |
|---|---|---|
| Framework | React 19 | attendu par l'écosystème, seul choix raisonnable |
| Styling | Tailwind v4 | même choix que Filament ; tokens CSS pour le theming |
| Primitives accessibles | Radix | a11y correcte gratuite ; on ne réécrit pas un combobox |
| Build | livré **précompilé** dans le package | l'utilisateur n'installe aucun toolchain front — c'est la promesse produit |
| État client | local uniquement (champ en cours de saisie) | l'état canonique est serveur |
| Dark mode | v0.1 | attendu par défaut en 2026 |

**Contrainte forte** : `@perch/ui` est servi comme des assets statiques par le `PanelModule`. `npm i` puis un import de module, et le panel existe. **Zéro configuration Vite/Webpack demandée à l'utilisateur.**

## 5. Theming

- v0.1 : un thème, propre, clair + sombre.
- v0.2 : couleurs et icônes configurables via variables CSS ; **CSS hooks** (classes stables sur chaque élément, comme Filament) pour surcharge sans fork.
- v0.3 : thèmes complets.

## 6. Critères d'acceptation

1. **A1** — pays → ville fonctionne, avec 0 ligne de JS utilisateur, en un seul round-trip.
2. Un état falsifié modifiant un champ `disabled` n'a aucun effet en base.
3. Un état falsifié injectant un chemin inconnu n'a aucun effet et ne provoque aucune erreur 500.
4. Table de 10 000 lignes, 8 colonnes dont 2 de relation : premier rendu < 300 ms, tri < 200 ms.
5. Le panel fonctionne après `npm i` + import du module, sans fichier de config front.
6. Navigation clavier complète sur formulaire et table ; contraste AA.
7. Un champ inconnu dans le schéma n'écrase pas le rendu de la page.

## 7. Hors périmètre

- Rendu offline / PWA.
- SSR du panel (le panel est une app cliente derrière l'auth).
- Éditeur visuel de schéma.
- Composants standalone hors panel (Filament le propose ; **v2+** chez nous).
- Temps réel / websockets (v0.3, avec les notifications broadcast).

## 8. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Latence du round-trip perçue comme du lag | **Élevé** | debounce configurable · optimistic UI sur la saisie locale · indicateur de chargement discret · budget p95 mesuré en CI |
| Payload d'état trop gros sur gros formulaires | Moyen | n'envoyer que l'état, jamais le schéma ; patchs incrémentaux |
| Le renderer devient un second projet à maintenir | Moyen | périmètre de composants fermé et versionné avec le cœur |
| Faille de confiance dans l'état client | **Critique** | tests d'attaque dans la CI dès v0.1, pas après |
