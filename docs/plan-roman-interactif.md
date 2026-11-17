# Roman interactif / Interactive novel

Issue #84. Étude complète (outils, structures, formats, publication, points juridiques) : document « MondoWrite Interactif »
de novembre 2026. Ce plan n'en garde que les décisions et le détail de chaque lot.

## Décisions (14 et 16 novembre 2026)

- **Un type de projet dans MondoWrite**, pas une app séparée, promu sous le nom « MondoWrite Interactif ».
- **D'abord derrière une option « Fonctions expérimentales »** (réglage de l'appareil, coupé par défaut).
- **La forme du livre-jeu, sans son système de jeu** : des liens entre scènes et des variables simples (objets,
  clés, mots de passe). Pas de caractéristiques prédéfinies, pas de combats, pas de dés intégrés.
- **Ne jamais écrire « livre dont vous êtes le héros »** (marque de Gallimard) : « livre-jeu », « roman
  interactif », « fiction interactive ». Rien de l'univers ni du texte des règles des Défis fantastiques.
- **Langage Ink** (inkle, MIT) comme format compilé ; les scènes restent en Markdown, les choix dans un bloc
  ` ```choix ` en fin de scène (syntaxe Ink réduite : `*`, `->`, `~`, `{ }`).
- **Le canevas construit l'arborescence** dans une vue à part, « Carte des choix », synchronisée avec le texte
  dans les deux sens ; le canevas actuel et son fichier ne sont jamais touchés.
- **Images dans le récit** : fonction du cœur, utile aussi aux romans classiques (lot 1).
- **Export web d'abord**, livre-jeu imprimé ensuite (EPUB, PDF, sections mélangées et numérotées).
- **Assistant externe (MCP)** : outils propres aux projets interactifs (lot 6).
- Une édition séparée reste possible plus tard : même dépôt, même format de projet, conteneur iCloud partagé.

## Lots

| Lot | Contenu |
| --- | --- |
| 0. Isolation | Ce document ; voir ci-dessous |
| 1. Images (cœur) | `medias/`, insertion, texte alternatif, exports (partie 1 faite) |
| 2. Carte des choix | Présentation du Plan, flèches de choix, scène créée par une flèche, bloc `choix` (fait) |
| 3. Lecture et compilation | Ink par inkjs, Mode Lecture, « Lire à partir d'ici », export .ink (fait) |
| 4. Variables | Faits et compteurs, « Seulement si » et « Donne » sur les choix (fait) |
| 5. Vérificateur | Sans fin, inaccessibles, blocages, faits (fait) ; parties automatiques à décider |
| 6. Assistant IA interactif | Outils MCP (fait) |
| 7. Export web | HTML autonome |
| 8. Export livre-jeu | Mélange, numérotation, « rendez-vous au N », EPUB et PDF |
| 9. Import | Twee 3 et Ink |
| 10. Storylets | Option, à décider après retours |

## Lot 0 · Isolation (fait sur la branche `roman-interactif`)

Règle : un roman ou un scénario existant ne voit, ne lit ni ne modifie rien de la partie interactive.

- **Format** : un roman interactif est un **roman** (`kind` « roman ») dont `cosmos.json` porte en plus
  `interactive: true`. La clé n'est pas dans `KNOWN_META` : elle voyage dans `metaKeep` et toute version depuis
  octobre 2026 la réécrit telle quelle. Une version sans le module, ou avec l'option coupée, ouvre donc ce projet
  comme un roman sans rien perdre. Pas de troisième `kind` : tout le code qui teste `kind === "scenario"` reste
  juste, et `useVocab` n'a rien à apprendre.
- **Module** : `src/interactive/` (pur, testé par `src/__tests__/interactive.test.ts`). Tout ce qui touche à la
  fiction à choix passe par lui : `isInteractiveMeta`, `interactiveMeta`, `readExperimental`,
  `interactiveOffered`, `showsInteractive`. Les lots suivants y ajoutent leurs fichiers.
- **Option expérimentale** : réglage de l'appareil `experimental` (`{ interactive: boolean }`, settings.ts),
  case « Roman interactif » sous « Fonctions expérimentales » (Réglages, onglet général). Coupée : la page des
  projets ne propose pas le roman interactif, et un roman interactif s'ouvre comme un roman.
- **Création** : « Un roman interactif » sur la page des projets, seulement si l'option est active ;
  `createProject({ …, interactive: true })` pose `kind: "roman"` et `interactive: true`.
- **Option de compilation** : `VITE_NO_INTERACTIVE=1` fabrique une version sans le module (`INTERACTIVE_BUILD`
  faux) : ni case dans les Réglages, ni type proposé.
- **Projet ouvert** : Réglages › Ce projet dit « Roman interactif » sous le type (option active seulement).
- **Pas encore** : libellé dans la liste des projets
  (la liste ne garde que `kind`).

## Lot 1 · Images dans le texte des scènes (partie 1 faite)

Pour tout roman, interactif ou non. Rien ne change pour un projet sans image.

- **Fichier** : l'image est copiée dans `medias/` sous un nom neuf, comme celles des cartes (jamais supprimée par
  l'app). Dans `manuscrit/<id>.md` : `![description](../medias/nom.jpg "page")`, lien relatif lisible par tout
  éditeur Markdown. Le titre Markdown est la place : absent = dans le texte, `page` = seule sur sa page,
  `chapter` = ouverture de chapitre.
- **En mémoire** : `<img data-media alt data-place>`, nœud TipTap `sceneImage` (bloc atome, éditeurs `prose`
  seulement : manuscrit et carte Scène agrandie). `sanitizeHtml` refait une image propre ou la retire
  (`mediaFromSrc` : seulement un nom de `medias/`, jamais une adresse, un `data:` ou un autre dossier).
- **Gestes** : coller ou déposer une image dans le texte ; « Insérer une image… » (⋯ du Manuscrit, palette,
  Édition du Mac) ouvre la fenêtre Photos (appareil ou photo libre, crédit en italique sous l'image). Sous
  l'image : description, place, « Retirer l'image ». Une image ne se pose jamais avant le repère de la première
  scène (`insideScene`).
- **Exports** : Markdown, Word, EPUB (images dans `OEBPS/images/`), page web, PDF du manuscrit par le bloc
  `image` d'`ExportDoc` ; la description devient le texte alternatif. Une scène faite d'une seule image n'est
  pas vide (`isBlank`). Sauvegardes : images du manuscrit copiées (`manuscriptImages`).
- **Versions d'avant** : une version sans ce lot retire l'image d'une scène qu'elle réenregistre (le fichier
  reste dans `medias/`). Accepté, à dire dans les notes de version.
- **Partie 2, reste** : livre broché KDP (place, contrôle 300 DPI), vignette de l'image sur la carte Scène,
  étiquette Ink `# image:` (lot 3), effets de la place dans les exports.

## Lot 2 · Carte des choix (fait sur la branche `roman-interactif`)

Le texte des scènes reste la seule source : chaque geste sur la carte écrit dans le bloc de choix de la scène, et
chaque choix tapé dans le texte apparaît sur la carte.

- **Format** : en fin de `manuscrit/<id>.md`, un bloc de code Markdown ` ```choix `, une ligne par choix :
  `* [Texte du choix] -> nom_de_scene`, `* { condition } [...] -> ...` (lue, pas encore modifiable : lot 4),
  `-> END` pour une fin. Toute autre ligne est gardée telle quelle. En mémoire : `<pre data-choices="true">`.
- **Noms des scènes** (`sceneSlugs`) : tirés du titre (`la_cour`) ; deux scènes au même titre prennent la fin de leur
  identifiant (`la_cour_k3x9`). Les noms ne dépendent jamais de l'ordre : déplacer ou ajouter une scène ne renomme
  rien. Une scène renommée, ou qui entre en collision, fait suivre les choix qui y mènent (abonnement en fin de
  `store.ts`, suspendu pendant une annulation).
- **Places de la carte** : `choiceMap` de cosmos.json (`{ pos: { id: [x, y] } }`), gardée par `metaKeep` comme
  `interactive`, hors historique. Pas de fichier `interactif/carte.json` (prévu au départ) : une clé de cosmos.json
  profite de tout ce que le format sait déjà faire (iCloud, conflits, .zip, sauvegardes). Une scène sans place se
  pose à droite de celle d'où part son choix (`layoutChoiceMap`).
- **Gestes** : tirer une flèche entre deux scènes (un choix), la lâcher dans le vide (nouvelle scène et son choix),
  menu ⋯ d'une scène (Écrire la scène, Ajouter un choix vers…, Nouvelle scène après celle-ci, Ajouter un choix
  « Fin »), flèche choisie : son texte et « Retirer ce choix » dans le bandeau du haut, Suppr la retire.
  Manuscrit : encadré « Choix » en fin de scène (texte, destination numérotée comme le volet, retirer, ajouter),
  « Ajouter un choix » dans le ⋯ de la barre.
- **Annuler** : chaque geste de la carte est une étape ; l'annulation ne rend que les blocs de choix
  (`choicesAfterUndo`), jamais le reste du texte, qui a l'historique de l'éditeur.
- **Mots** : le bloc de choix ne compte pas dans les mots d'une scène.
- **Reste** : deux choix vers la même scène se superposent sur la carte ; conditions et variables (lot 4) ;
  vérificateur (lot 5) ; guide de l'utilisateur à écrire avant la sortie de l'option expérimentale.

## Lot 3 · Lecture et compilation (fait sur la branche `roman-interactif`)

- **Ink par inkjs** (MIT, compilateur compris, chargé à la demande : environ 60 Ko compressés), pas de crate Rust :
  la même lecture marche dans l'app de bureau, sur mobile et dans le navigateur.
- **Texte Ink** (`interactive/ink.ts`, pur, testé avec inkjs) : `-> départ`, puis une section par scène
  (`=== nom ===`), son texte en lignes, chaque image en étiquette `# image: nom`, ses choix tels qu'écrits (les lignes
  inconnues passent telles quelles : c'est là que viendront variables et conditions). Une scène sans choix ni renvoi
  finit l'histoire (`-> END`). Le texte de l'auteur est rendu inerte (`escapeInk`) : rien de ce qu'il écrit ne devient
  une instruction. Gras et italique ne passent pas encore. Chaque ligne garde sa scène : une erreur du compilateur
  est rapportée à la scène, avec « Ouvrir la scène » (`inkProblems`).
- **Mode Lecture** (`PlayDialog`, fenêtre `play`, état `interactive/playState.ts`) : l'histoire comme la lira le
  lecteur, choix en boutons (touches 1 à 9), « Revenir au choix précédent », « Recommencer », « Écrire « scène » »
  (la scène où l'on est, `sceneOfPath` puis les visites). Entrées : « Lire l'histoire » (carte des choix, palette,
  Présentation du Mac), « Lire à partir d'ici » (⋯ d'une scène de la carte, ⋯ du Manuscrit).
- **Export Ink** : « Ink (.ink) » dans le menu Exporter d'un roman interactif, ouvrable dans Inky.
- **Exports suivis** (Word, EPUB, PDF, Markdown, page web) : le bloc de choix n'y est plus imprimé (`htmlToBlocks`).
- **Reste** : gras et italique dans la lecture.

## Lot 4 · Faits et compteurs (fait sur la branche `roman-interactif`)

- **Un fait** est ce que le lecteur apprend ou obtient en chemin (« a trouvé la clé ») : une variable Ink booléenne.
  **Un compteur** est une variable entière, écrite à la main (`~ pieces += 1`, `{ pieces >= 3 }`). Rien d'autre :
  pas de caractéristiques, de combats ni de dés livrés.
- **Format** : un effet est une ligne `~ …` juste sous son choix, dans le bloc ` ```choix ` (`  ~ cle = true`,
  `effects` du choix ; un `~` sans choix au-dessus reste une ligne gardée). La condition reste `{ … }` devant le
  libellé. Retirer un choix retire ses effets. Rien n'est déclaré à part : les variables se lisent dans les choix
  (`storyFacts`, `interactive/facts.ts`, pur et testé). Seul le libellé d'un fait est gardé, dans `storyFacts` de
  cosmos.json (`{ "cle": "a trouvé la clé" }`, gardé par `metaKeep`, hors historique). Le nom d'un fait vient de
  son libellé (`newFactName`) et ne prend jamais celui d'une scène ni un mot d'Ink.
- **Réglages d'un choix** : « Seulement si » (toujours, un fait, « pas : » un fait) et « Donne » (rien, un fait),
  avec « Nouveau fait… » dans les deux listes. Dans le bloc du texte (`choicesNode.ts`) et dans le bandeau d'une
  flèche de la carte (`ChoiceRules.tsx`). Une condition ou des effets écrits à la main restent tels quels et
  s'affichent en clair.
- **Carte des choix** : une flèche soumise à une condition est en pointillé, son étiquette dit « si … » et « + … » ;
  bouton « Faits · N » et volet « Ce que sait le lecteur » (libellés modifiables, où sert chaque fait, alerte
  quand un fait demandé n'est jamais donné, « Oublier ce fait » pour un fait qui ne sert plus).
- **Ink** : `VAR cle = false // a trouvé la clé`, `VAR pieces = 0` en tête ; un choix à effets s'écrit sur
  plusieurs lignes (`* [..]`, `~ …`, `-> …`). Un choix sans texte reçoit « Continuer » (Ink cacherait un choix vide,
  défaut du lot 3 corrigé ici).
- **Lecture** : « Ce que sait le lecteur » sous la barre, faits acquis et compteurs non nuls.
- **Reste** : outils MCP (lot 6).

## Lot 5 · Vérificateur (fait sur la branche `roman-interactif`)

- **Règles** (`interactive/verify.ts`, pur et testé ; chemin suivi par les choix et les renvois `-> nom`, depuis la
  première scène, sans tenir compte des conditions) : aucune fin atteignable (`noEnding`), scène qu'aucun choix
  n'atteint (`unreachableScene`), choix sans destination (`brokenChoice`), scène dont tous les choix demandent un
  fait (`lockedScene`), fait demandé que rien ne donne (`factNeverGiven`), fait donné seulement après, ou sur un
  chemin qui ne mène pas à la scène (`factTooLate`), scène atteinte sans choix ni « Fin » (`implicitEnd`).
  « pas : » un fait et une condition qui nomme une scène ne demandent rien.
- **Onglet « Vérifier » du Manuscrit** : règles en tête (`INTERACTIVE_RULES` de review/checks.ts, points fabriqués
  par `useStoryFindings` seulement si `useInteractive()`), toujours comptées dans « Vérifier · N » ; un point mène à
  la scène, « Voir sur la carte des choix » ou « Ajouter un choix « Fin » », « C'est voulu » pour la session.
- **Carte des choix** : pastilles « Inaccessible », « Peut bloquer », « Fait manquant ». La carte ouverte est un état
  de la session (`interactive/mapView.ts`) : elle reste ouverte quand on revient au Plan, et « Voir sur la carte
  des choix » l'ouvre sur la scène, choisie et centrée.
- **Mise en page automatique** : « Réorganiser la carte » (lot 2) suffit pour l'instant.
- **Reste** : « parties automatiques » (regrouper les scènes en branches ou en parties) à préciser avec l'auteur.

## Lot 6 · Assistant IA interactif (fait sur la branche `roman-interactif`)

- **Lecture** : l'instantané (`mcpSnapshot.ts`, `interactivePart`) porte, seulement pour un roman interactif montré
  à l'auteur (`showsInteractive`), `project.interactive`, `project.facts` (nom, libellé, booléen ou compteur) et les
  choix de chaque scène en clair (`choices` : texte, rang et titre de la scène visée, fin, destination introuvable,
  condition et fait donné en libellés). Le texte d'une scène part sans son bloc de choix. Champs facultatifs :
  `MCP_FORMAT` ne change pas, un serveur d'avant les ignore. Le serveur (`mcp.rs`) les montre dans
  `project_overview` (ligne « Roman interactif », faits, « → 2. La cour, Fin » après chaque scène) et `read_scene`.
- **Écriture** : outil `set_choices` (scène, liste de `{ text, to, only_if?, only_if_not?, gives? }`, mode
  `replace` par défaut ou `append`), refusé si le projet n'est pas un roman interactif montré. Un fait est retrouvé
  par son libellé ou son nom, sinon créé (`createFact`) ; jamais de condition écrite à la main par l'IA. `replace`
  ne retire que les choix, les lignes écrites à la main restent ; une liste vide retire le bloc. Une étape
  d'annulation, journal ; le texte des choix n'est pas marqué « IA » (le bloc n'a pas de marque par ligne).
- **Vérifier** : `review` (lecture faite par l'app) ajoute les points du vérificateur (lot 5).
