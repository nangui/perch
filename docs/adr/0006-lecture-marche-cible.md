# ADR 0006 — Ce que « marché cible » veut dire dans la règle de réouverture du nom

**Statut :** acceptée · **Portée :** Perch

*Précise et remplace la règle de réouverture de l'[ADR 0004](0004-nommage.md). La décision de nommage elle-même n'est pas rouverte.*

## Contexte

L'ADR 0004 clôt le nom par une règle de réouverture unique :

> Une marque vivante enregistrée en **classe 9 ou 42 sur un marché cible**.

Au moment d'exécuter la recherche d'antériorité prévue par `../00-PRD-MASTER.md` §14.4, cette
formule s'est révélée inapplicable en l'état : « marché cible » supporte deux lectures qui
aboutissent à des décisions opposées sur un même résultat de registre.

- **Lecture territoriale** — un marché cible est un pays ou une zone : France, Union européenne,
  États-Unis. Toute marque vivante en classe 9 y déclencherait la règle.
- **Lecture sectorielle** — un marché cible est un marché de produit : l'outillage pour
  développeurs. Une marque en classe 9 désignant autre chose ne déclencherait rien.

Une règle de réouverture qu'on peut lire de deux façons ne protège de rien : elle déplace le
débat de « faut-il renommer » vers « que voulait dire la règle ». C'est le contraire de sa
fonction.

## Ce que le droit des marques impose

Trois faits, qui contraignent la réponse plus qu'une préférence de rédaction ne le pourrait.

1. **Une marque est territoriale.** Elle ne protège que là où elle est déposée. Un dépôt
   américain n'a aucun effet en France.
2. **Une marque est spécifique aux produits et services désignés.** La protection ne couvre pas
   « la classe 9 » mais le **libellé** déposé à l'intérieur de cette classe.
3. **La classe de Nice n'est pas l'étendue de la protection.** C'est une catégorie administrative
   de classement. Le risque de confusion s'apprécie sur la similarité réelle des produits, pas sur
   l'identité du numéro de classe. La classe 9 couvre aussi bien un jeu vidéo qu'un pilote
   d'imprimante qu'un framework serveur.

Les deux premières conditions sont **cumulatives**. Aucune des deux lectures proposées ne les
respecte : la territoriale ignore la seconde, la sectorielle ignore la première.

## Décision

**« Marché cible » se lit comme la conjonction des deux conditions.** La règle de réouverture de
l'ADR 0004 devient :

> **Une marque vivante déclenche le renommage si, cumulativement :**
> 1. elle est en vigueur dans un **territoire visé** — France, Union européenne, États-Unis,
>    Royaume-Uni ;
> 2. **et** son libellé de produits et services **recouvre l'outillage logiciel destiné aux
>    développeurs**, quelle que soit la classe qui le porte.
>
> **La classe de Nice ne sert qu'à trouver les candidats, jamais à trancher.** Le libellé décide.

Trois précisions qui font partie de la décision :

**Le Royaume-Uni est un territoire visé à part entière.** Depuis le Brexit, une marque de l'Union
européenne n'y produit plus d'effet : une recherche EUIPO ne dit rien du UK. L'omettre est l'erreur
la plus facile à commettre.

**L'usage commercial antérieur non enregistré compte.** L'ADR 0004 disait « enregistrée », ce qui
laissait échapper le cas le plus probable : un produit vendu depuis des années sous le même nom,
dans la même catégorie, sans dépôt. Au Royaume-Uni et aux États-Unis, cet usage fonde des droits
opposables. Il ne déclenche pas le renommage automatiquement, mais il **interdit le dépôt de
marque** et impose un arbitrage explicite documenté.

**Une classe 9 en recouvrement avec un libellé étranger au développement logiciel ne déclenche
rien** — mais reste une zone grise si la marque en cause jouit d'une notoriété, les marques
renommées étant protégées au-delà des produits similaires. Cette zone grise appelle un avis de
conseil, pas une décision de développeur.

## Conséquences

1. Toute recherche d'antériorité doit relever, pour chaque résultat, le **libellé exact** des
   produits et services. Un relevé qui ne consigne que le numéro de classe est inexploitable.
2. Les registres à interroger incluent **UKIPO**, en plus d'INPI, EUIPO, USPTO et des bases
   agrégées.
3. Les résultats factuels de la recherche sont maintenus **hors de ce dépôt**. Un dépôt public
   n'est pas l'endroit où consigner l'analyse des faiblesses juridiques de son propre nom.
4. Aucun dépôt de marque n'est engagé avant lecture des libellés des antériorités trouvées.
5. Les dépôts restent privés jusqu'à ce que la recherche ait conclu pour Perch. Un dépôt privé se
   renomme sans coût ; un dépôt public indexé, non.

## Pourquoi cette précision n'est pas une réouverture

Le nom n'est pas remis en cause. Ce qui est corrigé, c'est un **outil de décision défectueux** :
une règle ambiguë, doublée d'une omission — l'usage non enregistré. La discipline de l'ADR 0004
reste entière : aucune préférence esthétique, aucun avis de contributeur, aucun commentaire public
ne rouvre le nom.

C'est la deuxième fois qu'une vérification de ce dossier échoue pour la même raison de fond, après
le tableau de disponibilité npm corrigé par l'[ADR 0005](0005-scope-npm.md) : **une vérification
qui ne dit pas quelle question elle a posée ne vérifie rien.** Consigner la question, le terme
exact, le registre et la date fait désormais partie de la recherche.

## Règle de réouverture

**Une seule :** une évolution du droit applicable qui modifierait l'articulation entre territoire
et libellé — nouveau titre unitaire couvrant le Royaume-Uni, ou réforme de la portée des classes.

Une insatisfaction sur la formulation ne rouvre pas ce dossier.
