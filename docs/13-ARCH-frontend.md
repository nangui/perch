# ARCH 13 — Architecture frontend (`@perchjs/ui`)

**Statut :** décision d'architecture · **Complète :** PRD 03, 06, 07

## 1. Principe fondateur

> **Le client est un interpréteur, pas une application.**

Trois responsabilités, aucune autre : rendre un arbre, capturer une saisie, appliquer un patch. Zéro logique métier, zéro évaluation de condition, zéro calcul d'options, zéro décision de visibilité.

Chaque fois qu'on est tenté de mettre une règle côté client « juste pour la réactivité », on perd l'essence du produit. La réponse est toujours : le serveur, avec un debounce.

## 2. Graphe de modules

```
shell/         routing, layout, sidebar, topbar, frontière d'auth
kernel/        SchemaRenderer · ComponentRegistry · StateStore
               TransportClient · PatchApplier
components/    fields/ · layouts/ · columns/ · entries/     ← feuilles bêtes
table/         renderer plat, registre de colonnes
overlays/      modales, slide-overs, toasts
theme/         variables CSS, tokens, dark mode
```

**Règle de dépendance :** `components/` n'importe jamais l'intérieur de `kernel/` et n'appelle jamais le transport. Un composant reçoit des props et un `onChange`. C'est exactement ce qui le rend remplaçable par un plugin — un composant qui connaît le transport n'est pas substituable.

## 3. Propriété de l'état — le modèle à 3 zones

C'est la décision la plus structurante du frontend.

| Zone | Propriétaire | Exemples | Survit à un patch ? |
|---|---|---|---|
| **Canonique** | **serveur** | valeurs, visibilité, options, `disabled`, erreurs | remplacée |
| **Brouillon** | client, éphémère | caractères tapés avant le flush du debounce | protégée (§4) |
| **UI pure** | client seul | section repliée, onglet actif, scroll, largeur de colonne, tri visuel | intacte |

**Règle :** tout état qui influence la persistance ou la validation est canonique. On ne duplique **jamais** un état canonique dans l'état client — on le lit. En cas de conflit, **le serveur gagne**.

Corollaire pratique : il n'y a pas de bibliothèque de state management globale. Un store minimal pour la zone canonique, `useState` local pour la zone UI pure. Introduire Redux/Zustand ici, c'est inviter la duplication d'état canonique.

## 4. Le problème de réconciliation

**C'est le bug qui fait qu'un clone de Livewire « donne l'impression d'être cassé », et personne ne le planifie.**

Scénario : l'utilisateur tape dans le champ B pendant qu'un patch déclenché par le champ A revient du serveur. Naïvement, le patch écrase B → frappes perdues, curseur qui saute.

Solution en trois mécanismes :

1. **Révisions et chemins sales.** Le store maintient un `Set<path>` des chemins modifiés localement et non encore confirmés. Un patch **n'écrase jamais** un chemin sale.
2. **Exception autoritaire.** Le serveur peut marquer un chemin `authoritative: true` (valeur calculée, ex. un total). Celui-là écrase, même sale — et le renderer signale visuellement le changement.
3. **File single-flight par formulaire.** Une seule requête `/state` en vol à la fois. Les changements survenant pendant le vol sont **fusionnés** dans la requête suivante, jamais empilés. Chaque requête porte un numéro de séquence ; une réponse hors séquence est jetée.

À concevoir maintenant, pas quand les bugs arriveront.

## 5. TransportClient

| Aspect | Décision |
|---|---|
| Concurrence | single-flight + coalescence par formulaire |
| Debounce | par type de champ : texte 400 ms, select/toggle/date 0 ms |
| Ordonnancement | numéro de séquence, réponses obsolètes ignorées |
| Échec réseau | bandeau + réessai manuel, **jamais** de perte silencieuse |
| Erreur 422 | erreurs appliquées par chemin, focus sur le premier champ invalide |
| Erreur 500 | bandeau avec `requestId` copiable |
| Optimisme | uniquement sur la zone brouillon ; jamais sur la visibilité ou les options |

Ce dernier point est important : afficher optimistiquement un champ qui apparaîtra peut-être produit des scintillements. On préfère 150 ms de latence à un flash.

## 6. Rendu

**SchemaRenderer** parcourt l'arbre et mémoïse par nœud, clé `(component.key, revision)`. Un nœud dont la révision n'a pas changé n'est pas re-rendu.

**Table : rendu plat.** Contrainte héritée de PRD 07 §2 — Filament v4 a dû réécrire son rendu de cellules parce que les composants imbriqués s'écroulaient sur les gros volumes. Concrètement chez nous : une fonction de rendu mémoïsée **par type de colonne**, des cellules qui sont des sorties simples, pas des composants React avec hooks et contexte. Non négociable dès le premier commit.

**Frontières d'erreur** au niveau de chaque nœud de layout de premier rang. Un composant cassé dégrade sa section, jamais la page. Un type de composant inconnu affiche un marqueur visible en dev, discret en prod.

## 7. Registre de composants et plugins

```ts
registerField('TextInput', TextInputRenderer);
registerColumn('Text', TextColumnRenderer);
registerEntry('Text', TextEntryRenderer);
```

**Deux façons de charger un composant de plugin :**

| Option | Coût | Verdict |
|---|---|---|
| (a) le plugin publie du source React, l'utilisateur recompile | exige un toolchain front chez l'utilisateur → **tue la promesse « zéro configuration »** | rejeté |
| (b) le plugin livre un bundle précompilé (ESM), servi par son propre endpoint d'assets, chargé au runtime | contrat de props à versionner | **retenu** |

Le contrat de props d'un renderer est donc une **API publique versionnée**, documentée comme telle.

## 8. Livraison des assets

`@perchjs/ui` est publié **précompilé**. Le `PanelModule` le sert en statique. L'utilisateur ne configure ni Vite, ni Webpack, ni Tailwind. C'est la promesse produit, pas une commodité.

- Un bundle principal + des chunks paresseux pour les champs lourds : `RichEditor` (TipTap), `CodeEditor`, `Charts`.
- Noms de fichiers hachés, cache immuable.
- **Budget : bundle principal < 250 Ko gzip.** Mesuré en CI, bloquant.

## 9. Theming

Variables CSS uniquement — pas de theming en JS. Trois niveaux :

1. tokens sémantiques (`--perch-color-primary`, `--perch-radius-md`, `--perch-space-2`)
2. **CSS hooks** : une classe stable sur chaque élément structurant (comme Filament), pour surcharger sans forker
3. mode sombre par attribut sur la racine, pas par duplication de règles

## 10. Accessibilité — traitée comme une exigence, pas un correctif

| Exigence | Moyen |
|---|---|
| Primitives accessibles | Radix (combobox, dialog, tabs, dropdown) — on ne réécrit pas un combobox |
| Focus | piégé dans les modales, restitué à la fermeture, visible partout |
| Table | navigation clavier complète, en-têtes triables actionnables au clavier |
| Notifications | région live polie |
| Contraste | AA minimum, vérifié en CI |
| Erreurs de formulaire | liées au champ par `aria-describedby`, annoncées |

## 11. Ce que cette architecture interdit délibérément

- Pas de state management global (invite la duplication d'état canonique).
- Pas de logique conditionnelle côté client (perd l'essence du produit).
- Pas de composant de cellule de table avec hooks (mur de performance).
- Pas de toolchain front chez l'utilisateur (perd la promesse d'installation).
- Pas de rendu optimiste de la structure (scintillements).
