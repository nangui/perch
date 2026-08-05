# Architecture Decision Records

Les décisions structurantes de Perch, avec leur contexte, les options écartées et **la règle qui rouvrirait le débat**.

## Pourquoi ce dossier existe

Une décision non écrite est une décision qui sera reprise. Les six ci-dessous ont chacune été discutées plusieurs fois avant d'être tranchées — sans trace, elles le seraient encore.

Un ADR n'est pas un document vivant. **Il n'est jamais modifié**, seulement remplacé par un ADR ultérieur qui le supersède. C'est ce qui permet de relire pourquoi on a décidé, et pas seulement ce qu'on a décidé.

## Index

| # | Décision | Statut |
|---|---|---|
| [0001](0001-ecosysteme-nestjs.md) | NestJS plutôt que Go ou Rust | acceptée |
| [0002](0002-orm-prisma.md) | Prisma plutôt que Drizzle | acceptée |
| [0003](0003-protocole-etat.md) | État autoritatif serveur, transport JSON + React | acceptée |
| [0004](0004-nommage.md) | Perch — et le principe de nommage | acceptée |
| [0005](0005-scope-npm.md) | Scope npm `@perchjs` plutôt que `@perch` | acceptée |
| [0006](0006-lecture-marche-cible.md) | Lecture de « marché cible » dans la règle de réouverture du nom | acceptée |

## Format

```
Contexte          le problème, en quelques lignes
Options           ce qui a été comparé, sur quels critères
Décision          ce qui est retenu
Conséquences      ce que ça verrouille, ce que ça coûte
Règle de réouverture   ce qui — et seulement ce qui — rouvrirait le débat
```

La dernière rubrique est la plus importante. Sans elle, un ADR ne protège de rien : il suffit qu'une envie revienne pour que tout recommence.
