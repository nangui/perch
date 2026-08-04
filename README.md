# Perch

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
| Décisions | ADR [0001](docs/adr/0001-ecosysteme-nestjs.md) · [0002](docs/adr/0002-orm-prisma.md) · [0003](docs/adr/0003-protocole-etat.md) · [0004](docs/adr/0004-nommage.md) |

## Documentation

```
docs/
├── README.md              ordre de lecture recommandé
├── adr/                    4 décisions structurantes  ← commencer ici
├── REF-filament.md         la cible déconstruite
├── 00-PRD-MASTER.md        vision, roadmap, nom et marque
├── 01 … 11-PRD-*.md        les onze PRDs
└── 12-ARCH-backend.md · 13-ARCH-frontend.md
```

**Point d'entrée :** [`docs/00-PRD-MASTER.md`](docs/00-PRD-MASTER.md) — **ordre de lecture complet :** [`docs/README.md`](docs/README.md)

## Le nom

**Perch.** Le perchoir : le poste d'observation sur tes données.

Le nom est une décision close, documentée dans l'[ADR 0004](docs/adr/0004-nommage.md).
