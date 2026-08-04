# oss — espace de travail

Deux projets open-source, un dossier de documentation commun.

```
~/bin/dev/oss/
├── README.md          ← ce fichier
├── docs/
│   ├── adr/            5 décisions structurantes  ← commencer ici
│   ├── perch/         15 documents — PRDs + architecture + référence
│   └── atelier/        5 documents — brief + analyses + architecture
├── perch/             code à venir
└── atelier/           code à venir
```

---

## Perch

> Le poste d'observation de ton app Nest.
> Déclare en TypeScript. Regarde apparaître.

Un framework UI open-source pour **NestJS**. On définit une resource en TypeScript, on obtient un panel complet, on n'écrit jamais de front. Équivalent de Laravel Filament pour l'écosystème Node.

| | |
|---|---|
| Stack | NestJS · Prisma · PostgreSQL · React |
| Licence | MIT (cœur) |
| Statut | pré-implémentation — 14 documents figés |
| Scope npm | `@perch/*` — vérifié libre |
| Chemin critique | jalon **A1** : select dépendant réactif, zéro JS utilisateur |
| Décisions | ADR [0001](docs/adr/0001-ecosysteme-nestjs.md) · [0002](docs/adr/0002-orm-prisma.md) · [0003](docs/adr/0003-protocole-etat.md) |

**Documentation :** [`docs/perch/00-PRD-MASTER.md`](docs/perch/00-PRD-MASTER.md)

## Atelier

> Les écrans React Native sont déjà taillés.
> Assemble, ajuste, expédie.

Un kit de maquettes UI **React Native** prêtes à l'emploi, avec aperçu navigateur par URL.

| | |
|---|---|
| Stack | Expo SDK 57 · RN 0.86 · Uniwind · react-native-reusables |
| Statut | brief validé — architecture actée |
| Scope npm | `@atelier/*` — vérifié libre |
| Rendu | primitives RN stylées — ADR [0005](docs/adr/0005-rendu-rn.md) |
| Chemin critique | jalon **B1** : inscription complète sur iOS, Android, web, RTL, texte 200 % |

**Documentation :** [`docs/atelier/00-BRIEF.md`](docs/atelier/00-BRIEF.md)

---

## Ce que les deux projets ont en commun

Le même problème sous deux formes : **un schéma déclaratif produit une UI rendue.** Perch construit le moteur de schémas et sa sérialisation ; Atelier construit le renderer et le système de tokens.

Ne pas les coupler maintenant. Mais garder la frontière schéma/renderer propre des deux côtés — l'option de les faire converger restera ouverte gratuitement.

## À faire aujourd'hui

- [ ] Réserver les organisations npm `perch` et `atelier`, publier un `0.0.0` vide sous chacune *(5 min — seule perte irréversible)*
- [ ] Recherche d'antériorité de marque, classes 9 et 42, FR + UE + US
- [x] ~~Trancher le rendu d'Atelier~~ → primitives RN stylées
