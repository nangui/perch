# ADR 0003 — État autoritatif serveur, transport JSON + React

**Statut :** acceptée · **Portée :** Perch (`@perch/core`, `@perch/ui`) · **La décision la plus structurante du produit**

## Contexte

Filament décrit Livewire comme *« la réactivité pilotée par le serveur pour construire des interfaces dynamiques sans écrire d'API »*, et précise que **chaque page d'un panel est un composant Livewire**. C'est ce comportement qu'il faut obtenir en TypeScript, où aucun équivalent canonique n'existe.

Il faut distinguer deux choses que Livewire confond :

- **l'essence** — l'état vit côté serveur, qui décide de tout ce qui est conditionnel ;
- **le transport** — du HTML diffé envoyé par HTTP.

## Options

| Option | Avantage | Coût | Verdict |
|---|---|---|---|
| Renderer React piloté par schéma JSON | type-safe de bout en bout, écosystème React, debuggable | il faut écrire un renderer | **retenu** |
| HTML piloté par le serveur (HTMX / Datastar sur SSE) | plus proche de Livewire, moins de JS livré | idiome étranger à TypeScript ; diffing DOM à gérer soi-même | rejeté |
| SPA React classique sur API REST | familier, rapide à démarrer | l'état devient **client-autoritatif** → perd l'essence du produit | rejeté |

## Décision

**Garder l'essence de Livewire, prendre le transport de Payload.**

L'état est autoritatif côté serveur ; le transport est du JSON vers un renderer React. On ne réimplémente pas le diffing DOM.

Quatre routes, contrat le plus stable du produit :

```
GET  /panel/api/:resource/schema     → arbre + état initial
POST /panel/api/:resource/state      → { state, schemaPatch, errors }
GET  /panel/api/:resource/records    → lignes + pagination
POST /panel/api/:resource/actions/:a → résultat + notifications
```

## Conséquences

**Ce que ça verrouille**

- Le client est un **interpréteur, pas une application** : zéro logique métier, zéro évaluation de condition, zéro calcul d'options côté client. Chaque fois qu'on est tenté d'y déroger « juste pour la réactivité », la réponse est : le serveur, avec un debounce.
- La frontière de confiance est **un étage nommé du pipeline** (étage 5, ARCH 12), pas une précaution dispersée. Tout état entrant est rejoué contre l'arbre ; chemin inconnu, invisible ou `disabled` est écarté **silencieusement**.
- Deux problèmes deviennent obligatoires à traiter dès la conception, pas au moment des bugs :
  - le **graphe de dépendances** des resolvers, sinon on réévalue tout l'arbre à chaque frappe ;
  - la **réconciliation** (ARCH 13 §4) — un patch qui revient pendant que l'utilisateur tape ailleurs écrase ses frappes. C'est *le* bug qui fait qu'un clone de Livewire « donne l'impression d'être cassé ».

**Ce que ça coûte**

Une latence de round-trip perçue. Budget explicite : p95 sous 150 ms en v0.1, sous 80 ms en v1.0. Mitigé par un debounce par type de champ et un optimisme limité à la zone brouillon — **jamais** sur la visibilité ou les options, sous peine de scintillements.

## Règle de réouverture

- Le jalon **A1** montre une latence perçue inacceptable malgré debounce et optimisme local → réexaminer le transport, **pas** l'essence.
- Un équivalent de Livewire émerge et s'impose en TypeScript → réévaluer le transport uniquement.

**L'essence — état autoritatif serveur — n'est pas rouvrable.** L'abandonner produirait un énième admin React headless, c'est-à-dire exactement le produit dont l'existence n'est pas justifiée.
