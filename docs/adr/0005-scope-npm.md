# ADR 0005 — Scope npm : `@perchjs`, pas `@perch`

**Statut :** acceptée · **Portée :** Perch

*Supersède l'[ADR 0004](0004-nommage.md) sur le seul point de la disponibilité npm. La décision de nommage elle-même n'est pas rouverte.*

## Contexte

L'ADR 0004 retient quatre critères de nommage, dont le troisième : **scope npm libre**. Son tableau de disponibilité donnait `@perch` pour « libre », vérifié en août 2026.

Au moment de créer l'organisation, npm l'a refusée.

## Ce que la vérification avait manqué

**npm refuse un nom d'organisation homonyme d'un paquet existant.** Un paquet `perch` a été publié en 2016 ; le nom est donc indisponible comme organisation, quoi qu'indique une recherche de scope.

La vérification posait la mauvaise question. Elle demandait *« le scope `@perch` contient-il des paquets ? »* — la réponse était non, et elle était sans rapport. La bonne question est *« un paquet nommé `perch` existe-t-il ? »*

L'ADR 0004 portait d'ailleurs son propre avertissement, sans en tirer cette conséquence : *« Zéro résultat de recherche ne prouve pas qu'un scope n'est pas réservé sans publication. »*

## Décision

**Le scope de publication est `@perchjs`.** L'organisation est créée.

| | |
|---|---|
| Nom du produit | **Perch** — inchangé |
| Dépôt | `github.com/nangui/perch` — inchangé |
| Baseline, logo, thèse | inchangés |
| Scope npm | `@perchjs/*` |

Les paquets deviennent `@perchjs/core`, `@perchjs/prisma`, `@perchjs/nest`, `@perchjs/ui`, `@perchjs/cli`.

**Ce qui a tranché :** le nom du produit et le scope de publication sont deux décisions distinctes, que le troisième critère de l'ADR 0004 confondait. Le scope est de la plomberie — il n'est ni l'image appropriable, ni l'argument. Renommer le produit pour un conflit de registre aurait jeté une analyse aboutie, dont la contradiction interne du nom est identifiée et résolue.

Le précédent est dans l'écosystème même du produit : **NestJS publie sous `@nestjs`, pas sous `@nest`.** Angular sous `@angular`, Vue sous `@vue`. Le détour est la norme, pas l'exception.

## Correction du tableau de l'ADR 0004

Un ADR n'est jamais modifié. Celui-ci corrige donc les faits, sans y toucher :

| Nom | ADR 0004 disait | Réalité du registre |
|---|---|---|
| `perch` | scope **libre** · squat mort v1.0.0 **de 2022** | organisation **refusée** · paquet v1.0.0 de **2016** |
| `facet` | scope libre · abandonné v0.5.0 **de 2022** | organisation **refusée** — paquet `facet` existant · v0.5.0 de **2022** |

**Conséquence sur le repli :** `@facet` n'était pas davantage disponible. Le repli inscrit à l'ADR 0004 n'aurait pas résolu le problème qui a motivé le présent ADR.

## Conséquences

1. Le critère « scope npm libre » de l'ADR 0004 se lit désormais : **aucun paquet ne porte ce nom.** C'est la seule formulation vérifiable.
2. Un nom de produit n'est plus disqualifié par un scope indisponible : le suffixe est un recours normal.
3. `npm publish` exige `"publishConfig": {"access": "public"}` dans chaque paquet scopé, faute de quoi npm réclame un plan payant.

## Règle de réouverture

**Une seule :** npm libère le nom `perch` — suppression du paquet homonyme de 2016, ou transfert. Le scope migrerait alors vers `@perch`, avec `@perchjs` conservé en alias déprécié.

Aucune préférence esthétique sur `perchjs` ne rouvre ce dossier. Le nom du produit reste régi par l'ADR 0004 et sa propre règle de réouverture.
