# PRD 08 — Actions, modales & notifications

**Tier :** v0.1 → v0.3 · **Dépendances :** PRD 02, 03, 04

## 1. Objectif

Deux systèmes couplés. Filament les présente comme *« définir des actions réutilisables avec boutons, dropdowns et déclencheurs en masse, avec étapes de confirmation, formulaires en modale, vérifications d'autorisation et exécution synchrone ou en queue »* — et les notifications comme le retour utilisateur associé.

C'est le système qui transforme un CRUD en outil métier : « archiver », « rembourser », « renvoyer l'email », « valider la commande ».

## 2. API — une action

```ts
Action.make('archive')
  .label('Archiver')
  .icon('archive-box')
  .color('warning')
  .requiresConfirmation()
  .modalHeading('Archiver cet article ?')
  .modalDescription('Il ne sera plus éditable.')
  .modalSubmitActionLabel('Archiver')
  .schema([                                        // formulaire dans la modale
    TextInput.make('reason').label('Motif').maxLength(255).required(),
  ])
  .authorize((user, record) => user.isAdmin)
  .visible((ctx) => !ctx.record.archivedAt)
  .action(async (record, data) => {
    await this.posts.archive(record.id, data.reason);
    return Notification.make()
      .title('Article archivé')
      .body('Il ne peut plus être édité.')
      .success();
  });
```

Ce contrat est **identique** partout : ligne de table, header, page Edit, bulk, notification, relation manager, infolist. Une seule classe `Action`. C'est la force du modèle Filament — ne pas la fragmenter.

## 3. Contextes de déclenchement

| Contexte | Reçoit | Tier |
|---|---|---|
| Action de ligne (table) | 1 record | v0.1 |
| Header action (List / Edit) | aucun ou 1 record | v0.1 |
| Bulk action | N records ou un prédicat | v0.1 |
| Action de formulaire (Submit, Save & another) | l'état du formulaire | v0.1 |
| Action groupée (dropdown) | idem | v0.2 |
| Action dans une notification | contexte porté | v0.2 |
| Action dans un relation manager | record enfant | v0.2 |
| Action dans une infolist | record | v0.2 |
| Action de résultat de recherche globale | record | v0.3 |

## 4. Actions prêtes à l'emploi

| Action | Tier | Notes |
|---|---|---|
| `CreateAction` | v0.1 | navigation ou modale |
| `EditAction` | v0.1 | navigation ou modale |
| `ViewAction` | v0.2 | infolist en modale ou page |
| `DeleteAction` / `DeleteBulkAction` | v0.1 | confirmation obligatoire par défaut |
| `ReplicateAction` | v0.2 | `.excludeAttributes()` `.beforeReplicaSaved()` |
| `RestoreAction` / `ForceDeleteAction` (+ bulk) | v0.2 | soft deletes |
| `ImportAction` | v0.3 | CSV, mapping de colonnes, validation ligne par ligne, rapport d'échecs |
| `ExportAction` | v0.3 | CSV/XLSX du résultat filtré, en queue au-delà d'un seuil |
| `AssociateAction` / `AttachAction` / `DetachAction` | v0.2 | relations n-n |

## 5. Modales

| Capacité | Tier |
|---|---|
| Confirmation (heading, description, labels, icône, couleur) | v0.1 |
| Formulaire en modale (schéma complet, réactivité incluse) | v0.1 |
| Slide-over | v0.2 |
| Tailles (`sm` → `7xl`, `screen`) | v0.2 |
| Modale de contenu libre (infolist, custom) | v0.2 |
| Modale à étapes (wizard) | v0.3 |
| Fermeture par échap / clic extérieur configurable | v0.1 |

**Contrainte** : une modale contenant un schéma utilise **exactement** le même moteur et le même protocole d'état qu'un formulaire de page. Pas de chemin de code parallèle — sinon la réactivité y sera cassée et personne ne comprendra pourquoi.

## 6. Exécution

| Mode | Tier | Notes |
|---|---|---|
| Synchrone | v0.1 | défaut |
| Retour de notification | v0.1 | l'action retourne une ou plusieurs notifications |
| Redirection après action | v0.1 | `.successRedirectUrl()` |
| Rafraîchissement de la table | v0.1 | automatique après mutation |
| Queue (BullMQ) | v0.3 | pour import/export et lots longs |
| Suivi de progression | v0.3 | barre de progression sur action longue |
| Annulation | hors périmètre | — |

**Sécurité** : `authorize()` est vérifié **côté serveur au moment de l'exécution**, pas seulement au rendu du bouton. Un bouton masqué n'est pas une protection. Test explicite : appeler l'endpoint d'une action non autorisée renvoie 403 et ne mute rien.

## 7. Notifications

### 7.1 API

```ts
Notification.make()
  .title('Rapport généré')
  .body('Le rapport mensuel est prêt.')
  .icon('document-chart-bar')
  .success()                       // .warning() .danger() .info()
  .persistent()                    // ne disparaît pas automatiquement
  .duration(5000)
  .actions([
    Action.make('download').color('primary').url(`/reports/${id}`),
    Action.make('view').color('gray').url(`/reports/${id}/view`),
  ])
  .send();
```

### 7.2 Canaux

| Canal | Tier | Notes |
|---|---|---|
| Toast in-app (réponse de requête) | v0.1 | le seul indispensable |
| Toast in-app (flash inter-requêtes / après redirection) | v0.1 | survit à une redirection |
| Notifications persistées en base + panneau de cloche | v0.3 | table dédiée, marquage lu/non lu |
| Broadcast temps réel (WebSocket) | v0.3 | pour les jobs asynchrones |
| Email / push | **hors périmètre** | c'est le travail de l'app hôte |

## 8. Critères d'acceptation

1. Une action avec confirmation + formulaire en modale + notification de succès fonctionne sur une action de ligne, une bulk action et un header action, **avec le même code**.
2. `authorize()` refusée → endpoint renvoie 403, aucune mutation, aucune information sur la raison.
3. Une modale contenant un `Select` dépendant est réactive (le protocole d'état fonctionne en modale).
4. Une bulk action sur 500 lignes s'exécute en une transaction et rapporte le nombre d'éléments traités.
5. Une action qui échoue affiche une notification d'erreur lisible — jamais une stack trace, jamais un silence.
6. Une notification de succès survit à une redirection vers la page List.
7. Une action déclenchée deux fois par double-clic n'exécute la mutation qu'une fois (idempotence côté client + garde serveur).

## 9. Hors périmètre

- Envoi d'email / SMS / push (l'app hôte s'en charge).
- Actions planifiées (cron).
- Undo / annulation d'action.
- Chaînage d'actions / workflow engine.
- Signature d'approbation multi-utilisateurs.

## 10. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Deux chemins de code pour les schémas en modale vs en page | **Élevé** | un seul moteur, un seul protocole — test croisé obligatoire |
| Autorisation vérifiée seulement au rendu | **Critique** | test d'attaque en CI sur chaque action prête à l'emploi |
| Double soumission sur action non idempotente | Moyen | désactivation du bouton + jeton de requête |
| Import/export bloque le process Node | Moyen | seuil au-delà duquel l'exécution part en queue (v0.3) |
| Les notifications en base dérivent vers un système de messagerie | Faible | périmètre écrit : feedback d'action, rien d'autre |
