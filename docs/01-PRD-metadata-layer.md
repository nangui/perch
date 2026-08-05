# PRD 01 — Couche métadonnées (`@perchjs/prisma`)

**Tier :** v0.1 · **Dépendances :** aucune · **Débloque :** PRD 02, 05, 06, 07, 10

## 1. Objectif

Transformer le schéma Prisma en une **représentation intermédiaire (IR)** que le moteur de schémas consomme, sans jamais que `@perchjs/core` connaisse Prisma.

C'est l'équivalent de ce qu'Eloquent offre gratuitement à Filament : savoir, à l'exécution, quels champs existent, de quel type, avec quelles relations et quelles contraintes. Prisma le permet via son **DMMF** (Data Model Meta Format), introspectable au runtime.

## 2. Pourquoi c'est le premier lot

Tout le reste en dépend : les valeurs par défaut intelligentes (`TextInput.make('email')` devine `type=email`, `maxLength`, `required`), la génération de code, la résolution de `'author.name'`, les filtres de relation. C'est aussi le lot le plus mécanique — donc le meilleur pour démarrer.

## 3. Spécification fonctionnelle

### 3.1 L'IR

```ts
interface ModelMeta {
  name: string;              // 'User'
  dbName: string;            // 'users'
  primaryKey: FieldMeta;
  fields: FieldMeta[];
  relations: RelationMeta[];
  uniqueConstraints: string[][];
  hasSoftDelete: boolean;    // détecté par convention (deletedAt) ou config
}

interface FieldMeta {
  name: string;
  kind: 'scalar' | 'enum' | 'json';
  type: 'String' | 'Int' | 'Float' | 'Decimal' | 'Boolean'
      | 'DateTime' | 'Json' | 'Bytes' | 'BigInt';
  isRequired: boolean;
  isList: boolean;
  isId: boolean;
  isUnique: boolean;
  isReadOnly: boolean;       // @default(autoincrement()), @updatedAt
  hasDefault: boolean;
  default?: unknown;
  enumValues?: string[];
  maxLength?: number;        // depuis @db.VarChar(n)
  documentation?: string;    // le commentaire /// devient le helperText
}

interface RelationMeta {
  name: string;              // 'author'
  type: 'one' | 'many';
  targetModel: string;
  foreignKeyFields: string[];// ['authorId']
  referencedFields: string[];
  isRequired: boolean;
  onDelete?: 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';
}
```

### 3.2 Inférence de champ (le vrai apport)

Table de mapping IR → champ par défaut. C'est ce qui rend la génération utile plutôt que bête.

| Métadonnée | Champ inféré | Options auto |
|---|---|---|
| `String` | `TextInput` | `maxLength` depuis `@db.VarChar` |
| `String` + nom contient `email` | `TextInput` | `.email()` |
| `String` + nom contient `password` | `TextInput` | `.password()`, `.dehydrated(false si vide)` |
| `String` + nom contient `url`/`link` | `TextInput` | `.url()` |
| `String` + `@db.Text` | `Textarea` | — |
| `Int` / `Float` / `Decimal` | `TextInput` | `.numeric()`, précision depuis `@db.Decimal` |
| `Boolean` | `Toggle` | — |
| `DateTime` | `DateTimePicker` | `.date()` seul si nom finit par `Date`/`On` |
| `enum` | `Select` | `.options()` depuis `enumValues` |
| `Json` | `KeyValue` (v0.2) | fallback `CodeEditor` |
| relation `one` | `Select` | `.relationship(name, labelField)` |
| relation `many` | *exclu du form* | proposé comme relation manager |
| `isRequired && !hasDefault` | — | `.required()` |
| `isUnique` | — | `.unique(ignoreRecord: true)` |
| `isReadOnly` ou `isId` | *exclu du form* | visible en table et infolist |
| `documentation` non vide | — | `.helperText(documentation)` |

**Détection du champ label** d'un modèle cible, par ordre de priorité : `name` → `title` → `label` → `email` → `slug` → premier `String` unique → clé primaire.

### 3.3 Résolution de chemins de relation

`'author.country.name'` doit se résoudre en :
- une validation à la compilation (type-level, voir PRD 02 §5)
- un plan de chargement Prisma : `{ include: { author: { include: { country: true } } } }`
- un accès à la valeur sans planter sur `null` intermédiaire

Profondeur max : **3 niveaux** en v0.1. Au-delà → erreur explicite.

### 3.4 Couche d'exécution

Un `PrismaDataAdapter` implémentant l'interface que `core` définit :

```ts
interface DataAdapter {
  meta(model: string): ModelMeta;
  findMany(q: Query): Promise<{ rows: Row[]; total: number }>;
  findOne(model: string, id: unknown, include?: IncludePlan): Promise<Row | null>;
  create(model: string, data: WriteTree): Promise<Row>;
  update(model: string, id: unknown, data: WriteTree): Promise<Row>;
  delete(model: string, ids: unknown[]): Promise<number>;
  transaction<T>(fn: (tx: DataAdapter) => Promise<T>): Promise<T>;
}
```

`WriteTree` supporte les écritures imbriquées (`create`/`connect`/`update`/`delete` de Prisma) — c'est ce qui rend le Repeater du critère A3 possible.

## 4. Contraintes techniques

- **Chargement du DMMF** : via `prisma.$dmmf` sur le client généré. Aucune lecture du fichier `.prisma` (fragile), aucun parsing de SQL.
- **Coût** : le DMMF est lu **une fois au bootstrap** et mis en cache. Zéro accès en chemin chaud.
- **Résilience de version** : le DMMF n'est pas une API publique stable de Prisma. → l'accès est isolé dans **un seul fichier**, `dmmf-reader.ts`, avec un test de contrat qui échoue bruyamment si la forme change. Documenter la plage de versions Prisma supportée.
- **N+1** : toute colonne de relation doit produire un `include`, jamais une requête par ligne. Test de non-régression comptant les requêtes SQL.

## 5. Critères d'acceptation

1. Sur un schéma Prisma de 12 modèles avec relations 1-1, 1-n et n-n, `meta()` retourne l'IR complet sans erreur.
2. `TextInput.make('email')` sur `User` produit automatiquement `required`, `email`, `maxLength=255` sans configuration.
3. `TextColumn.make('author.country.name')` sur une table de 50 lignes génère **une seule** requête SQL.
4. Un chemin de champ inexistant échoue à la **compilation** TypeScript.
5. Un `WriteTree` avec 3 enfants imbriqués s'exécute dans une transaction unique et rollback intégralement en cas d'échec du 3e.
6. Le bootstrap sur 50 modèles prend < 200 ms.

## 6. Hors périmètre

- Drizzle, TypeORM, Mongoose (l'interface `DataAdapter` les rend possibles ; on n'en écrit aucun).
- MySQL, SQLite, MongoDB.
- Migrations (c'est le travail de Prisma).
- Champs polymorphes.
- Relations self-referential profondes (> 3 niveaux).

## 7. Risques

| Risque | Mitigation |
|---|---|
| DMMF change entre versions de Prisma | isolation dans un fichier + test de contrat + plage de versions documentée |
| Inférence trop « magique », surprend l'utilisateur | toute inférence est surchargeable ; un mode `strict` désactive l'inférence par nom |
| Écritures imbriquées Prisma trop limitées pour A3 | prototyper A3 **pendant** ce lot, pas après |
