# Brief design — Perch

Document de travail à destination d'un agent ou d'un designer. Il ne fait pas
autorité sur les ADR ni sur les PRD : en cas de contradiction, ceux-ci gagnent.

---

## Le prompt à donner tel quel

> Tu conçois le design system d'un framework open source d'interfaces
> d'administration. Lis ce brief en entier avant de produire quoi que ce soit, et
> commence par me poser les questions qui restent ouvertes plutôt que de combler
> les trous par des choix par défaut.
>
> ### Le produit
>
> **Perch** — l'équivalent de Laravel Filament pour NestJS. Un développeur décrit
> une ressource en TypeScript côté serveur, et obtient un panneau
> d'administration complet sans écrire une ligne de front-end. Le rendu est
> React, mais **l'utilisateur du framework ne touche jamais au React** : il ne
> configure ni Vite, ni Webpack, ni Tailwind. Le panneau est servi précompilé.
>
> Baseline : *« Le poste d'observation de ton app Nest. Déclare en TypeScript.
> Regarde apparaître. »*
>
> ### Qui regarde ces écrans
>
> Deux publics, et ils ne veulent pas la même chose :
>
> 1. **Le développeur qui installe Perch.** Il juge en trente secondes, sur une
>    capture d'écran, si le résultat a l'air professionnel ou bricolé. C'est lui
>    qui adopte.
> 2. **L'employé qui utilise le panneau huit heures par jour** — saisie, tri,
>    filtres, actions en masse. Densité, lisibilité et vitesse au clavier
>    comptent davantage pour lui que l'élégance.
>
> Quand les deux s'opposent, **le second gagne**. Un back-office est un outil de
> travail, pas une vitrine.
>
> ### Aucun design system existant n'est attaché — c'est volontaire
>
> **Les tokens sont le livrable, pas le point de départ.** N'attache aucun design
> system préexistant, et n'en dérive pas ta direction visuelle.
>
> Trois raisons, dans cet ordre :
>
> 1. **Perch est un framework dont le design system sera rethémé par ses
>    utilisateurs** (ARCH 13 §9). Il doit donc être coulé pour ça. Le poser sur le
>    preset de quelqu'un d'autre, c'est peindre par-dessus une fondation qui n'a
>    pas été prévue pour porter ce poids.
> 2. **Les presets disponibles sont des systèmes éditoriaux** — grille suisse,
>    fond parchemin, mise en page de journal. Ils sont faits pour des pages qui
>    racontent quelque chose. Un back-office dense, navigable au clavier et
>    vérifié AA en CI a des contraintes opposées.
> 3. **Un preset attaché devient la contrainte**, et il ne reste plus trois partis
>    pris à départager.
>
> Le type visé : **système d'application, dense, token-first.** Sémantique
> uniquement — jamais `blue-500` dans un écran. Clair et sombre à parité dès le
> premier jeton. Primitives Radix habillées par notre propre couche de style.
> Classe de référence : Linear, Supabase Studio, Directus, Filament — pas un
> starter éditorial.
>
> ### Contraintes non négociables
>
> Elles viennent de décisions d'architecture déjà prises. Ne les rediscute pas,
> conçois avec.
>
> - **L'état est autoritatif côté serveur.** L'interface est un interpréteur :
>   zéro logique métier côté client. Conséquence directe pour toi : un champ peut
>   apparaître, disparaître, devenir désactivé ou voir ses options changer **en
>   réponse à un aller-retour réseau**. Il faut donc concevoir les états
>   intermédiaires : chargement d'un champ dépendant, section qui apparaît,
>   liste d'options en cours de rafraîchissement. Un formulaire qui saute
>   visuellement à chaque patch est un échec de design, pas un détail technique.
> - **Trois zones d'état, à traiter différemment à l'écran.** *Canonique* : la
>   vérité du serveur, remplacée à chaque réponse. *Brouillon* : ce que
>   l'utilisateur tape avant le debounce, à protéger visuellement — on n'écrase
>   jamais sa frappe. *UI pure* : section repliée, onglet actif, largeur de
>   colonne, à préserver au travers des mises à jour.
> - **Le debounce est de 400 ms sur le texte, 0 ms sur select, toggle et date.**
>   Le retour visuel doit rendre cette différence compréhensible sans
>   l'expliquer.
> - **Radix pour toutes les primitives interactives** — combobox, dialog, tabs,
>   dropdown. On ne réécrit pas un combobox accessible. Conçois avec ce que Radix
>   sait faire.
> - **Accessibilité : exigence, pas correctif.** Contraste AA minimum, vérifié en
>   intégration continue. Focus visible partout, piégé dans les modales, restitué
>   à la fermeture. Table entièrement navigable au clavier, en-têtes triables
>   actionnables au clavier. Erreurs liées au champ, annoncées.
> - **Rendu de table plat.** Pas de composant React par cellule : une fonction de
>   rendu mémoïsée par *type* de colonne. Un design qui exige un état par cellule
>   est irréalisable ici.
> - **Thémable par tokens.** Un intégrateur doit pouvoir remarquer le panneau
>   sans forker le CSS.
>
> ### Ce que je te demande de produire
>
> **1. Une direction visuelle, en trois propositions distinctes.** Pas trois
> variations d'une même idée : trois partis pris qu'on peut départager. Pour
> chacun, une phrase sur ce à quoi il renonce.
>
> **2. Les tokens.** Couleurs sémantiques (`surface`, `content`, `border`,
> `accent`, `danger`, `warning`, `success` — jamais `blue-500` dans un écran),
> échelle typographique, échelle d'espacement, rayons, ombres, durées
> d'animation. Clair et sombre dès le départ, pas ajouté après.
>
> **3. Les composants de formulaire**, dans leurs états complets — repos,
> survol, focus, désactivé, lecture seule, en erreur, en chargement, vide :
> `TextInput` (avec ses variantes texte, email, mot de passe, URL, numérique),
> `Textarea`, `Toggle`, `Select` (dont select dépendant en cours de
> rafraîchissement, et select de relation avec recherche), `DateTimePicker`
> (date seule et date-heure), `CodeEditor`, et le groupe répétable
> (« repeater ») avec ajout, suppression et réordonnancement.
>
> **4. La table.** En-tête triable, ligne, ligne sélectionnée, sélection
> multiple avec barre d'actions groupées, filtres, pagination, état vide, état
> de chargement, colonne de relation, colonne tronquée. Prévois la densité :
> un utilisateur qui traite 200 lignes par jour ne veut pas de padding
> généreux.
>
> **5. Les surfaces.** Modale, panneau latéral, notification (succès, erreur,
> avertissement), bandeau d'erreur réseau avec identifiant de requête copiable,
> confirmation d'action destructive.
>
> **6. La structure du panneau** — c'est la partie que j'attends le plus, et
> celle qu'on bâcle d'habitude : navigation latérale avec groupes et badges de
> compteurs, fil d'Ariane, en-tête de page avec ses actions, disposition
> formulaire (une colonne, deux colonnes, sections, onglets), page de liste,
> page de détail (« infolist »), tableau de bord avec widgets. Comment tout ça
> se comporte en 1280 px de large, puis en 768.
>
> **7. Les états d'erreur et de vide**, traités comme des écrans à part entière
> et non comme des accidents.
>
> ### Ce que je ne veux pas
>
> - Une énième copie de l'esthétique shadcn/ui par défaut. Si la direction visuelle
>   ne se distingue pas d'un starter Next.js générique, elle a échoué.
> - Des dégradés violets, des « glassmorphism », des cartes flottantes partout.
> - Un design qui ne tient qu'en écran large, ou qui suppose une souris.
> - Des maquettes qui montrent seulement l'état heureux. Les états d'erreur, de
>   chargement et de vide sont la moitié du travail.
> - De la densité sacrifiée à l'élégance. Voir le public n°2.
>
> ### La comparaison utile
>
> Regarde **Filament** (PHP/Laravel) : c'est la cible fonctionnelle et la barre
> qualitative. Regarde aussi **Retool**, **Directus**, **Strapi**,
> **Supabase Studio**, **Linear** pour la densité et le clavier. Dis-moi ce que
> chacun réussit et ce qu'il rate — je préfère un avis argumenté à un consensus.
>
> ### Comment livrer
>
> Commence par la direction visuelle et les tokens, montre-les-moi, attends ma
> validation. Ne produis pas les cinquante composants avant qu'on soit d'accord
> sur les fondations. Et si une contrainte ci-dessus rend un choix de design
> impossible, dis-le-moi au lieu de contourner.

---

## Notes pour moi, hors prompt

**Décision du 6 août 2026 — aucun design system attaché.** L'outil de design
proposait cinq presets (Modernist, Nocturne, Organic, Broadsheet, Industry) ;
aucun n'a été retenu. La raison qui compte n'est pas esthétique : le design
system de Perch *est* un livrable du produit, destiné à être rethémé par ses
utilisateurs, et un framework ne construit pas sa fondation sur le preset d'un
autre. S'y ajoute que ces presets sont des systèmes éditoriaux, alors que la
cible est un système d'application dense.

Cette note existe pour éviter de rouvrir le sujet. Ce qui le rouvrirait : un
preset réellement conçu pour l'outillage dense — dans ce cas il devient un
*candidat* à évaluer comme les autres directions, jamais une contrainte imposée
d'avance.


**Ce qui reste à trancher avant que le design serve à quelque chose :** rien ne
bloque le travail de design, il peut démarrer maintenant et en parallèle du
backend. C'est même l'ordre le plus efficace : le jalon A1 aura besoin de trois
composants finis, et les avoir dessinés d'avance évite de les improviser.

**Les trois composants du chemin critique**, à demander en priorité si le temps
manque : `Select` (avec son état « options en cours de rafraîchissement »),
`TextInput`, et la disposition de formulaire à une colonne. C'est exactement ce
que A1 met à l'épreuve — un select « ville » dont les options dépendent d'un
select « pays ».

**Sources dans ce dépôt**, si l'agent veut vérifier une contrainte :
`docs/13-ARCH-frontend.md` (zones d'état, transport, accessibilité, theming),
`docs/03-PRD-protocol-renderer.md` (protocole d'état), `docs/06-PRD-forms-fields.md`
(catalogue de champs), `docs/07-PRD-tables.md` (table builder),
`docs/08-PRD-actions-notifications.md` (modales et notifications),
`docs/09-PRD-infolists-widgets.md` (page de détail et tableau de bord).
