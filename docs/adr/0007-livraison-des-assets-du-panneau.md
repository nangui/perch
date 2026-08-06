# ADR 0007 — Livraison des assets du panneau : `@perchjs/nest` dépend de `@perchjs/ui`

**Statut :** proposée · **Portée :** Perch

## Contexte

Deux documents décrivent la même chose et une règle exécutable l'interdit.

- **ARCH 13 §8** : « `@perchjs/ui` est publié précompilé. **Le `PanelModule` le sert en statique.** L'utilisateur ne configure ni Vite, ni Webpack, ni Tailwind. C'est la promesse produit, pas une commodité. »
- **PRD 04 §4** spécifie la route : `GET {path}/assets/*` → « assets de `@perchjs/ui` ».
- **`.dependency-cruiser.cjs`, `no-adapter-to-adapter`**, sévérité `error`, bloquante : `packages/nest/src` ne peut atteindre `packages/ui/`.

Il n'existe donc aucune arête `nest → ui`, et `PanelModule` doit servir les fichiers de `ui`.

Trois contraintes s'ajoutent, chacune vérifiée :

1. **Résolution.** `.npmrc` interdit délibérément qu'une dépendance non déclarée soit résolvable, « c'est ce qui empêche un paquet d'importer ce qu'il n'a pas déclaré ». Une sonde le confirme : depuis `nest`, toute référence à `@perchjs/ui` échoue sur `not-to-unresolvable` — c'est l'isolation de pnpm qui bloque aujourd'hui, avant même la règle d'architecture.
2. **Manifeste.** ARCH 13 §8 impose des « noms de fichiers hachés, cache immuable ». Un nom haché oblige `PanelModule` à **lire un manifeste** pour savoir quel fichier servir. Ce n'est pas un chemin constant, c'est une donnée produite par `ui`.
3. **ESM.** `@perchjs/ui` est publié en ESM pur (ADR sur le bundler, `attw` : *dynamic import only*). Une application NestJS en CommonJS ne peut pas le `require`.

## Ce que la sonde a établi

Deux fixtures posées dans `packages/nest/src`, puis retirées :

| Construction | Arête vue par dependency-cruiser |
|---|---|
| `import` de `ui` **une fois `ui` déclaré** | **oui** — `no-adapter-to-adapter` se déclenche |
| `require.resolve()` d'une dépendance déclarée | **non** — aucune arête créée |

La première ligne a été mesurée dans les conditions de la décision, pas dans les conditions actuelles : `@perchjs/ui` ajouté en dépendance de `nest`, fixture posée, `pnpm install`, puis tout restauré. Sans cela la sonde ne prouvait rien — `not-to-unresolvable` se déclenchait avant, et la règle d'architecture n'avait jamais l'occasion de parler.

**La frontière garde les imports, pas les résolutions de chemin.** C'est ce qui rend la décision ci-dessous possible, et c'est aussi un angle mort : `require.resolve` suivi d'une lecture de fichier traverse la frontière sans que rien ne le signale.

## Options

| | Ce que ça donne | Pourquoi retenu ou non |
|---|---|---|
| **A. `nest` déclare `ui` en dépendance** | `PanelModule` résout la racine du paquet et sert `dist/` | **retenue** — voir ci-dessous |
| **B. L'utilisateur installe les deux et passe le chemin à `forRoot()`** | aucune arête, règle intacte | rejetée : reporte la plomberie sur l'utilisateur, ce que le produit existe pour supprimer. PRD 04 vise « cette configuration + une resource = un panel qui tourne », et calculer un chemin dans `node_modules` n'en fait pas partie |
| **C. Un troisième paquet `@perchjs/panel-assets`** | `nest` en dépend, `ui` y publie | rejetée : ajoute un paquet à publier, à versionner et à documenter pour résoudre un problème de classement, pas de conception |
| **D. `ui` en `peerDependency` de `nest`** | résolvable, mais la version appartient à l'application hôte | rejetée **sous réserve de l'ADR 0008** — voir ci-dessous |

L'option D est le mécanisme fait pour « j'ai besoin que ce paquet soit là, mais je ne possède pas sa version ». Elle vaut donc exactement ce que vaut cette liberté — et l'ADR 0008 propose de la supprimer : sous une politique de versions en lockstep, l'application hôte n'a aucun choix de version à exercer, et la `peerDependency` n'ajoute que la cérémonie et de moins bons messages d'erreur quand elle n'est pas satisfaite.

**Conséquence à assumer : cette ligne du présent ADR n'est pas décidable seule.** Si l'ADR 0008 est refusé et que les paquets versionnent indépendamment, D devient la meilleure réponse et la décision ci-dessous doit être relue.

## Décision

**`@perchjs/nest` déclare `@perchjs/ui` en dépendance, et ne peut en importer aucun module.**

La frontière qui compte est *« pas de couplage de code »*, pas *« pas de dépendance de paquet »*. Servir un fichier n'est pas importer un module.

1. `@perchjs/ui` devient une `dependency` de `@perchjs/nest`.
2. La règle `no-adapter-to-adapter` **reste inchangée** : tout `import` de `nest` vers `ui` échoue en CI, comme aujourd'hui.
3. Le seul usage permis est la résolution de la racine du paquet, puis la lecture de `dist/` depuis le système de fichiers.
4. **Le manifeste est une API publique versionnée**, au même titre que le contrat de props des renderers (ARCH 13 §7). Il porte sa version ; `PanelModule` refuse de démarrer sur une version qu'il ne connaît pas, plutôt que de servir des fichiers au hasard.
5. Puisque `require.resolve` est invisible à dependency-cruiser, cette permission a **son propre garde-fou** : un test qui échoue si `packages/nest/src` résout autre chose que la racine de `@perchjs/ui`. Un garde-fou que personne n'a vu échouer n'est pas un garde-fou — celui-ci se vérifie comme les treize autres, dans `tooling/boundaries.test.ts`.

## Conséquences

1. Installer `@perchjs/nest` installe `@perchjs/ui`, donc React et Radix. C'est assumé : le panneau **est** le produit, et il n'existe pas d'usage sans interface.
2. Les versions de `nest` et de `ui` doivent avancer ensemble. Cela présuppose une politique de versions en lockstep pour les cinq paquets — **décision distincte, encore à prendre**, et que celle-ci rend nécessaire.
3. Le format du manifeste devient cassant : le changer casse `PanelModule` en silence si rien ne le vérifie. D'où le point 4 ci-dessus.
4. Un intégrateur qui remplace le renderer garde `ui` installé sans l'utiliser. Coût accepté tant que le renderer alternatif reste hors périmètre v0.1.
5. L'angle mort `require.resolve` est désormais **documenté**, pas seulement contourné. Toute autre traversée de frontière par ce moyen est une violation, même si la CI ne la voit pas.

## Règle de réouverture

**Deux, et seulement deux :**

1. Un second renderer officiel apparaît — auquel cas `nest` ne peut plus dépendre d'un renderer particulier, et l'option C redevient la bonne réponse.
2. Le poids installé devient un grief réel et mesuré des utilisateurs, pas une inquiétude théorique.

Une préférence de pureté sur « un adaptateur ne dépend pas d'un adaptateur » ne rouvre pas ce dossier : la règle porte sur le couplage de code, et ce couplage-là reste interdit et vérifié.
