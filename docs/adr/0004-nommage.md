# ADR 0004 — Nommage : Perch

**Statut :** acceptée · **Portée :** Perch

## Contexte

Deux projets à nommer, avec des registres opposés : un framework qui doit dire autorité et structure, un kit qui doit dire artisanat et écrans prêts.

Un premier candidat, **Plumage**, a été proposé puis rejeté après revue adversariale. Le post-mortem est plus utile que la décision.

## Post-mortem « Plumage »

Justification initiale : le plumage est la partie visible de l'oiseau et **pousse depuis** l'animal — donc l'UI qui émerge du backend. Nid → oiseau → plumage.

Six objections, dont deux fatales :

| # | Objection | Gravité |
|---|---|---|
| 1 | **Sémantique inversée** — *plumage* connote l'apparat, l'ornement. Or l'accusation n°1 contre les générateurs d'admin est d'être **superficiels**. Le nom offre aux détracteurs le mot de leur critique. | fatale |
| 2 | **Trois sauts inférentiels, et le premier est faux** — la marque NestJS n'est pas ornithologique ; le lien nid→oiseau était une invention, pas une perception partagée. | fatale |
| 3 | Deux prononciations divergentes : *PLOO-mij* / *plu-MAHZH* | grave |
| 4 | Aucune forme verbale | moyenne |
| 5 | Zéro information fonctionnelle, sans le budget de notoriété pour la payer | moyenne |
| 6 | Mot du dictionnaire à fort usage mode/beauté → risque d'opposition en classes 9 et 42 | moyenne |

## L'erreur de fond, et le principe qui en découle

L'erreur n'était pas les trois sauts. C'était **la prémisse qu'un nom doit porter la thèse du produit.**

Vérification sur les noms qui ont réussi :

| Nom | Ce que le mot dit | Ce qui porte réellement la thèse |
|---|---|---|
| Filament | un fil incandescent | l'ampoule du logo + *« for your bright ideas »* |
| Prisma | un prisme sépare la lumière | le positionnement |
| Keystone | la pierre qui tient l'arc | la doc |
| Payload | ce qu'on transporte | le produit |

> **Principe retenu : un nom de dev tool porte une image appropriable. Le logo et la baseline portent l'argument.**

**Critères, dans cet ordre :** appropriable · court et dictable · scope npm libre · **pas sémantiquement faux**. Rien de plus. Exiger d'un nom qu'il argumente produit des métaphores que personne ne décode.

## Décision

### Perch — le framework

> Le poste d'observation de ton app Nest.
> **Déclare en TypeScript. Regarde apparaître.**

Cinq lettres, se dicte, un seul saut. **Risque résiduel assumé :** *perch* connote l'observation et non la construction — il rétrécit vers le tableau de bord. Le second vers de la baseline récupère la moitié manquante ; **il n'est pas optionnel**.

Repli : **Facet**.

## Disponibilité vérifiée (npm, août 2026)

| Nom | Scope `@nom` | Nom non-scopé |
|---|---|---|
| `perch` | **libre** | squat mort, v1.0.0 de 2022 |
| `facet` | libre | abandonné, v0.5.0 de 2022 |

⚠️ Zéro résultat de recherche ne prouve pas qu'un scope n'est pas réservé sans publication. À confirmer par `npm org`.

## Conséquences — la défense

**Rhétorique : en ne défendant pas.** Un nom qu'on argumente est un nom qu'on rouvre.

1. Une ligne d'origine dans le README, une entrée « Why the name? » dans la FAQ. Jamais plus.
2. **Ne jamais débattre d'un nom dans un fil de PR.** Réponse unique : lien vers la FAQ.
3. `CONTRIBUTING.md` l'écrit : le nom est une décision close.

**Pratique :** voir `../00-PRD-MASTER.md` §14.4 pour la séquence priorisée. La seule action irréversible si quelqu'un passe avant : **réserver les organisations npm**, cinq minutes.

## Règle de réouverture

**Une seule :** une marque vivante enregistrée en classe 9 ou 42 sur un marché cible. Dans ce cas, renommer **immédiatement** — deux heures aujourd'hui, plusieurs mois après le premier millier d'utilisateurs.

Aucune préférence esthétique, aucun avis de contributeur, aucun commentaire public ne rouvre ce dossier.
