# CLAUDE.md — Perch

Contexte permanent pour tout agent travaillant sur ce dépôt. Lis ce fichier en entier avant
d'agir, à chaque session.

## Ce qu'est ce projet

**Perch** — un framework UI open source pour NestJS. On définit une resource en TypeScript, on
obtient un panneau d'administration complet, on n'écrit jamais de front. C'est l'équivalent de
Laravel Filament pour l'écosystème Node.

Statut : **pré-implémentation**. La documentation est complète et figée, le code n'existe pas
encore. Le premier objectif est le jalon A1 (voir plus bas).

## À lire avant d'agir

Ne commence aucune tâche sans avoir lu les documents concernés. Ils font autorité sur ce fichier.

| Tu vas… | Lis d'abord |
|---|---|
| n'importe quoi | `docs/adr/` — les 4 décisions structurantes |
| comprendre la cible | `docs/REF-filament.md` |
| toucher au backend | `docs/12-ARCH-backend.md` |
| toucher au frontend | `docs/13-ARCH-frontend.md` |
| écrire la couche métadonnées | `docs/01-PRD-metadata-layer.md` |
| écrire le moteur de schémas | `docs/02-PRD-schema-engine.md` |
| écrire le protocole ou le renderer | `docs/03-PRD-protocol-renderer.md` |
| ajouter un champ, une colonne, une action | le PRD correspondant (06, 07, 08) |

`docs/README.md` donne l'ordre de lecture complet.

## Invariants — ne jamais enfreindre

Ces huit règles sont violées par défaut si on ne les a pas en tête. Chacune est justifiée dans
la documentation ; ne les rediscute pas, applique-les.

1. **L'état est autoritatif côté serveur.** Le client est un interpréteur, pas une application :
   zéro logique métier, zéro évaluation de condition, zéro calcul d'options côté client. Si tu es
   tenté d'y déroger « juste pour la réactivité », la réponse est : le serveur, avec un debounce.
2. **`@perchjs/core` n'importe ni `@nestjs/*`, ni `@prisma/client`, ni `react`.** Les flèches de
   dépendance ne pointent que vers l'intérieur. Un test `dependency-cruiser` doit le garantir.
3. **Les builders sont immutables.** Chaque méthode fluide retourne un clone. Un builder mutable
   partagé entre requêtes fait fuiter l'état d'un utilisateur vers un autre — c'est une faille de
   sécurité, pas un choix de style.
4. **Tout état entrant du client est rejoué contre l'arbre de schéma** (étage 5 du pipeline).
   Chemin inconnu, champ invisible, `disabled` ou `readOnly` → écarté **silencieusement**, jamais
   avec un message qui renseignerait un attaquant.
5. **Un champ invisible n'est jamais validé ni persisté.** Idem pour `.dehydrated(false)`.
6. **Le rendu des cellules de table est plat.** Pas de composant React par cellule avec hooks et
   contexte : une fonction de rendu mémoïsée par *type de colonne*. Filament a dû réécrire tout
   son rendu de tables pour cette raison — on ne repasse pas par son erreur.
7. **Aucune requête N+1.** Toute colonne de relation produit un `include`. Le compteur de requêtes
   SQL est un test bloquant, pas une intention.
8. **L'autorisation est vérifiée côté serveur à l'exécution**, jamais seulement au rendu du
   bouton. Un bouton masqué n'est pas une protection.

## Où on en est, et par quoi commencer

Le chemin critique est **le jalon A1** :

> Un `Select` « ville » dont les options dépendent d'un `Select` « pays », qui se met à jour en un
> seul aller-retour, avec zéro ligne de JavaScript écrite par l'utilisateur.

**Construire en tranche verticale, pas couche par couche.** Ordre imposé :

1. `packages/prisma` — DMMF → représentation intermédiaire (PRD 01). Mécanique, débloque tout.
2. `packages/core` — `Field`, `Schema`, résolution d'état, avec A1 comme unique test.
3. `packages/ui` — renderer minimal, 3 champs, et A1 qui tourne de bout en bout.

**Si A1 n'est pas élégant ou dépasse 150 ms en p95, on s'arrête et on redessine le protocole.**
Ne construis pas A2, A3 ou A4 sur un A1 bancal.

Les jalons suivants : A2 (table + relation + filtre + bulk + modale), A3 (repeater imbriqué en
transaction), A4 (module tiers injectant un champ). Détaillés dans `docs/00-PRD-MASTER.md` §9.

## Structure des paquets

| Paquet | Responsabilité | Peut importer |
|---|---|---|
| `@perchjs/core` | moteur de schémas, résolution d'état, validation | rien |
| `@perchjs/prisma` | DMMF → IR, exécution des requêtes | core |
| `@perchjs/nest` | `PanelModule`, routing, guards, navigation | core |
| `@perchjs/ui` | renderer React, registre de composants | core (types seulement) |
| `@perchjs/cli` | génération de code | core |

## Stack

NestJS · Prisma · PostgreSQL · React 19 · Tailwind v4 · Radix · Zod · TypeScript strict.

Prisma seulement, PostgreSQL seulement, Express seulement en v0.1. L'interface `DataAdapter`
existe pour rendre d'autres adaptateurs possibles plus tard — **ne l'implémente pas maintenant,
mais ne franchis jamais la frontière.**

## Garde-fous CI — dès le premier commit

Ce ne sont pas des tâches pour plus tard. Ils existent avant le code qu'ils protègent.

- test de dépendances : `core` reste pur
- compteur de requêtes SQL par page (anti-N+1)
- budget de latence p95 sur `/state` et `/records`
- test de concurrence : 100 requêtes parallèles, aucun état partagé
- tests d'attaque : état falsifié, chemin inconnu, action non autorisée
- test de contrat DMMF

## Façon de travailler

**Tu n'exécutes aucune commande git.** Ni `init`, ni `add`, ni `commit`, ni `push`, ni `gh`. Tu
me donnes les commandes dans des blocs copiables, au fur et à mesure de ton avancement, et
j'exécute moi-même. Tu peux créer, modifier et supprimer des fichiers librement.

**Une étape à la fois.** Tu t'arrêtes après chaque étape, tu montres ce que tu as fait, tu donnes
le commit correspondant, et tu attends ma confirmation.

**Commits :** Conventional Commits, en anglais, à l'impératif, sujet ≤ 72 caractères.
Types : `feat` `fix` `docs` `chore` `refactor` `test` `build` `ci`.
Scopes : `core` `prisma` `nest` `ui` `cli` `docs` `repo`.
Un commit = un changement logique. Le corps explique le *pourquoi*, pas le *comment*.

**Documentation :** en français. **Code, commentaires, messages de commit, noms de symboles :**
en anglais.

## Vocabulaire

| Terme | Sens précis dans ce projet |
|---|---|
| **Resource** | une classe décrivant le CRUD d'un modèle Prisma |
| **Schema** | l'arbre de composants déclaratif (forms, infolists, layouts) |
| **Field** | un composant porteur d'état et soumis à validation |
| **Resolver** | une fonction évaluée **côté serveur** produisant une valeur dynamique |
| **IR** | la représentation intermédiaire issue du DMMF |
| **WriteTree** | l'arbre d'écriture, incluant les écritures imbriquées |
| **schemaPatch** | le diff de schéma renvoyé après un changement d'état |
| **Étage 5** | la frontière de confiance du pipeline backend |
| **A1…A4** | les quatre jalons d'acceptation |

## Ce qu'il ne faut pas faire

- Rediscuter une décision documentée dans un ADR. Chacun contient sa **règle de réouverture** —
  si elle n'est pas remplie, le dossier est clos. Le nom du projet en particulier n'est pas
  rediscutable.
- Modifier un ADR existant. Une décision qui change donne lieu à un **nouvel** ADR qui supersède
  l'ancien.
- Reformuler, résumer ou « améliorer » un document de `docs/`. Signale-moi ce qui te paraît faux,
  ne le corrige pas de toi-même.
- Ajouter une dépendance sans me le dire explicitement et me dire pourquoi.
- Construire une fonctionnalité listée « hors périmètre » dans un PRD. Le hors-périmètre est
  aussi contraignant que le périmètre : il empêche la dérive vers un CMS.
- Livrer un champ « à moitié fini ». Dix champs complets valent mieux que vingt approximatifs.
