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
- ~~**Le canevas construit l'arborescence** dans une vue à part, « Carte des choix »~~ : remplacé le 18 novembre
  2026, le canevas devient la carte des choix (lot 11).
- **Images dans le récit** : fonction du cœur, utile aussi aux romans classiques (lot 1).
- **Export web d'abord**, livre-jeu imprimé ensuite (EPUB, PDF, sections mélangées et numérotées).
- **Assistant externe (MCP)** : outils propres aux projets interactifs (lot 6).
- Une édition séparée reste possible plus tard : même dépôt, même format de projet, conteneur iCloud partagé.

## Lots

| Lot | Contenu |
| --- | --- |
| 0. Isolation | Ce document ; voir ci-dessous |
| 1. Images (cœur) | `medias/`, insertion, texte alternatif, exports (partie 1 faite) |
| 2. Carte des choix | Flèches de choix, scène créée par une flèche, bloc `choix` (fait ; sur le canevas depuis le lot 11) |
| 3. Lecture et compilation | Ink par inkjs, Mode Lecture, « Lire à partir d'ici », export .ink (fait) |
| 4. Variables | Faits et compteurs, « Seulement si » et « Donne » sur les choix (fait) |
| 5. Vérificateur | Sans fin, inaccessibles, blocages, faits (fait) ; parties automatiques à décider |
| 6. Assistant IA interactif | Outils MCP (fait) |
| 7. Export web | HTML autonome (fait) |
| 8. Export livre-jeu | Mélange, numérotation, « rendez-vous au N », EPUB et PDF (fait) |
| 9. Import | Twee 3 et Ink (fait) |
| 10. Storylets | Écarté (18 novembre 2026) : s'éloigne du livre papier |
| 11. Canevas = carte des choix | Flèches de choix sur le canevas, Plan en « Sections du livre » (#91, fait) |
| 12. Numéros figés | Numérotation figée, cadenas par section, renvois cachés (#92) : fait |
| 13. Double page | « Vérifier » et mélange : pas de suite révélée sur la même double page (#93) : fait |
| 14. Types de fin | Bonne fin, mauvaise fin (#94) : fait |
| 15. Parcours annoté | Mode Lecture enregistré et annoté, notes en commentaires (#95) : fait |

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

## Lot 7 · Export web (fait sur la branche `roman-interactif`)

- **Menu Exporter** : « Page web jouable (.html) » (roman interactif seulement, avant « Ink (.ink) », aussi sur
  téléphone). Une seule page, sans serveur ni connexion : elle s'ouvre dans tout navigateur, se met en ligne
  telle quelle (itch.io, site personnel) ou s'envoie par courriel.
- **Contenu** (`webPage.ts`, pur, testé ; `webExport.ts` charge le reste à l'export) : l'histoire compilée par
  inkjs (JSON d'Ink), le moteur d'inkjs tel que publié (`dist/ink.js`, MIT, sa licence recopiée en commentaire),
  les images de l'histoire en `data:` (JPEG réduit, `loadImages`), les faits et leurs libellés, les textes de
  l'interface dans la langue du moment. Thème clair ou sombre selon le lecteur.
- **Lecteur** : texte, images, choix numérotés (touches 1 à 9), « Revenir au choix précédent », « Recommencer »,
  « Ce que sait le lecteur », fin. Progression gardée par le navigateur du lecteur (`localStorage`, clé propre au
  titre et à l'histoire, `progressKey`) : il reprend là où il s'était arrêté. Ce qui a été lu est gardé en liste
  (`{ k, v }`) et toujours redessiné par `textContent`, jamais par `innerHTML`.
- **Sûreté de la page** : données en `<script type="application/json">` échappées (`jsonForScript`), moteur passé
  par `scriptSafe` ; noms d'images vérifiés (`storyImageNames`, `isMediaName`).
- **Histoire qui ne se compile pas** : message propre (« ouvre Lire l'histoire »), pas d'échec muet.
- Le moteur et sa licence sont lus en texte par un chemin relatif (`../../node_modules/inkjs/dist/ink.js?raw`) :
  un alias de paquet était préchargé par Vite en mode développement et devenait un module.
- Reste possible plus tard : gras et italique dans la lecture, choix de la police, couverture en tête de page.

## Lot 8 · Export livre-jeu (fait sur la branche `roman-interactif`)

- **Menu Exporter** : « Livre-jeu (EPUB) » et « Livre-jeu (PDF) » (roman interactif seulement, aussi sur téléphone),
  sans fenêtre de réglages.
- **Sections** (`gamebook.ts`, pur, testé) : la première scène est le 1, les autres sont mélangées par une graine
  tirée des identifiants des scènes (`seedOf`) : même projet, mêmes numéros d'un export à l'autre tant qu'aucune
  scène n'est ajoutée ou retirée. Parmi 24 mélanges, celui où le moins de choix mènent à la section juste en dessous
  (`numberSections`).
- **Texte** : une section d'ouverture (« Avant de commencer », et la phrase sur les choses à noter s'il y a des
  conditions ou des effets), puis le texte de chaque scène et ses choix : « Pousser la grille : rendez-vous au 12. »,
  « … : notez « La clé », puis rendez-vous au 12. », « Si vous avez noté « La clé », … », « Si vous êtes déjà passé
  par le 7, … » (condition qui nomme une scène), « ajoutez 2 à « Pièces » » (`+=`, `= x + n`), fin de l'histoire.
  Un effet ou une condition plus complexe n'est pas écrit. Guillemets de la langue par `quote`.
- **Liens** : `Run.chapter` (export/doc.ts) fait du numéro un lien vers sa section dans l'EPUB (`ch<n>.xhtml`) et
  la page web (`#ch-<n>`) ; Word, Markdown et PDF l'écrivent en texte.
- Le PDF passe par le PDF du manuscrit (Courier, interligne simple). Reste possible : mise en page du livre broché,
  feuille d'aventure à imprimer, réglages (garder l'ordre, numéro de départ).

## Lot 9 · Import Twee 3 et Ink (fait sur la branche `roman-interactif`)

- **Accueil, « Importer… »** : `.twee`, `.tw` et `.ink` s'ajoutent aux formats proposés seulement quand le roman
  interactif est proposé sur l'appareil (`importExtensions`, `STORY_EXTENSIONS`, `ImportOptions.interactive`) ;
  sinon le fichier est refusé comme illisible. Le résultat est toujours un nouveau projet, roman interactif
  (`interactive: true`, libellés des faits dans `storyFacts`), plan libre, le départ en tête.
- **Twee 3** (`parseTwee`) : un passage = une scène (titre = nom du passage). `StoryTitle` donne le titre,
  `StoryData.start` le départ (sinon « Start », sinon le premier). Passages spéciaux de SugarCube et passages
  `script`, `stylesheet`, `widget` laissés de côté. Liens `[[a->b]]`, `[[b<-a]]`, `[[a|b]]`, `[[b]]` (setter de
  SugarCube retiré) : un choix chacun, sans doublon ; une ligne faite seulement de liens n'est pas du texte, un lien
  dans une phrase y laisse son texte. Ligne faite seulement d'une macro `<<…>>` retirée ; le reste des macros
  (Harlowe, SugarCube en ligne) reste dans le texte, à nettoyer par l'auteur.
- **Ink** (`parseInk`) : un knot ou un stitch = une scène (« La cour », « La cour, porte ») ; texte avant le premier
  knot = scène « Ouverture » ; `VAR x = … // libellé` donne le libellé du fait ; fonctions laissées de côté ;
  étiquettes (`# image: …`) ignorées (pas de fichier à reprendre). Un choix simple (`*` ou `+`, conditions,
  effets `~`, renvoi) devient un choix du bloc ; un choix imbriqué ou suivi de texte, un rassemblement, un renvoi
  ou de la logique restent en lignes brutes du bloc, donc l'histoire se lit toujours. Les renvois et conditions sont
  réécrits vers les noms des scènes du projet (`renamer`, stitch voisin nommé sans son knot, `DONE` → `END`).
- Une histoire exportée par MondoWrite en `.ink` se relit et se rejoue à l'identique (test).
- **Choix collants** : l'Ink composé par MondoWrite écrit désormais ses choix en `+` (toujours proposés quand on
  revient dans une scène, comme un lien de Twine ou un livre-jeu) ; le bloc ```choix garde l'écriture `*`.
- Pas encore : archive HTML publiée par Twine, mise en forme du texte (gras, italique) et logique en ligne.

## Tests de bout en bout (17 novembre 2026)

`npm run e2e -- "roman interactif"` rejoue l'essentiel de la recette dans Chromium, en deux scénarios :

- [x] Option des Réglages (proposée seulement cochée), création d'un roman interactif (`interactive: true`), carte des choix (nouvelle scène, scène après, choix « Fin »), bloc ```choix enregistré, lecture (touche 1, souris, « Revenir au choix précédent », fin), texte d'un choix tapé dans le Manuscrit et relu après rechargement, roman ordinaire sans carte des choix.
- [x] Import Twee (titre, départ, choix), lecture jusqu'à la fin, « Vérifier » (scène inaccessible), page web jouable (choix, lecture reprise après rechargement), livre-jeu EPUB (« rendez-vous au ») et PDF, Ink.

Pas couverts : images dans le texte, faits et conditions dans l'interface, assistant externe (MCP), import Ink, doigt, anglais, mode sombre. Ils restent à la recette manuelle.

## Retours de la recette (17 novembre 2026)

- [x] Images absentes des exports du manuscrit (PDF, Word, EPUB, page web) : elles n'étaient pas chargées.
- [x] « En tête de chapitre » remonte l'image au début de sa scène ; la lettrine reste au premier paragraphe.
- [x] Manuscrit d'un roman interactif : rang et titre de chaque scène au-dessus d'elle.
- [x] Import Ink : un choix suivi de texte devient une scène de passage (avant : lignes brutes).
- [ ] Livre broché : images pas encore (partie 2 du lot 1).
- [x] Textes sans carte : ceux dont la carte est dans la corbeille ne sont plus listés (choix 1 de l'auteur).
- [x] « Voir le code » sur chaque bloc de choix : le bloc tel qu'écrit, modifiable (pour tous les blocs, le temps de la session).
- [x] Carte des choix : un `-> END` écrit dans le bloc (Ink importé) compte comme une fin.
- [x] Exemple à importer : `docs/exemples/le-puits.ink` (scènes, faits, condition, compteur, scène de passage).

## Simplification du roman interactif (17 novembre 2026)

Lot A, fait : outils du roman linéaire masqués dans un roman interactif (chronologie, gabarit et « Ranger » en plan libre, chapitres, fusion, ruban, courbe du récit), « Continuer » posé à la coupure d'une scène et retiré à son annulation, exports regroupés (« Histoire interactive », puis « Texte suivi (pour relire) »), lecture à voix haute sans le bloc de choix, aide « la première scène est le départ ».

- [x] Lot B : livre broché KDP au format livre-jeu (sections à la suite, numéro centré en gras, numéros des sections en haut de page, sommaire sans les sections) ; le livre-jeu PDF en Courier a quitté le menu.
- [x] Images dans le livre broché (roman et livre-jeu) : image du texte centrée sur la largeur du texte ; « Seule sur sa page » = illustration sur la page qui suit, légende avec le numéro de la section, sans folio ni titre courant (comme dans les livres-jeux imprimés).
- [ ] Pas encore : choix imprimés autrement que des paragraphes (retrait, italique ?).

## Retours du « Puits » écrit par un assistant (17 novembre 2026)

Un assistant IA a écrit par MCP une histoire de 30 scènes sur le début du « Puits ». Ce qui a cloché et ce qui est corrigé :

- [x] L'assistant ne voyait pas que c'était un roman interactif : règles en tête de `project_overview`, « Roman interactif » dans la liste des projets, consigne `histoire_interactive`.
- [x] Il écrivait les choix en texte (« va à… »), puis des numéros de renvoi à la main : les règles le défendent, MondoWrite numérote et écrit le mode d'emploi.
- [x] `write_scene` effaçait le bloc de choix en remplaçant le texte : il le garde maintenant, et signale les choix écrits à la main qui clochent.
- [x] `set_choices` ne savait pas les compteurs ni les conditions combinées (la lanterne du « Puits ») : `condition` et `effects`, vérifiés ; `create_scene` accepte `choices`.
- [x] Il créait des chapitres : refusé. « Organiser » rangeait les scènes par chapitre : elles se rangent en arbre selon les choix.
- [x] Le livre-jeu imprimé écrivait sans leur condition les choix à conditions combinées : phrases pour les faits, compteurs, « et » et « ou » ; ce qui ne se dit pas est signalé par « Vérifier ».
- [x] « Veut » d'un personnage ignoré par l'assistant (libellés du moteur).
- [x] Un « Continuer » sans texte se pose aussi par l'assistant (`text: ""`).
- [x] Seconde passe (exemple corrigé par l'assistant) : « Vérifier » lisait les blocs de choix comme du texte (espaces en trop, « true » parmi les mots les plus employés) : `checkManuscript` passe par `withoutChoices`.
- [x] Un nom gravé en capitales (OURDAS, ÉTIENNE ou ETIENNE pour « Étienne ») n'est plus pris pour une variante dans un roman ; le scénario garde sa règle (INES et INÈS).
- [x] L'assistant ne savait pas quel champ attend un secret révélé : « Révélé dans » et quelques autres noms désignent `revelation`, un champ refusé donne la liste des champs du type, et `review` dit comment répondre (`MCP_FIX` de mcpLive.ts) en plus de l'explication de la règle.
- [x] Un fait laissé par un brouillon restait dans la liste : outil `remove_fact` (refusé tant qu'un choix l'emploie). Dans l'app, la fenêtre des faits avait déjà « Oublier ».

## Lot 11 · Le canevas est la carte des choix (fait sur la branche `roman-interactif`, #91)

- **Une seule carte des scènes** : la présentation « Carte des choix » du Plan et `ChoiceMap.tsx` sont retirés. Sur le
  canevas d'un roman interactif, chaque choix est une flèche entre deux cartes Scène (`useStoryMap`), lue dans les blocs
  ` ```choix ` et jamais enregistrée comme un fil : pointillé si le choix a une condition, étiquette « si … », « + … »,
  flèches aller et retour décalées de côté. Elles restent visibles quand les fils sont masqués.
- **Gestes** : tirer une flèche d'une scène vers une autre (un choix), la lâcher dans le vide (nouvelle scène et son
  choix, posée là) ; menu ⋯ d'une carte Scène (Écrire la scène, Lire à partir d'ici, Ajouter un choix vers…, Nouvelle
  scène après celle-ci, posée à droite, Ajouter un choix « Fin ») ; flèche choisie : bandeau en bas (texte,
  « Seulement si », « Donne », « Retirer ce choix »), Suppr la retire. Entre une scène et un personnage, un lieu ou un
  objet, un fil reste un fil.
- **Repères** sur les cartes Scène : Départ, Fin, Sans choix, choix sans destination, Inaccessible, Peut bloquer, Fait
  manquant. « Voir sur le canevas » (onglet « Vérifier ») montre la scène et la met en avant.
- **Plan = « Sections du livre »** : en plan libre, les scènes dans l'ordre de leur numéro imprimé (aperçu du mélange
  du livre-jeu), sans flèches ni glisser ; repères sous chaque scène ; « En faire le départ » (menu ⋯) ; « Lire
  l'histoire » et « Faits · N » dans l'en-tête.
- **`choiceMap`** n'est plus lu ni écrit (rien n'était publié : pas de reprise des places). « Organiser » range
  toujours les scènes en arbre (`choiceTree`).
- **Retours du 18 novembre 2026** : étiquettes des choix en pilule (coupées à 180 px, texte entier en infobulle,
  un toucher ouvre le bandeau), posées loin de leurs voisines le long de la courbe (`labelPlaces`) ; numéro du
  livre-jeu sur chaque carte Scène, après son type ; arbre d'« Organiser » plus aéré (140 × 220 px).
- **Reste** : vérifier sur iPad et iPhone (toucher une flèche, la tirer au doigt) ; un gros livre-jeu (300 à 400
  scènes) sur le canevas.

## Lot 12 · Numéros figés et renvois cachés (fait sur la branche `roman-interactif`, #92)

- **Numéros figés** (`interactive/sections.ts`, `projectSections.ts`) : chaque scène garde son numéro dans
  cosmos.json (`sections`, par identifiant, gardé par `metaKeep`), écrit hors historique par un abonnement du store
  (`freezeSections`) quand des scènes arrivent ou partent. Le premier mélange est celui d'avant (`numberSections`) ;
  ensuite une nouvelle scène prend le plus petit numéro libre, une scène retirée laisse un trou (« Vérifier » :
  `sectionGap`), le départ est toujours le 1 (l'ancien départ prend son numéro).
- **Changer et garder un numéro** (Sections du livre) : le numéro est un bouton, puis un champ ; le numéro tapé
  s'échange avec la section qui l'avait et se garde (`sectionLocks`, cadenas). Menu ⋯ : « Garder ce numéro »,
  « Libérer ce numéro ». « Renuméroter » (confirmé sur place) refait le mélange sans trou, sauf départ et numéros gardés.
- **Partout le même numéro** : cartes du canevas (avec le cadenas), Plan, repère des scènes et volet du Manuscrit,
  listes des destinations, « Ajouter un choix vers… », livre-jeu (EPUB, livre broché).
- **Renvoi caché** : `#hidden` en fin de ligne du bloc de choix (« Renvoi caché » dans le bandeau d'une flèche et
  sous chaque choix du Manuscrit, `hidden` de `set_choices` par MCP). Jamais imprimé ni joué (Ink, page web) ; flèche
  pointillée grise et pilule « caché » sur le canevas ; compte pour le chemin du lecteur. « Vérifier » : section visée
  dont le numéro n'est pas gardé (`hiddenUnlocked`), renvoi absent de la lecture à l'écran (`hiddenNotPlayable`).
- **Reste** : essayer une vraie énigme jusqu'au livre broché ; dire dans le guide comment écrire la consigne au lecteur.

## Lot 15 · Parcours de lecture annoté (fait sur la branche `roman-interactif`, #95)

- Le mode Lecture garde, le temps de la lecture, le chemin suivi : en tête, « Parcours : 1 → 34 → 112 » (numéros du
  livre-jeu, `pathLine`), et sous chaque passage un lien « Noter » (une note par étape, Entrée ou Échap pour finir).
  « Revenir au choix précédent » retire aussi les notes des passages retirés ; « Recommencer » vide le parcours.
- « Garder les notes (N) » : chaque note devient un commentaire de sa scène (« Parcours de lecture : … »), ancré sur
  ses premiers mots (`openingWords`, `markQuoteInHtml`) ; une scène encore vide ne peut pas en porter (dit en clair).
- « Exporter le parcours » : un Markdown (titre, chemin, chaque étape avec son choix et sa note, `pathMarkdown`).
- Rien d'autre n'est enregistré : le parcours est un état de la fenêtre.

## Lot 13 · Pas de suite sur la même double page (fait sur la branche `roman-interactif`, #93)

- **Mélange** (`interactive/mix.ts`, `mixSections`) : recherche locale à graine fixe. On part d'un mélange, puis on
  échange deux sections tant que cela ne coûte rien ; un lien entre deux numéros voisins coûte 9, à deux d'écart 3,
  à trois 1. Au plus 60 000 échanges (quelques millisecondes pour 400 sections). Départ et numéros gardés ne
  bougent pas. Sert au premier numérotage (`numberSections`) et à « Renuméroter », qui dit ensuite si des sections
  reliées sont restées voisines (« il y a trop de liens pour ce nombre de sections »).
- **Double page** (`interactive/spreads.ts`) : le livre broché composé donne les pages de chaque section
  (`BookLayout.sections`) ; une page seule ouvre le livre, puis les pages 2-3, 4-5… se voient ensemble. Un choix dont
  la suite occupe une double page de sa section est signalé dans la fenêtre « Livre broché » et dans « Vérifier »
  (`sameSpread`), d'après la dernière mise en page de la session tant que les numéros n'ont pas changé
  (`usePaperbackSpreads`, jamais enregistré) : le résultat dépend du format, du papier et des pages ajoutées.

## Lot 14 · Bonne fin et mauvaise fin (fait sur la branche `roman-interactif`, #94)

- **Écriture** : `#good` ou `#bad` en fin de ligne, sur un choix « Fin » (`* [Sauter] -> END #bad`) ou sur un renvoi
  seul (`-> END #good`, posé pour une scène qui finit sans choix). Sans étiquette : fin neutre. Comme `#hidden`, ce
  n'est pas de l'Ink (le compilateur refuse une étiquette après un renvoi) : `projectToInk` la retire (`inkDivert`),
  la page web et la lecture ne changent pas.
- **Gestes** : menu ⋯ d'une carte Scène qui finit l'histoire et d'une section du Plan (« En faire une bonne fin »,
  « … mauvaise fin », « … fin neutre », `setSceneEnding`, `withEnding`) ; liste « Type de fin » sous un choix « Fin de
  l'histoire » du Manuscrit ; `ending` d'un choix et de `set_choices` par MCP.
- **Affichage** : pastille « Bonne fin » (vert) ou « Mauvaise fin » (rouge, bord double), le mot toujours écrit ;
  « Fins : 2 bonne(s), 3 mauvaise(s), 1 neutre(s) » dans l'en-tête des Sections du livre dès qu'une fin est marquée.
- **Livre-jeu** (EPUB, livre broché) : mauvaise fin, « Votre aventure s'arrête ici. » ; bonne fin, le texte de
  l'auteur seul ; neutre, « Fin. » comme avant.
- **Vérifier** : `noGoodEnding`, dès qu'une fin est marquée et qu'aucune bonne fin n'est atteignable.

## Exemple « Le Puits » et visite (en cours sur la branche `roman-interactif`)

L'histoire écrite par l'assistant IA (MCP) devient l'exemple intégré, à côté du Petit Chaperon rouge, proposé
seulement quand l'option expérimentale est allumée (« Essayer « Le Puits », un roman interactif » sur la page des
projets). Fichiers fabriqués par `scripts/examples/build-puits.mjs` depuis le projet décompressé, dans
`src/assets/examples/puits.fr.json` (96 Ko, chargé à la demande par `interactive/example.ts`) : marques de l'IA
retirées, sans journal, corbeille, versions ni textes sans carte ; fins marquées (Le matin bonne ; L'eau noire, La
voix volée, La maison mauvaises ; L'échange et Le nom sans type). Ouvert sur le canevas avec sa visite
(`STORY_TOUR_STEPS`, six étapes : carte, choix, faits, sections, « Vérifier », lecture et exports), qui remplace la
visite ordinaire dans tout roman interactif.

- [x] Données, chargement, bouton de la page des projets, visite, tests (Vitest et e2e)
- [ ] Images (prompts dans `docs/exemple-puits-images.md`, à générer par l'auteur), placées dans les scènes
- [ ] Version anglaise (`puits.en.json`, traduction relue par l'auteur)
- [ ] Chapitre « Roman interactif » du guide (fr, en, es) avec des captures du Puits

## Décisions du 18 novembre 2026 (manuel de LibroGameCreator)

Étude du manuel de LibroGameCreator 3.4 (outil de livres-jeux imprimés, Matteo Poropat). La plupart de ses outils
sont déjà dans les lots 2 à 9. Décisions de l'auteur :

- **Objectif : le roman papier et électronique** (livre broché, EPUB). La page web reste un export parmi d'autres.
- **Une seule carte des scènes : le canevas** (lot 11, #91). Une scène n'a plus deux places (canevas et `choiceMap`).
  Les choix sont des flèches entre cartes Scène, lues dans les blocs ` ```choix `, jamais enregistrées comme des
  fils ; gestes, menu ⋯, bandeau des règles et pastilles du vérificateur passent de `ChoiceMap.tsx` au canevas
  (sous `useInteractive()`). Le filtre « Scènes seulement » donne la vue épurée.
- **La Carte des choix quitte le Plan tout de suite** : jamais deux cartes en même temps. Le Plan d'un roman
  interactif devient « Sections du livre » : ordre d'impression, numéros (aperçu du mélange), état de chaque section.
- **`choiceMap` n'est plus lu**, sans reprise des places : rien n'est publié. « Organiser » range déjà en arbre.
- **Retenu de LibroGameCreator** : numéros figés et cadenas par section, renvois cachés pour les énigmes (lot 12,
  #92) ; contrôle de la double page, plus juste que l'écart de numéros de LibroGameCreator (lot 13, #93) ; types de
  fin (lot 14, #94) ; parcours de lecture annoté (lot 15, #95).
- **Écarté** : variables de remplacement (`@nom`), étiquettes libres, carte en images, styles RTF et CSS, Graphviz,
  SQLite, ChoiceScript et Squiffy (Twee et Ink suffisent), titres à la place des numéros.
- **Storylets (lot 10) écarté** : des scènes proposées selon ce que le lecteur sait s'éloignent du livre papier.
- **Avant de fusionner la branche** : un exemple et un didacticiel tirés du « Puits » (histoire écrite par MCP), et
  le chapitre « Roman interactif » du guide (fr, en, es).
- **Peut-être plus tard** : mélange par parties (un cadre = une plage de numéros, réponse possible aux « parties
  automatiques » du lot 5), import d'un livre-jeu numéroté écrit en Word ou en texte (« rendez-vous au 104 »).

