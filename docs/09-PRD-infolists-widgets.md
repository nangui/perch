# PRD 09 — Infolists, widgets & dashboard

**Tier :** v0.2 → v0.3 · **Dépendances :** PRD 02, 03, 05

## 1. Objectif

Deux briques que Filament liste parmi ses six blocs de base.

**Infolists** — *« rendre des vues d'enregistrement en lecture seule, avec des mises en page structurées et un formatage personnalisé »*. Usage : pages de détail, panneaux latéraux, interfaces d'inspection.

**Widgets** — *« faire remonter métriques, agrégats, graphiques et activité récente avec des composants pilotés par la donnée »*. Chez Filament, chaque widget est techniquement un composant Livewire, donc pleinement interactif.

## 2. Infolists (v0.2)

### 2.1 Positionnement

Une infolist n'est **pas** un formulaire désactivé. C'est un arbre de composants distinct, optimisé pour la lecture : formatage riche, mises en page denses, pas d'état éditable, pas de validation. Réutiliser le même `Component` racine (PRD 02) mais une sous-hiérarchie `Entry`.

**Gain architectural** : les layouts (`Section`, `Grid`, `Tabs`) sont partagés avec les formulaires. Une seule implémentation.

### 2.2 API

```ts
infolist() {
  return Schema.make([
    Section.make('Commande').columns(3).schema([
      TextEntry.make('number').label('N°').copyable(),
      TextEntry.make('status').badge().color(s => STATUS_COLORS[s]),
      TextEntry.make('total').money('EUR'),
      TextEntry.make('customer.email').label('Client').url(r => `mailto:${r.customer.email}`),
      TextEntry.make('createdAt').dateTime(),
    ]),
    Section.make('Lignes').schema([
      RepeatableEntry.make('items').schema([
        TextEntry.make('product.name'),
        TextEntry.make('quantity'),
        TextEntry.make('unitPrice').money('EUR'),
      ]),
    ]),
  ]);
}
```

### 2.3 Catalogue d'entries

| Entry | Tier | Options |
|---|---|---|
| `TextEntry` | v0.2 | `.badge()` `.color()` `.icon()` `.money()` `.dateTime()` `.numeric()` `.copyable()` `.limit()` `.listWithLineBreaks()` `.html()` `.markdown()` `.url()` `.placeholder()` |
| `IconEntry` | v0.2 | `.boolean()` `.icons()` `.colors()` |
| `ImageEntry` | v0.2 | `.circular()` `.stacked()` `.size()` |
| `ColorEntry` | v0.2 | `.copyable()` |
| `KeyValueEntry` | v0.2 | pour les champs Json |
| `CodeEntry` | v0.3 | coloration syntaxique |
| `RepeatableEntry` | v0.2 | relations hasMany en lecture |
| `Custom entries` | v0.2 | même contrat que les champs custom (PRD 11) |

**Invariants** :
- Une infolist ne persiste **jamais** rien.
- Une entry masquée par autorisation ne doit pas apparaître dans le payload JSON — masquer côté client est une fuite de données.
- Le chargement des relations est planifié en une requête (`include`), comme pour les tables.

### 2.4 Contextes d'usage

Page View d'une resource · modale d'une `ViewAction` · panneau latéral d'une table · dans un relation manager · dans une custom page.

## 3. Widgets (v0.3)

### 3.1 Types

| Widget | Tier | Notes |
|---|---|---|
| `StatsWidget` | v0.3 | cartes de métriques : valeur, description, icône, couleur, tendance, sparkline |
| `ChartWidget` | v0.3 | line, bar, pie, doughnut, area — via une lib de charting unique |
| `TableWidget` | v0.3 | réutilise le Table builder (PRD 07), pas de code parallèle |
| `CustomWidget` | v0.3 | échappatoire React |

```ts
@PanelWidget({ sort: 1, columnSpan: 2, pollingInterval: 30_000 })
export class SalesStats extends StatsWidget {
  async stats() {
    const [views, sales, change] = await this.analytics.summary();
    return [
      Stat.make('Vues uniques', views).icon('eye'),
      Stat.make('Ventes', sales)
        .color(change >= 0 ? 'success' : 'danger')
        .descriptionIcon(change >= 0 ? 'trending-up' : 'trending-down')
        .description(`${Math.abs(change)}%`),
    ];
  }
}
```

### 3.2 Comportements

| Capacité | Tier |
|---|---|
| Placement sur le dashboard (ordre, `columnSpan` responsive) | v0.3 |
| Widgets sur les pages de resource (List / Edit / View) | v0.3 |
| Polling / rafraîchissement automatique | v0.3 |
| Filtre global de dashboard (période) propagé aux widgets | v0.3 |
| Autorisation par widget | v0.3 |
| Cache par widget (TTL) | v0.3 |
| Chargement paresseux (le widget ne bloque pas le rendu de la page) | v0.3 |
| **Dashboards en drag & drop configurables par l'utilisateur final** | **Hors périmètre — candidat plugin commercial** |

Ce dernier point est délibéré : Filament vend précisément cette fonctionnalité comme plugin officiel payant (*Custom Dashboards*). C'est un excellent indicateur de ce qui a une valeur marchande. Voir PRD 11.

### 3.3 Performance

Un dashboard est l'écran le plus lent d'un admin mal conçu : 8 widgets = 8 agrégats potentiellement lourds.

**Règles :**
- Chaque widget est chargé **indépendamment et en parallèle**, après le rendu du chrome. Le dashboard s'affiche immédiatement avec des squelettes.
- Un widget lent ne bloque pas les autres ; un widget en échec affiche une erreur locale, jamais un écran blanc.
- Budget : chaque widget < 500 ms, dashboard interactif < 400 ms.
- Cache par défaut recommandé (TTL 60 s) et documenté.

## 4. Critères d'acceptation

1. La page View d'une resource s'affiche depuis `infolist()` en ≤ 2 requêtes SQL, relations incluses.
2. Une entry non autorisée est absente du payload JSON (vérifié par inspection réseau).
3. `RepeatableEntry` affiche 20 lignes enfants sans requête N+1.
4. Les layouts (`Section`, `Grid`, `Tabs`) fonctionnent à l'identique dans un formulaire et dans une infolist — **une seule implémentation**, testée dans les deux contextes.
5. Un dashboard de 6 widgets s'affiche en < 400 ms avec squelettes, chaque widget se remplissant indépendamment.
6. Un widget qui lève une exception affiche une erreur localisée et n'empêche pas les 5 autres de s'afficher.
7. `TableWidget` réutilise le Table builder sans duplication de code (vérifié par revue).

## 5. Hors périmètre

- Dashboards configurables par l'utilisateur final (drag & drop) → plugin.
- Constructeur de rapports / BI.
- Export de dashboard en PDF.
- Widgets temps réel via WebSocket (v0.3 au mieux, couplé aux notifications broadcast).
- Widgets de carte géographique → plugin.

## 6. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Le dashboard devient l'écran le plus lent du panel | Élevé | chargement parallèle et paresseux imposé + budget par widget |
| Infolists dupliquent le code des formulaires | Moyen | `Component` racine partagé (PRD 02) ; revue d'architecture avant merge |
| Entries masquées côté client seulement → fuite | **Élevé** | filtrage serveur du payload + test d'inspection réseau |
| Le choix de lib de charting alourdit le bundle | Faible | une seule lib, chargée paresseusement avec les widgets |
| Les agrégats de widgets ignorent le scoping tenant | **Critique** | scoping au niveau `DataAdapter` (PRD 04 §8), jamais dans le widget |
