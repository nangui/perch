# ADR 0008 — Politique de versions : les cinq paquets avancent ensemble

**Statut :** proposée · **Portée :** Perch

## Contexte

Cinq paquets publiables — seule la racine est `private` — tous à `0.0.0`. Aucun outil de release, aucun CHANGELOG, aucune règle semver écrite. Le premier `npm publish` tranchera la question par accident si personne ne la tranche avant.

Le dépôt penche déjà, à deux endroits :

- **PRD 00 §6** assigne chaque fonctionnalité à une version *du produit* — v0.1, v0.2, v0.3 — sur une centaine de lignes. Jamais à la version d'un paquet.
- **PRD 03 §8** traite le risque « le renderer devient un second projet à maintenir » par la mitigation : « périmètre de composants fermé et **versionné avec le cœur** ».

Et l'ADR 0007 ajoute une contrainte : `@perchjs/nest` dépend de `@perchjs/ui`, donc les deux doivent avancer ensemble.

## Ce que la vérification a établi

Deux faits mesurés plutôt que supposés, sur l'état actuel du dépôt :

1. **`workspace:*` devient un pin exact à la publication**, pas une plage. Un `pnpm pack` de `@perchjs/nest` donne `"@perchjs/core": "0.0.0"` dans le tarball — pas `^0.0.0`.
2. **`@perchjs/ui` n'a aucune dépendance d'exécution sur `@perchjs/core`.** Il le tient en `devDependency`, parce qu'ARCH 12 ne lui accorde que les types, et les types sont effacés à la construction. Un décalage de version entre les deux serait donc **invisible à l'installation** : rien, dans le registre npm, ne le signalerait.

## Options

| | Ce que ça donne | Retenu ou non |
|---|---|---|
| **A. Lockstep** | les cinq portent toujours le même numéro et sont publiés ensemble | **retenue** |
| **B. Indépendant** | chaque paquet suit son propre rythme | rejetée : la feuille de route est écrite par version *du produit*, et « Perch 0.2 » est l'unité qu'un auteur de plugin peut nommer (PRD 11). `@perchjs/core@0.4.1` + `@perchjs/nest@0.2.3` n'est pas une information pour lui |
| **C. Hybride** — `core`/`prisma`/`nest` liés, `ui` et `cli` libres | moins de publications vides | rejetée : l'ADR 0007 couple `nest` à `ui`, donc la coupure tomberait exactement là où est le couplage |

## Décision

**Les cinq paquets portent toujours le même numéro de version et sont publiés ensemble**, y compris ceux qui n'ont pas changé dans la release.

1. **Première version publiée : `0.1.0`**, conformément à la feuille de route. `0.0.0` n'est jamais publié.
2. **Avant 1.0, le mineur est cassant.** npm lit `^0.2.3` comme `>=0.2.3 <0.3.0` : un `^0.2.0` n'autorise pas `0.3.0`. Les paliers v0.1 → v0.2 → v0.3 se posent donc sur les mineurs, et c'est délibéré, pas un effet de bord.
3. **Les dépendances internes restent `workspace:*`.** Le pin exact qu'il produit est correct ici précisément parce que les versions qu'il épingle sont toujours publiées ensemble ; sous une politique indépendante, ce serait un piège.
4. **Un seul CHANGELOG, à la racine.** Cinq fichiers décrivant la même release sont du bruit.
5. **Outil : Changesets**, avec un groupe `fixed` couvrant `@perchjs/*`. C'est de l'implémentation : en changer ne rouvre pas cet ADR, abandonner le lockstep si.

## Conséquences

1. Un correctif dans `cli` fait monter les cinq numéros. Quatre paquets changent de version sans changer de contenu. **Coût accepté** — Angular et Prisma font exactement cela, et l'alternative coûte plus cher en confusion qu'elle n'économise en numéros.
2. Le décalage `ui` / `core`, que rien ne détecterait à l'installation, devient structurellement impossible. C'est une raison de la décision, pas une retombée.
3. La publication devient tout-ou-rien : une release interrompue en cours laisse le registre incohérent. `pnpm publish -r` couvre le cas nominal ; un échec partiel demande une reprise manuelle.
4. Un auteur de plugin peut écrire une seule contrainte — « exige Perch ≥ 0.2 » — au lieu d'une matrice.
5. Ajoute `@changesets/cli` en devDependency et un workflow de release.

## Règle de réouverture

**Deux, et seulement deux :**

1. **Un paquet acquiert un cycle de vie réellement distinct** — un second renderer officiel, ou un adaptateur maintenu par la communauté à un autre rythme, par exemple un `@perchjs/drizzle`. La question se repose alors pour ce paquet-là, pas pour les cinq.
2. **Le lockstep force des publications vides de façon hebdomadaire** plutôt qu'occasionnelle, mesuré sur au moins dix releases.

Ne rouvre pas ce dossier : la gêne esthétique devant un numéro qui monte sans contenu. C'est le prix connu, et il est payé sciemment.
