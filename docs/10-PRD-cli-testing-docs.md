# PRD 10 — CLI, génération de code, testing & doc

**Tier :** v0.1 (CLI) · v0.2 (testing, doc) · **Dépendances :** PRD 01, 02, 05

## 1. Objectif

Trois choses qui ne sont pas des fonctionnalités mais qui décident de l'adoption : la première minute (CLI), la confiance (testing), la découvrabilité (doc).

Filament traite ces trois axes explicitement : générateurs Artisan, chapitre Testing dédié (resources, tables, schemas, actions, notifications), et une doc réorganisée en v4 pour donner *« une vision plus claire de comment les fonctionnalités s'articulent »*, avec plus d'exemples et d'explications du fonctionnement interne. Il a aussi une page **« AI-assisted development »** et un `llms.txt` indexant toute la doc — signe que la consommation de doc par des agents est devenue un critère de produit.

## 2. CLI (v0.1)

### 2.1 Commandes

```bash
# Installation dans une app Nest existante
npx perch init
#  → crée src/panel/panel.module.ts, l'enregistre dans AppModule,
#    détecte le client Prisma, écrit la config, affiche l'URL du panel

# Génération d'une resource depuis un modèle Prisma
npx perch resource User
npx perch resource User --with-view --with-relations --soft-deletes
#  → src/panel/resources/user.resource.ts, enregistrée dans le module

npx perch page Settings
npx perch field StarRating      # squelette serveur + composant React
npx perch doctor                # diagnostic de configuration
```

Intégration au schematic Nest également : `nest g -c @perch/cli resource User`. Les deux entrées doivent exister — les habitudes diffèrent.

### 2.2 Qualité de la génération

**C'est le critère différenciant.** Une resource générée doit être immédiatement bonne, pas un squelette vide. Elle utilise l'inférence de PRD 01 §3.2 :

```ts
// npx perch resource User  →  produit ceci, pas un fichier vide
@PanelResource({ model: 'User', navigationGroup: 'Access', icon: 'users' })
export class UserResource {
  form() {
    return Schema.make([
      Section.make('User').columns(2).schema([
        TextInput.make('name').required().maxLength(255),
        TextInput.make('email').email().required().unique(ignoreRecord: true),
        Select.make('roleId').relationship('role', 'name').required(),
        Toggle.make('isActive'),
      ]),
    ]);
  }

  table() {
    return Table.make()
      .columns([
        TextColumn.make('name').searchable().sortable(),
        TextColumn.make('email').searchable(),
        TextColumn.make('role.name').badge(),
        TextColumn.make('createdAt').dateTime().sortable().toggleable(hiddenByDefault: true),
      ])
      .filters([SelectFilter.make('roleId').relationship('role', 'name')])
      .actions([EditAction.make(), DeleteAction.make()])
      .headerActions([CreateAction.make()]);
  }
}
```

**Règles de génération :**
- Idempotente : régénérer ne détruit pas les modifications manuelles → demander confirmation, proposer un diff.
- Formatée avec le Prettier/ESLint du projet, pas avec le nôtre.
- Champs exclus automatiquement : `id`, `createdAt`, `updatedAt`, `deletedAt`, relations `many`.
- Max 6 colonnes de table, priorisées : champ label, uniques, relations `one`, booléens, dates.
- Aucune dépendance ajoutée sans le dire.

### 2.3 Time-to-first-CRUD

C'est la métrique produit n°1. Chemin cible, **< 15 min** pour un dev qui découvre l'outil :

```
npm i @perch/nest @perch/prisma @perch/ui   (1 min)
npx perch init                                   (1 min)
npx perch resource User                          (30 s)
npm run start:dev  →  ouvrir /admin                (1 min)
```

Tout écart à ce chemin est un bug produit, pas un détail de doc.

## 3. Testing (v0.2)

### 3.1 Helpers fournis

Sans helpers, personne ne testera son panel, et les régressions seront invisibles.

```ts
const panel = await createPanelTest({ module: AdminModule, as: adminUser });

// Schemas
await panel.resource(UserResource).form()
  .assertHasField('email')
  .fill({ countryId: 1 })
  .assertFieldVisible('cityId')
  .assertFieldOptions('cityId', ['Paris', 'Lyon'])
  .fill({ cityId: 2 })
  .submit()
  .assertNoErrors()
  .assertRecordCreated({ email: 'a@b.c' });

// Tables
await panel.resource(UserResource).table()
  .assertCanSeeRecords([u1, u2])
  .filter('roleId', adminRole.id)
  .assertCanSeeRecords([u1])
  .assertQueryCount(3);          // ← garde-fou N+1

// Actions
await panel.resource(PostResource).action('archive', post)
  .assertVisible()
  .call({ reason: 'obsolete' })
  .assertNotification('success', 'Article archivé');

// Autorisation
await panel.as(guestUser).resource(UserResource).assertForbidden();
```

### 3.2 Ce que la CI doit garder

| Garde-fou | Pourquoi | PRD source |
|---|---|---|
| Compteur de requêtes SQL par page | prévenir les N+1 | 01, 07 |
| Budget de latence p95 sur `/state` et `/records` | prévenir la dérive de perf | 03, 07 |
| Test de concurrence (100 requêtes parallèles, aucun état partagé) | immutabilité des builders | 02 |
| Tests d'attaque : état falsifié, action non autorisée, chemin inconnu | sécurité | 03, 08 |
| Test cross-tenant | fuite de données | 04 |
| Test de dépendances : `core` n'importe ni Nest, ni Prisma, ni React | intégrité d'architecture | 02 |
| Test de contrat DMMF | fragilité de l'API Prisma | 01 |

Ces garde-fous existent **dès v0.1**, même si les helpers publics n'arrivent qu'en v0.2.

## 4. Documentation (v0.2)

### 4.1 Structure

Reprendre l'organisation de Filament, qui est excellente : Introduction → Getting started (tour d'ensemble, comment les pièces s'articulent) → Resources → Tables → Schemas → Forms → Infolists → Actions → Notifications → Widgets → Configuration → Navigation → Users → Styling → Advanced → Testing → Plugins → Deployment → Upgrade.

### 4.2 Exigences

| Exigence | Détail |
|---|---|
| Chaque page a un exemple copiable qui **fonctionne** | testé en CI par extraction des blocs de code |
| Chaque champ / colonne / action a sa page dédiée | pas de page fourre-tout |
| Une démo publique déployée | Filament en a une, open-source, avec un vrai jeu de données. Indispensable. |
| Un `llms.txt` indexant toute la doc | l'agent de code de l'utilisateur est un lecteur de première classe |
| Une page « développement assisté par IA » | règles de projet pour agents, conventions, pièges |
| Guide d'upgrade dès la première rupture | jamais rétroactivement |
| Recettes d'intégration auth | Passport-JWT, session, Clerk, Auth.js (PRD 04 §5.1) |

**Le `llms.txt` n'est pas un gadget.** En 2026, une part significative des utilisateurs découvriront l'outil via un agent. Une doc que les agents lisent mal = un outil que les agents recommandent mal.

## 5. Critères d'acceptation

1. Time-to-first-CRUD mesuré < 15 min sur 3 développeurs n'ayant jamais vu l'outil (test utilisateur réel, chronométré).
2. `npx perch resource User` produit un fichier qui compile, passe le lint du projet et fonctionne sans édition.
3. Régénérer une resource modifiée ne détruit rien sans confirmation explicite.
4. `npx perch doctor` détecte : Prisma absent, client non généré, module non enregistré, collision de route, version de Prisma non supportée.
5. Les 7 garde-fous CI du §3.2 sont en place et bloquants sur la branche principale dès v0.1.
6. Tous les blocs de code de la doc sont extraits et compilés en CI.
7. La démo publique est déployée et son code est open-source.

## 6. Hors périmètre

- Interface graphique de génération.
- Migration automatique depuis AdminJS / Payload / Refine.
- Traduction de la doc (anglais en v1 ; le français viendra de la communauté).
- Playground en ligne type StackBlitz (v0.3 si possible).

## 7. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Génération de mauvaise qualité → mauvaise première impression | **Fatal** | l'inférence de PRD 01 est un prérequis, pas un bonus ; test utilisateur chronométré |
| Personne ne teste son panel → régressions invisibles chez les utilisateurs | Élevé | helpers livrés en v0.2, pas en v1 |
| Doc en retard sur le code | Élevé | blocs de code testés en CI ; pas de merge de feature sans page de doc |
| Le CLI casse à chaque version de Nest | Moyen | s'appuyer sur les schematics officiels plutôt que réécrire un générateur |
| `perch init` modifie du code utilisateur et casse quelque chose | Moyen | dry-run par défaut avec diff affiché, confirmation avant écriture |
