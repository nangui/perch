# PRD 11 — Extensibilité, plugins & écosystème

**Tier :** v0.1 (le contrat) → v2 (l'écosystème public) · **Dépendances :** PRD 02, 03, 04

## 1. Pourquoi ce PRD existe maintenant

**949+ plugins communautaires.** C'est le chiffre affiché par Filament, à côté de ses 31,7K étoiles et 32,8M téléchargements. Ce n'est pas une conséquence du succès, c'est **la cause** : un utilisateur de Filament témoigne que *« dès qu'il rencontre quelque chose qui n'est pas déjà dans le framework, la communauté a presque toujours résolu le problème avec un plugin »*.

Le vrai fossé concurrentiel de Filament n'est pas son code. C'est son écosystème.

**Conséquence opérationnelle :** on ne publie **pas** d'API de plugins en v0.1. Mais on **conçoit le contrat en v0.1**, parce que c'est la seule chose de tout ce projet qu'on ne pourra pas rétrofitter. Une architecture qui n'a pas prévu l'extension ne devient jamais extensible — elle se fait forker.

## 2. Les 6 points d'extension à câbler en v0.1

Même sans API publique, ces coutures doivent exister dans le code dès le début.

| # | Point d'extension | Mécanisme | Cas d'usage réel |
|---|---|---|---|
| E1 | **Configuration globale d'un composant** | `TextInput.configureUsing(fn)` | forcer `maxLength` par défaut partout, changer un style global |
| E2 | **Injection dans un schéma existant** | `SchemaHook` par resource + position | un module « audit » ajoute `createdBy` à toutes les resources |
| E3 | **Nouveau type de champ / colonne / entry** | registre serveur + registre React | champ `StarRating`, colonne `Sparkline` |
| E4 | **Render hooks** | positions nommées dans le chrome | injecter une bannière, un bouton dans la topbar |
| E5 | **Nouvelle resource / page fournie par un package** | le plugin est un `DynamicModule` Nest | un plugin « Permissions » livre sa resource `Role` |
| E6 | **Assets (CSS/JS) d'un plugin** | enregistrement auprès du `PanelModule` | un plugin qui a besoin de sa lib front |

**E2 est le critère d'acceptation A4 du PRD 00.** Si un module Nest tiers ne peut pas injecter un champ dans une resource qu'il ne possède pas, aucun écosystème n'est possible. C'est un jalon v0.1, pas v2.

## 3. Le contrat de plugin (v2, conçu en v0.1)

Filament distingue deux natures de plugins, distinction à reprendre :

| Nature | Portée | Exemple |
|---|---|---|
| **Panel plugin** | enregistre resources, pages, widgets, navigation dans un panel | plugin de gestion de rôles |
| **Standalone plugin** | fournit un composant réutilisable, sans panel | un champ, une colonne |

```ts
export class AuditLogPlugin implements PanelPlugin {
  id = 'audit-log';

  register(panel: PanelBuilder) {
    panel
      .resources([AuditLogResource])
      .widgets([RecentActivityWidget])
      .renderHook('topbar.end', AuditIndicator)
      .assets({ css: ['audit.css'] });
  }

  // E2 : injection dans les schémas d'autrui
  extendResourceSchemas(resource: ResourceMeta, schema: Schema) {
    if (!resource.auditable) return schema;
    return schema.push(
      Section.make('Audit').collapsed().schema([
        TextEntry.make('createdBy.name'),
        TextEntry.make('updatedAt').dateTime(),
      ]),
    );
  }
}
```

Filament propose aussi des **resources et pages configurables** par les plugins — la possibilité pour l'utilisateur final de reconfigurer ce qu'un plugin fournit. À reprendre en v2 : un plugin dont les resources sont figées est un plugin qu'on forke.

## 4. Règles de conception non négociables

1. **Le cœur n'a aucun cas particulier de plugin.** Si un plugin a besoin d'un accès que le cœur ne donne pas à tous, c'est le cœur qu'il faut corriger.
2. **Tout point d'extension est versionné et documenté.** Un point d'extension non documenté sera utilisé quand même, puis cassé, puis reproché.
3. **Un plugin ne peut pas contourner l'autorisation.** Les schémas injectés passent par le même filtrage serveur (PRD 03 §3.2). Un plugin ne doit pas pouvoir exposer un champ qu'un utilisateur n'a pas le droit de voir.
4. **Ordre d'exécution déterministe.** Deux plugins modifiant la même resource s'appliquent dans un ordre stable et déclaré, pas dans l'ordre de résolution des modules.
5. **Défaillance isolée.** Un plugin qui lève une exception dégrade sa propre zone, pas le panel entier.
6. **Pas d'ouverture prématurée.** L'API n'est publiée qu'en v2, une fois le cœur stable. Publier tôt = geler des erreurs et empêcher les plugins de survivre à v1.

## 5. Écosystème (v2)

| Brique | Description |
|---|---|
| Catalogue | page listant les plugins, cherchable, avec compatibilité de version. Filament héberge un catalogue de 949+ plugins sans les vendre. |
| Convention de nommage | `perch-plugin-*` sur npm, pour la découvrabilité |
| Template de plugin | `npx perch plugin create` |
| Matrice de compatibilité | version de plugin × version de cœur, vérifiée automatiquement |
| Badge de qualité | tests présents, doc présente, maintenu récemment |

## 6. Surface commerciale future — **hors périmètre actuel**

Documenté pour ne pas fermer les portes. Modèle observé chez Filament, dans l'ordre de ce qui marche :

| # | Levier | Ce que fait Filament | Applicabilité |
|---|---|---|---|
| 1 | **Sponsoring par tiers** | GitHub Sponsors avec tiers Agency Partner / Gold / Silver / Bronze, logos sur le site et dans la doc | Le plus simple, dès que la traction existe |
| 2 | **Plugins officiels payants** | vend son plugin *Custom Dashboards* (dashboards en drag & drop) tout en gardant le framework gratuit | Le plus prometteur. Candidats identifiés dans les PRDs : dashboards drag & drop (09), vues de table sauvegardées + quick filters (07), command palette, RBAC avec éditeur graphique |
| 3 | **Marché de plugins tiers** | héberge le catalogue, ne prend pas de commission ; des tiers vendent leurs propres plugins commerciaux | Effet réseau, revenu indirect |
| 4 | **Consulting** | page dédiée + réseau d'agences partenaires | Dépend de la notoriété personnelle |
| 5 | **Shop** | goodies | Marginal |

### Décisions de principe, à graver maintenant

- **Le cœur reste MIT et fonctionnellement complet.** On ne mutile jamais le cœur pour vendre. C'est ce qui a fait la réputation de Filament face à Nova (payant) et Backpack (par paliers).
- Toute monétisation passe par des **plugins additifs**, jamais par des fonctionnalités retirées du cœur.
- Un plugin payant ne doit **jamais** avoir besoin d'un point d'extension privé. S'il en a besoin, le point d'extension devient public pour tous.
- Aucune télémétrie, aucun compte requis, aucune phone-home.
- Décision de licence à documenter avant v1 : MIT pour le cœur, licence commerciale séparée par plugin.

**Statut : rien de tout cela n'est construit avant v2.** Ce PRD sert uniquement à garantir que l'architecture ne l'interdit pas.

## 7. Critères d'acceptation

### v0.1
1. **A4** — un module Nest tiers, dans un package séparé, ajoute un champ à `UserResource` sans modifier son code source.
2. `TextInput.configureUsing()` appliqué au bootstrap affecte tous les `TextInput` de tous les panels.
3. Un champ custom (classe serveur + composant React) fonctionne bout en bout, incluant la réactivité et la validation.
4. Un composant inconnu côté client n'écrase pas le rendu de la page.
5. Un schéma injecté par un tiers subit le même filtrage d'autorisation qu'un schéma natif (test d'attaque).

### v2
6. Deux plugins modifiant la même resource s'appliquent dans un ordre déterministe et documenté.
7. Un plugin qui lève une exception au `register()` est désactivé avec un message clair ; le panel démarre.
8. Un plugin déclarant une version de cœur incompatible est refusé au bootstrap avec un message actionnable.

## 8. Hors périmètre

- Le catalogue, le template de plugin, la matrice de compatibilité (v2).
- Toute forme de facturation, licensing, gestion de clés.
- Sandboxing / isolation de sécurité des plugins (ils tournent dans le process ; documenté comme tel).
- Marketplace avec paiement intégré.

## 9. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| L'architecture v0.1 ne permet pas l'extension → il faut tout réécrire pour v2 | **Fatal** | A4 est un jalon **v0.1**, testé, non reportable |
| Publier l'API trop tôt gèle des erreurs de design | Élevé | API interne mais fonctionnelle en v0.1 ; publique seulement en v2 |
| Un plugin contourne l'autorisation → fuite chez un utilisateur | **Critique** | filtrage serveur unique, jamais bypassable ; test d'attaque sur schéma injecté |
| Pas d'écosystème = pas de fossé concurrentiel | Élevé | écrire 3 plugins nous-mêmes en v2 pour prouver l'API et amorcer |
| La monétisation dégrade la confiance | Élevé | principe écrit publiquement : le cœur ne sera jamais mutilé |
