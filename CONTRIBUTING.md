# Contribuer à Perch

Merci de l'intérêt porté au projet. Ce document dit comment contribuer utilement, et surtout ce
qui n'est pas à rediscuter.

Perch est en **pré-implémentation** : la documentation est complète et figée, le code n'existe pas
encore. La contribution la plus utile aujourd'hui porte sur la documentation — une contradiction
relevée, un cas non couvert, une pré-condition technique manquante.

## Avant d'ouvrir une issue ou une pull request

1. Lis les [décisions structurantes](docs/adr/) — quatre ADR.
2. Lis le document concerné. [`docs/README.md`](docs/README.md) donne l'ordre de lecture.
3. Vérifie que ce que tu proposes n'est pas listé en **hors périmètre** dans le PRD concerné. Le
   hors périmètre est aussi contraignant que le périmètre : il empêche la dérive vers un CMS.

## Les décisions closes

Chaque ADR porte une **règle de réouverture** : la condition — et la seule — qui rouvrirait le
débat. Si elle n'est pas remplie, le dossier est clos. Une préférence personnelle n'est pas une
règle de réouverture.

**Le nom du projet est une décision close.** Il est documenté dans l'[ADR 0004](docs/adr/0004-nommage.md),
avec le raisonnement complet et le post-mortem du candidat rejeté. **Il n'est pas rediscuté dans
les issues ni dans les pull requests.** Les propositions de renommage sont fermées sans débat,
avec un lien vers cet ADR.

Un ADR n'est jamais modifié. Une décision qui change donne lieu à un **nouvel** ADR qui supersède
l'ancien.

L'usage du nom et du logo est encadré par [`TRADEMARK.md`](TRADEMARK.md).

## Langues

- **Documentation** : français.
- **Code, commentaires, noms de symboles, messages de commit** : anglais.

## Messages de commit

[Conventional Commits](https://www.conventionalcommits.org/), en anglais, à l'impératif, sans
point final.

```
<type>(<scope>): <description>
```

Types : `feat` `fix` `docs` `chore` `refactor` `test` `build` `ci` `style` `revert`
Scopes : `core` `prisma` `nest` `ui` `cli` `docs` `repo`

- La ligne de sujet fait **72 caractères maximum**.
- **Un commit = un changement logique.** Pas de commit fourre-tout.
- Un corps de message si le *pourquoi* n'est pas évident. Il explique le pourquoi, pas le comment.

```
feat(core): resolve dependent select options on the server
docs(adr): record the state protocol decision
```

## Code de conduite

Ce projet suit le [Contributor Covenant](CODE_OF_CONDUCT.md). En participant, tu acceptes de le
respecter.

## Licence

En contribuant, tu acceptes que ta contribution soit publiée sous la [licence MIT](LICENSE) du
projet.
