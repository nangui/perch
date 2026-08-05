# ARCH 12 — Architecture backend

**Statut :** décision d'architecture · **Complète :** PRD 01, 02, 03, 04

## 1. Les 4 couches et la règle de dépendance

```
┌─────────────────────────────────────────────────────────┐
│  ADAPTERS IN        PanelController · routes · PanelModule│
├─────────────────────────────────────────────────────────┤
│  APPLICATION        ResourceRuntime · StateMachine        │
│                     QueryPlanner · ActionRunner           │
├─────────────────────────────────────────────────────────┤
│  DOMAIN             Component · Field · Schema · Table    │
│                     Action  (= @perchjs/core)             │
├─────────────────────────────────────────────────────────┤
│  ADAPTERS OUT       DataAdapter(Prisma) · Storage · Clock │
└─────────────────────────────────────────────────────────┘
```

**Règle unique, non négociable :** les flèches ne pointent que vers l'intérieur.

| Couche | Peut importer | Ne peut jamais importer |
|---|---|---|
| Domain | rien | Nest, Prisma, React, Express |
| Application | Domain + interfaces de ports | implémentations concrètes d'adapters |
| Adapters | Application + Domain | un autre adapter |

Vérifié par un test de dépendances (`dependency-cruiser`) **bloquant en CI dès v0.1**. C'est ce qui garantit qu'un futur adaptateur Drizzle ou Fastify ne demande aucune réécriture.

## 2. Cycle de vie d'une requête `/state` — un pipeline de 9 étages

Le cœur du produit. Chaque étage est une fonction isolée et testable séparément.

| # | Étage | Responsabilité | Couche |
|---|---|---|---|
| 1 | **Decode** | parser le corps, valider la forme du transport | Adapter in |
| 2 | **Authenticate** | guards Nest → `principal` | Adapter in |
| 3 | **Locate** | résoudre resource + opération + autorisation (`can`) | Application |
| 4 | **Build** | construire l'arbre de schéma pour cette requête | Application |
| 5 | **Sanitize** | filtrer l'état entrant contre l'arbre | Application |
| 6 | **Reduce** | machine à états : apply → hooks → resolve → prune | Application |
| 7 | **Validate** | Zod compilé depuis l'arbre, champs visibles seulement | Application |
| 8 | **Dehydrate** | produire `{ state, schemaPatch, errors }` | Application |
| 9 | **Encode** | sérialiser, en-têtes, statut | Adapter in |

**L'étage 5 est la frontière de confiance.** Tout ce qui arrive du client y est confronté à l'arbre : chemin inconnu, champ invisible, champ `disabled` ou `readOnly` → **écarté silencieusement**. Pas d'erreur explicite : un message qui dit « ce champ est en lecture seule » renseigne l'attaquant.

**L'étage 6 est la seule boucle du système.** Bornée à 5 passes. Si deux passes consécutives produisent le même état, on sort. Au-delà de 5, exception nommant les champs impliqués — jamais un débordement de pile silencieux.

## 3. Où vit la machine à états

**Dans la couche application, pas dans le domaine, pas dans le contrôleur.**

Raison : elle orchestre des objets de domaine *et* des appels d'adapter (options asynchrones, validation `unique`, badges de navigation). Elle a besoin d'I/O. Le domaine reste pur — c'est ce qui le rend testable sans base de données et sans Nest.

Un `Resolver` du domaine ne fait jamais d'I/O lui-même : il reçoit un `ResolverContext` que l'application a peuplé.

## 4. Contexte de requête

Un `AsyncLocalStorage` unique, créé à l'étage 2, portant :

```ts
interface RequestContext {
  requestId: string;
  principal: unknown;
  tenantId?: string;         // scoping (PRD 04 §8)
  sqlQueryCount: number;     // alimente le test anti-N+1
  resolverTrace: string[];   // dépendances tracées (PRD 02 §4)
  cache: Map<string, unknown>;
}
```

**Aucune variable de module mutable, nulle part.** C'est ce qui rend possibles à la fois le scoping multi-tenant, le compteur de requêtes SQL en CI, et le test de concurrence. Trois garde-fous pour une décision.

## 5. Trois niveaux de cache, trois durées de vie

| Niveau | Durée | Contenu | Interdit |
|---|---|---|---|
| **Bootstrap** | vie du process | IR du DMMF, métadonnées de resources, arbre de navigation, prototypes de composants, schémas Zod de base | tout ce qui dépend d'un utilisateur |
| **Requête** | une requête | labels de relations, résultats d'autorisation, badges | — |
| **Aucun** | — | — | **jamais** de cache inter-requêtes d'une valeur dérivée d'une entrée utilisateur |

La troisième ligne est la règle la plus importante du tableau.

## 6. Immutabilité et concurrence

Les composants sont définis **une fois** au bootstrap sous forme de prototypes. Chaque requête en fait un `clone()`. Chaque méthode fluide retourne un nouvel objet.

Un builder mutable partagé entre requêtes fait fuiter l'état d'un utilisateur vers un autre. **C'est une faille, pas un choix de style.** Test de concurrence : 100 requêtes parallèles sur la même resource, avec des états divergents, aucune contamination.

## 7. Taxonomie d'erreurs

| Classe | Origine | Réponse | Fuite d'information |
|---|---|---|---|
| `ValidationError` | étage 7 | 422 + erreurs par champ | aucune |
| `AuthorizationError` | étages 3, 8 | **404**, indistinguable de « n'existe pas » | aucune |
| `IntegrityError` | contrainte FK / unique de la base | 409 + notification lisible | message traduit, jamais le SQL |
| `ResolverError` | code utilisateur dans un resolver | dégradation **locale** du composant | requestId seulement |
| `InternalError` | nous | 500 + requestId | rien, jamais de stack |

Un resolver qui lève une exception ne doit **jamais** produire un 500 : le composant concerné se dégrade, la page vit.

## 8. Coutures d'extension dans le pipeline

Le contrat de plugins (PRD 11) n'est pas une couche à part : ce sont trois points nommés dans le pipeline.

| Étage | Couture | Utilisé par |
|---|---|---|
| 4 (Build) | `SchemaHook` — un tiers modifie l'arbre | E2, injection de champs |
| 6 (Reduce) | traçage des resolvers | graphe de dépendances |
| 8 (Dehydrate) | filtres de payload | masquage par autorisation |

Un plugin n'a **aucun** chemin de code privilégié. S'il a besoin d'un accès que le pipeline ne donne pas, c'est le pipeline qu'on corrige.

## 9. Ce que cette architecture achète

| Décision | Ce qu'elle rend possible plus tard |
|---|---|
| Domaine sans dépendance | adaptateur Drizzle, adaptateur Fastify, tests sans base |
| Pipeline en étages | insérer tenancy, audit, i18n sans toucher au reste |
| Contexte de requête | scoping, compteurs, traçage, sans variables globales |
| Frontière de confiance à l'étage 5 | la sécurité est en un seul endroit, auditable |
| Prototypes immutables | concurrence sûre par construction |
