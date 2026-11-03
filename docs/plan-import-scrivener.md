# Plan : importer un projet Scrivener

Beaucoup de romanciers arrivent de Scrivener avec un projet déjà avancé : manuscrit découpé, fiches de
personnages, notes, recherche. Aujourd'hui ils doivent compiler un .docx, l'importer, et perdre tout le reste.
Le but : **ouvrir un `.scriv` et retrouver son roman dans MondoWrite**, manuscrit, Bible et canevas compris,
sans rien à configurer.

Import **à sens unique** : le projet Scrivener n'est jamais modifié, aucun aller-retour ni synchronisation.

Projets de référence pour les essais :

- *Sacré Bonhomme* (Scrivener 3.4 Mac, données version 23, 15 chapitres, environ 24 000 mots) : un vrai roman,
  mots-clés plats, statuts personnalisés en français.
- **Tutoriel officiel de Scrivener 3** (`Tutorial2.scriv`, données version 23) : presque toutes les fonctions de
  Scrivener y sont utilisées (commentaires, notes de bas de page en ligne et dans l'inspecteur, mots-clés
  hiérarchiques, liège libre, signets, collections, styles, images dans le texte, PDF, image, son, historique
  d'écriture, instantané). C'est le **jeu d'essai de couverture** : chaque fonction listée plus bas doit soit
  être reprise, soit apparaître dans le rapport d'import.

Aucun des deux ne va dans le dépôt (droits du tutoriel, roman de l'auteur) : les tests utilisent de petits
projets fabriqués qui reproduisent leurs structures.

## Impact sur le format de projet

**Aucun.** L'import produit un `Project` ordinaire (`cartes/`, `manuscrit/`, `cosmos.json`, `medias/`) avec
les types et champs qui existent déjà : Scène, Personnage, Lieu, Idée, Image, Document, Lien, `fiche.synopsis`,
`fiche.statut`, `plan.chapters`, `frames`, `links`. Rien de Scrivener n'est gardé dans les fichiers (pas
d'UUID) : un projet importé est lisible par toutes les versions de l'app qui connaissent ces champs.

Les nouveautés de format (point de vue, versions, commentaires, notes de bas de page) arrivent **avant**, avec
les chantiers préalables (voir « Préalables ») : chacune y décide de son format. L'import ne fait que les
remplir.

Seul changement de code partagé : l'import d'un fichier doit pouvoir rendre des **médias** (images, PDF de la
Recherche) en plus du `Project`, écrits par `storage.writeMedia` comme le fait déjà `importZipData`.

## Ce qu'est un `.scriv` (constaté sur le projet de référence)

```
Sacré Bonhomme.scriv/              dossier (paquet sur Mac, simple dossier sous Windows)
  Sacré Bonhomme.scrivx            XML : le classeur (Binder), réglages du projet
  Files/version.txt                23 = format Scrivener 3 (Mac et Windows)
  Files/Data/<UUID>/content.rtf    texte du document
  Files/Data/<UUID>/synopsis.txt   synopsis (texte brut)
  Files/Data/<UUID>/notes.rtf      notes du document
  Files/Data/<UUID>/content.pdf    PDF de la Recherche (aussi .jpg, .png… selon le fichier importé)
  Files/Data/<UUID>/content.comments  commentaires liés (XML), absent ici
  Snapshots/<UUID>.snapshots/      instantanés (anciennes versions d'un texte)
  Settings/, QuickLook/, Files/*.indexes, binder.backup, writing.history
```

Le `.scrivx` donne pour chaque `BinderItem` : `UUID`, `Type` (`Text`, `Folder`, `DraftFolder`,
`ResearchFolder`, `TrashFolder`, `PDF`, `Image`, `WebArchive`…), `Title`, `MetaData` (`LabelID`, `StatusID`,
`IncludeInCompile`, `IconFileName`), `Keywords/KeywordID`, `Children`. Au niveau du projet : `LabelSettings`,
`StatusSettings`, `Keywords` (titre et couleur), `ProjectTargets`, `TemplateFolderUUID`, `Collections`.

Pièges vus sur le vrai fichier :

- **Noms encodés dans le .zip** : `Sacr#U00e9 Bonhomme.scriv` (accent écrit `#Uxxxx`). À décoder pour le titre.
- **Dossier `__MACOSX/`** dans un zip fait sur Mac : à ignorer (déjà le cas dans `importZipData`).
- **RTF Cocoa en cp1252** : accents en `\'e9`, espaces insécables `\'a0` (à garder : typographie française),
  tiret de dialogue `\'97`, apostrophe courbe `\'92`, et `\uN` pour le reste.
- **Marqueurs de styles Scrivener** dans le texte : `<$Scr_H::1>`, `<!$Scr_H::1>`, `<$Scr_Ps::0>`. À retirer
  (ou à lire comme intertitre pour `Scr_H`), jamais à laisser dans le manuscrit.
- **Fiches vides** : les « Character Sketch » et « Setting Sketch » du modèle, jamais remplis, ne contiennent
  que les intitulés (`Character Name`, `Role in Story`, `Goal`…). Une fiche qui n'a que ses intitulés n'est
  pas importée.
- **Titres vides** : beaucoup de documents de Notes et de Recherche n'ont pas de titre. Titre tiré du début du
  texte (`sceneTitle`, déjà dans `import/manuscript.ts`).
- **Numéro dans le titre** : « Chapitre 1 - Le monde ordinaire d'Ethan ». Chez nous le numéro d'un chapitre
  n'est jamais écrit (`chapterNumbers`) : on retire « Chapitre N - » (et « Chapter N: », « N. »…).
- **Mots-clés = personnages** : ici les mots-clés sont Ethan, Violette, Marc, Bonhomme, Dubois, « Sœur
  d'Ethan », posés sur les chapitres. C'est l'information la plus précieuse après le texte.
- **Statuts personnalisés** : « A faire », « Premier jet », « Version révisée », « Version finale », « Terminé »
  (les statuts par défaut de Scrivener sont en anglais : To Do, First Draft, Revised Draft, Final Draft, Done).

Vus en plus dans le tutoriel :

- **Mots-clés hiérarchiques** : `Characters › Aeryn, John`, `Locations › Wessex`. Le parent dit le type de la
  carte : plus besoin de deviner.
- **Commentaires dans l'inspecteur** : le texte porte un champ `HYPERLINK "scrivcmt://<ID>"` autour du passage
  commenté, et le commentaire lui-même (en RTF) est dans `content.comments` (XML, `<Comment ID=… Color=…>`).
  Les notes de bas de page de l'inspecteur suivent le même chemin.
- **Notes et annotations en ligne** : `Scrv_fn=… _Scrv_fn` et `Scrv_annot \color=… \text=…` dans le RTF.
- **Styles nommés** : `Files/styles.xml` (Title, Heading 1 et 2, Block Quote, Code Block, Emphasis…) et des
  marqueurs `<$Scr_Ps::n>` (paragraphe), `<$Scr_Cs::n>` (caractère), `<$Scr_H::n>` (intitulé) dans le texte,
  plus un `content.styles` par document.
- **Images dans le texte** : PNG en hexadécimal (`\pict`), nombreuses dans le tutoriel.
- **Liège libre** : `FreeformCorkboardDocuments`, une position relative (`Position="1.16,0.13"`) par carte.
- **Signets d'un document** (`<Bookmarks>` dans un `BinderItem`) : il pointe vers d'autres documents.
- **Collections** : listes choisies (`Arbitrary`, avec `BinderUUIDs`) ou recherches enregistrées.
- **Étiquette renommée** : le tutoriel conseille de renommer « Label » en « POV » et de donner à chaque scène
  son personnage de point de vue. Le titre est dans `LabelSettings/Title`.
- **Balises de compilation** : `<$n>` (numéro), `<$t>`… dans le texte.
- **Son** (`Media`, `content.wav`) dans la Recherche.
- **Historique d'écriture** (`writing.history`) : `<Day dwc="1989" …>2016-09-06</Day>`, mots ajoutés au
  manuscrit chaque jour.

## Correspondances

| Scrivener | MondoWrite |
|---|---|
| Nom du `.scriv` | titre du projet, `kind: "roman"` |
| Dossier Manuscrit (`DraftFolder`) | manuscrit, dans l'ordre du classeur, `plan.chapters` et case `libre` |
| Dossier de 1er niveau du Manuscrit | un chapitre ; ses documents (à toute profondeur, dans l'ordre) sont ses scènes ; le texte du dossier lui-même, s'il en a, est la première scène |
| Document texte de 1er niveau du Manuscrit | un chapitre d'une scène (cas du projet de référence) ; une coupure `***` dans le texte coupe en scènes (`isSceneBreak`, déjà là) |
| `IncludeInCompile = No` | scène importée quand même (rien ne se perd), signalée dans le rapport |
| `synopsis.txt` | `fiche.synopsis` de la carte Scène |
| `notes.rtf` d'une scène | carte Idée « Notes : <titre> » reliée à la scène (voir décision 2) |
| Statut | `fiche.statut` (1.14.0, cinq statuts) : à faire → `aecrire`, premier jet → `brouillon`, révisé → `revisee`, à revoir → `revoir`, final et terminé → `fini` (par le libellé, en français et en anglais) ; inconnu → rien, cité dans le rapport |
| Étiquette (Label) aux noms par défaut (Red, Blue, Rouge…) | rien (une couleur seule ne dit rien), citée dans le rapport |
| Étiquette renommée POV, Point de vue, Narrateur | chaque valeur devient un Personnage (ou retrouve le sien), et la scène reçoit son point de vue (préalable A) |
| Étiquette renommée autrement (Intrigue, Fil, Thread…) | chaque valeur devient une carte Intrigue reliée à ses scènes : c'est l'usage « suivre les fils » du tutoriel, et la chronologie du Plan les montre aussitôt |
| Mot-clé sous un parent Characters / Personnages | carte Personnage |
| Mot-clé sous un parent Locations / Lieux / Places | carte Lieu |
| Mot-clé sous un parent Themes / Thèmes | carte Thème |
| Autre mot-clé | une carte (voir décision 1) ; toujours reliée par un fil à chaque scène qui le porte |
| Signets d'un document vers d'autres documents | fils entre les deux cartes |
| Position sur un liège libre | position de la carte sur le canevas (positions relatives × écart des cartes), sinon la disposition par défaut |
| Commentaire de l'inspecteur (`scrivcmt://`) et annotation en ligne | commentaire ancré sur le même passage (préalable C) |
| Note de bas de page (inspecteur ou en ligne) | note de bas de page à sa place (préalable D) |
| Styles Heading, Title | intertitre ; Block Quote, Citation → bloc de citation ; Emphasis → italique ; Code → texte simple |
| Balises de compilation (`<$n>`, `<$t>`…) | retirées |
| Image de la carte (synopsis en image) | `image` de la carte |
| Collection choisie | lot 3 : un cadre « Collection : <nom> » qui rassemble ses cartes, si elles ne sont pas déjà dans un autre cadre ; sinon citée dans le rapport. Recherches enregistrées : ignorées |
| Son, vidéo (`Media`) | carte Document sans aperçu si MondoWrite sait le garder dans `medias/`, sinon cité dans le rapport |
| Instantané (`Snapshots/<UUID>.snapshots/`, un RTF daté par instantané, titre dans `index.xml`) | version de la scène, avec sa date et son titre (préalable B) |
| Plusieurs livres dans le Manuscrit (sous-dossiers de 1er niveau qui contiennent eux-mêmes des dossiers de chapitres) | l'auteur choisit le livre à importer, un projet MondoWrite par livre |
| Dossier Personnages (icône `Characters…` ou titre Personnages, Characters) | une carte Personnage par document ; une fiche « Character Sketch » remplie donne ses champs de fiche quand ils existent (`Role in Story` → `role`, `Occupation` → `metier`…), le reste reste dans le corps sous son intitulé |
| Dossier Lieux (icône `Locations…` ou titre Lieux, Places, Locations, Settings) | une carte Lieu par document, même règle avec « Setting Sketch » |
| Autres dossiers hors Manuscrit (Notes, Recherche…) | un **cadre** du même nom sur le canevas ; chaque document texte y devient une carte Idée |
| `PDF` | carte Document (`medias/<nom>.pdf`, aperçu de la 1re page par `pdfDocument.ts`) |
| `Image` (jpg, png…) | carte Image (`medias/`) |
| `WebArchive` / lien web | carte Lien avec son adresse (le contenu archivé n'est pas repris) |
| Image dans le texte (`\pict`) | carte Image reliée à la scène, l'image quitte le texte (le manuscrit n'a pas d'image en ligne) |
| Lien interne Scrivener (`scrivlnk://<UUID>`) | mention `cosmos:<id>` si la cible est importée, sinon texte simple |
| Lien web dans le texte (`HYPERLINK`) | lien Markdown ordinaire |
| Gras, italique, barré, souligné | gardés |
| Taille, police, couleur, retraits, interligne | ignorés (la mise en page est celle de MondoWrite) |
| Objectif du manuscrit (`DraftTarget`, en mots, s'il n'est pas à 0) | `goals` (lot 3) |
| Historique d'écriture (`writing.history`, `dwc` par jour) | `progress` (`{ start, end }` par jour, reconstitués en remontant depuis le nombre de mots importé), pour que les statistiques et la série de jours d'écriture ne repartent pas de zéro (lot 3) |
| Modèles (`TemplateFolderUUID`), Corbeille, Collections, Signets, Instantanés, Pages liminaires de compilation | ignorés (cités dans le rapport) |

Disposition sur le canevas : les chapitres en rangées comme `bookToProject`, puis un cadre par dossier hors
Manuscrit (Personnages, Lieux, Notes, Recherche…) à droite, sans chevauchement. L'auteur peut ensuite lancer
« Organiser le canevas » s'il préfère.

## Ouvrir le fichier, sur chaque plateforme

Un `.scriv` est un **dossier**. Deux entrées, toutes deux dans « Importer un fichier » de l'accueil :

1. **`.zip` contenant un `.scriv`** : partout (Mac, Windows, Linux, iPad, iPhone). C'est le chemin commun : la
   lecture part d'une table `chemin → octets`, décompressée par `fflate` (déjà dans l'app). Sur iPad, l'app
   Fichiers sait « Compresser » un dossier.
2. **Le `.scriv` lui-même** : ordinateur seulement (`storage.canPickFolder`). Sur Mac le sélecteur le montre
   comme un fichier (paquet) mais rend un dossier ; sous Windows c'est un dossier. Nouvelle méthode
   `storage.pickScrivener()` qui lit **seulement** ce qui sert (`*.scrivx`, `Files/version.txt`,
   `Files/Data/**`, `Snapshots/` des documents du Manuscrit), jamais les index ni `QuickLook/` (le projet de référence pèse 72 Mo zippé).

Règles reprises de `importZipData` : noms sûrs (jamais de `..`, pas de chemin absolu), dossiers qui commencent
par un point ignorés, jamais d'import par-dessus un projet existant.

## Architecture

```
src/import/scrivener/
  index.ts      readScrivener(files: Map<string, Uint8Array>, options) → { project, medias, report } | null
                (trouve le .scrivx, même dans un dossier racine du zip, et choisit le format 3 ou 2)
  binder.ts     lecture du .scrivx (DOMParser en "application/xml") → arbre typé, statuts, mots-clés, cibles (pur)
  rtf.ts        RTF → paragraphes HTML (ImportedPara), pur, sans dépendance : groupes, destinations \* ignorées,
                \par \line \tab, \b \i \ul \strike, \'xx selon \ansicpg, \uN avec \ucN, champs HYPERLINK,
                \pict (PNG/JPEG en hexadécimal, extraits à part), marqueurs <$Scr_…> lus avec styles.xml,
                champs scrivcmt:// et scrivlnk://, Scrv_fn et Scrv_annot, balises <$…> retirées
  comments.ts   content.comments (XML dont chaque commentaire est un petit RTF, relu par rtf.ts) (pur)
  history.ts    writing.history → progress (pur)
  sketch.ts     fiches « Character Sketch » / « Setting Sketch » : vide ou non, intitulés → champs de fiche (pur)
  mapping.ts    arbre → Project : chapitres et scènes, cartes de la Bible, cadres, fils des mots-clés,
                disposition, rapport (pur)
```

- `import/index.ts` : `scriv` et `zip` dans `IMPORT_EXTENSIONS` ; un `.zip` qui contient un `.scrivx` part
  vers Scrivener, sinon vers l'import de projet MondoWrite existant.
- `projectFromFile` rend désormais `{ project, medias }` ; `store.importFile` écrit les médias après
  `storage.create`, comme `importZipData`. Chargé à la demande (`import()`), hors du paquet de démarrage.
- Le manuscrit passe par `markdownToHtml` / `sanitizeHtml` à l'ouverture comme tout manuscrit lu sur disque.
- **Pas de dépendance RTF** : les bibliothèques existantes (rtf.js…) demandent un DOM de rendu et apportent
  bien plus que nécessaire. Le sous-ensemble utile du RTF de Scrivener tient dans un petit lecteur maison,
  comme `docx.ts`. Rien à ajouter à `THIRD-PARTY-NOTICES.md`.
- Textes d'interface : `t.home.importScrivener…` et `t.importReport…` dans `fr.ts` puis `en.ts`.

## Rapport d'import

Après l'import, l'app s'ouvre sur le Manuscrit (comme aujourd'hui) avec un bandeau discret : « Importé de
Scrivener : 15 chapitres, 2 personnages, 14 notes, 3 PDF. » et un lien « Ce qui n'a pas été repris »
(étiquettes, instantanés, corbeille, modèles, documents exclus de la compilation, formats inconnus).
L'invitation à la rétro-bible (`retroInvite`) reste proposée.

## Lots de l'import (après les préalables A à D)

### Lot 1 : le manuscrit

- [x] `rtf.ts` et ses tests (accents cp1252, `\u`, insécables, gras/italique/barré, paragraphes vides,
      groupes imbriqués, `\pict` et `\*\…` ignorés, marqueurs `<$Scr_…>` retirés, liens web des champs HYPERLINK)
- [x] `binder.ts` : arbre, types, statuts, étiquettes, mots-clés en arbre, objectif ; format 3 (`Files/Data/<UUID>/`)
      et, au passage, les fichiers à plat des formats d'avant (`Files/Docs/<ID>.rtf`)
- [x] `mapping.ts` : Manuscrit → chapitres et scènes, titres sans « Chapitre N », synopsis, statuts, scène sans
      texte gardée (synopsis seul), prologue et épilogue en pages du livre
- [x] Entrée `.zip` sur toutes les plateformes (« Importer un manuscrit ou un scénario… » ; un .zip sans .scrivx
      est ouvert comme un projet MondoWrite exporté) ; `importFromFile` rend projet et médias
- [ ] Essai sur *Sacré Bonhomme* : 15 chapitres dans l'ordre, nombre de mots à ±1 % de Scrivener, accents et
      tirets de dialogue intacts

### Lot 2 : Bible et canevas (fait, 2 novembre 2026)

- [x] Dossiers Personnages et Lieux (reconnus à leur titre, `folderKind`), fiches « Sketch » remplies → champs
      (`sketch.ts`), vides → ignorées et comptées
- [x] Mots-clés → cartes et fils vers les scènes, type tiré du mot-clé parent (Characters, Locations, Themes, Plots) ;
      un mot-clé qui porte le nom d'un personnage importé le retrouve
- [x] Étiquette renommée POV (Point de vue, Narrateur…) → `fiche.pov` des scènes ; renommée autrement → Intrigues
      reliées ; étiquette de couleur → citée dans le rapport
- [x] Signets des documents et liens internes `scrivlnk://` → fils (le texte du lien reste du texte : on ne change
      pas la prose de l'auteur en « @Titre »)
- [x] Commentaires de l'inspecteur → commentaires ancrés ; annotations en ligne → commentaire sur leur paragraphe ;
      notes de bas de page (inspecteur et en ligne) → notes
- [x] Intertitres (Scr_H) en `<h3>`, sauf celui qui répète le titre du document ; images du texte → cartes Image
- [x] Autres dossiers → cadres (à droite du récit) et cartes Idée ; PDF, images, pages web → Document, Image, Lien
- [x] Notes des documents : une ligne → synopsis s'il est vide, sinon carte Idée reliée
- [x] Entrée « Ouvrir un projet Scrivener… » sur ordinateur (`storage.pickScrivener` : le .scriv sur Mac, son
      .scrivx ailleurs ; portée `$HOME/**` déjà accordée), fenêtre de choix des dossiers (`ScrivenerChoice`),
      rapport d'import (`ScrivenerReportNotice`)
- [x] Objectif du manuscrit (`DraftTarget`) → `goals.total` (avancé du lot 3)
- [ ] Reporté au lot 3 : liège libre (positions), styles de citation (Block Quote), aperçu de la 1re page des PDF
      importés. À vérifier sur le tutoriel : format exact des notes et annotations en ligne et des signets
      (lecture volontairement tolérante, sans fichier réel ici)

### Essai sur un vrai roman (2 novembre 2026, 15 chapitres, 22 418 mots)

- [x] Texte : 22 406 mots repris sur 22 418, l'écart est fait des seules balises de style de Scrivener
- [x] Un .scriv qui est un fichier (projet zippé puis renommé, téléchargé ou envoyé) se lit comme un .zip ;
      sur Mac, plus de filtre dans le dialogue (il grisait le paquet), lecture du dossier autorisée
      (`allow_scriv`, lib.rs), message clair si rien n'est lisible
- [x] Puces en double (repère `\listtext` et puce collée) : une seule
- [x] Liste de personnages dans un seul document (intitulés « NOM - accroche » suivis de « Âge : … ») : une
      carte par personnage (`readCharacterList`), accroche, « Personnage principal » pour la partie des
      principaux ; libellés Physique, Évolution (arc), Situation, Particularités, Race
- [x] Mots-clés qui nomment un personnage de la Bible (« Ethan », « Dubois », « Soeur d'Ethan ») : fils vers
      sa carte au lieu d'une Idée de plus (`byFirstName`)
- [x] Statut d'un document coupé en scènes (« *** ») : sur chacune
- [ ] À regarder : les anciennes versions des chapitres rangées dans la Recherche (« Version 1 »,
      « Archives ») arrivent en grandes cartes Idée ; le dossier se décoche à l'import. Piste : en faire des
      versions des scènes (avec les instantanés, ci-dessous)

### Lot 3 : finitions

- [x] Instantanés → versions des scènes (`Snapshots/<UUID>.snapshots/`, titres de `index.xml`, date du nom du
      fichier) : chaque scène reçoit son morceau (mêmes séparateurs), sinon tout va à la première ; titre
      « Instantané Scrivener : <titre> » ; écrites par `finishImport` (`storage.writeVersion`)
- [x] Objectif et historique d'écriture → `goals`, `progress` (`historyProgress` : `dwc` de chaque jour, total
      reconstitué en remontant depuis les mots importés, jamais sous zéro)
- [x] Ancien format Scrivener 2 Mac et 1 Windows : **abandonné** (décidé le 2 novembre 2026). Classeur en version
      1.x : `scrivener-old`, message de l'accueil (`importScrivenerOld`) : l'ouvrir d'abord dans Scrivener 3
- [x] Pages liminaires reconnues à leur titre (Dédicace, Épigraphe, Remerciements, Copyright, À propos de
      l'auteur, en français et en anglais, `pageKindOf`), dans le Manuscrit ou ailleurs → pages du livre (`page`)
- [ ] Collections choisies → cadres ; plusieurs livres dans le Manuscrit → choix du livre
- [ ] Image de carte (synopsis en image), son et vidéo de la Recherche
- [ ] Essai de couverture sur le tutoriel : rien de ce qu'il montre ne disparaît sans être dans le rapport

### Plus tard

- Projets de **scénario** Scrivener (mode script) → `scenario.fountain`. En attendant, Scrivener exporte en
  Fountain et en FDX, que MondoWrite importe déjà : le dire dans le guide.
## Préalables : chantiers MondoWrite, à faire avant l'import

**Décidé le 2 novembre 2026** : les fonctions propres à MondoWrite passent d'abord. Elles servent à tous les
auteurs, pas seulement à ceux qui viennent de Scrivener, et l'import n'aura plus de solution d'attente à
écrire puis à défaire (commentaires en cartes Idée, notes entre crochets, instantanés perdus).

Chaque chantier a son propre plan (`docs/plan-<nom>.md`), sa version de l'app, et respecte les règles du
projet (trois chemins souris, doigt, clavier ; roman et scénario ; français et anglais ; clair et sombre ;
format lisible par les versions précédentes). Ordre retenu, du plus petit et du plus sûr au plus lourd :

| | Chantier | Ce que c'est | Pourquoi | Format proposé (à confirmer dans son plan) |
|---|---|---|---|---|
| **A** | **Point de vue d'une scène** (fait, `docs/plan-point-de-vue.md`) | choisir le personnage narrateur d'une scène dans sa fiche (liste des personnages, comme le `pivot` d'un Épisode) ; le voir dans le Plan, le ruban et la Bible (« ses scènes en point de vue ») ; filtrer par point de vue | roman choral ; usage n° 1 des étiquettes dans Scrivener ; aujourd'hui `pov` n'existe qu'à l'échelle du projet (couverture) | `fiche.pov` d'une carte Scène (identifiant d'une carte Personnage), gardé par les versions qui ne le connaissent pas (`keep`) |
| **B** | **Versions d'une scène** (fait, `docs/plan-versions-scene.md`) | « Garder cette version » avant de réécrire, liste datée, comparer avec le texte actuel, revenir (la version actuelle est gardée elle aussi) | le filet de sécurité que les auteurs Scrivener citent en premier ; `markdown/versions/` garde un jour entier, pas une scène choisie | `versions/<id de carte>/<date>.md` (titre facultatif en tête), jamais relu comme scène, emporté par la corbeille de la carte ; roman (`manuscrit/`) et scénario (corps Fountain de la scène) |
| **C** | **Commentaires ancrés** (fait, `docs/plan-commentaires.md`) | sélectionner un passage, écrire un commentaire visible en marge (ou sous le texte sur téléphone), le résoudre ; liste dans « À faire » | relecture, retours des testeurs bêta ; prolonge « à reprendre », qui marque sans dire pourquoi | le plus délicat : marque dans le texte et commentaires à part (`commentaires/<id de carte>.md` ?), lisible hors de l'app ; Fountain a déjà la note `[[…]]`. À trancher dans son plan |
| **D** | **Notes de bas de page** (fait, `docs/plan-notes.md`) | insérer une note dans le manuscrit, numérotée seule, exportée en vraie note (Word, PDF, EPUB ; en fin de chapitre dans l'EPUB) | romans historiques, récits avec sources, essais | syntaxe Markdown connue `[^1]` en fin du fichier de la scène |

Pas préalables (ni l'import ni les auteurs n'en ont besoin tout de suite) : **sélections enregistrées** (garder
un filtre du canevas sous un nom ; les cadres et le filtre sur une carte couvrent l'essentiel) et **carte
Son** (mémo vocal, plutôt à penser avec le Carnet de l'iPhone).

Écartés exprès :

- **Métadonnées personnalisées** (cases et listes définies par l'auteur) : contraire à « aucun formulaire, la
  structure émerge ». À l'import, une métadonnée personnalisée dont le nom correspond à un champ de fiche
  existant le remplit ; les autres vont dans le texte de la carte, sous leur nom.
- **Types de section et réglages de compilation** : la mise en page de MondoWrite vient de ses exports, pas du
  projet d'origine.
- **Panneaux de référence, éditeur partagé, presse-papier de recherche** : ce sont des façons d'afficher,
  propres à Scrivener ; la carte agrandie et la Bible à côté du manuscrit jouent ce rôle.

## Tests

- **Unitaires (Vitest)** sur des projets fabriqués dans `src/__tests__/fixtures/scrivener/` (quelques Ko) :
  RTF, classeur, fiches vides ou remplies, mots-clés, statuts en français et en anglais, noms `#U00e9`,
  zip avec `__MACOSX/` et dossier racine, chemins piégés (`..`) refusés, projet sans Manuscrit (refus propre),
  format 2.
- **Bout en bout** : `npm run e2e -- import-scrivener` (import d'un zip, Manuscrit, Bible, canevas).
- **À la main** : *Sacré Bonhomme* sur Mac (dossier et zip), Windows (dossier), iPad (zip depuis Fichiers), en
  français et en anglais, clair et sombre. Un projet fait avec Scrivener 3 Windows si un testeur en a un.

## Décisions (tranchées le 2 novembre 2026)

1. **Mots-clés sans parent** (ceux sous Characters, Locations, Themes ont déjà leur type) : une carte
   **Personnage** quand le mot-clé porte le nom d'un personnage importé, sinon une carte **Idée** que
   l'auteur transforme d'un `/`.
2. **Notes d'une scène** : une carte Idée reliée à la scène ; une note d'une seule ligne va dans le synopsis.
3. **Choix avant import** : une seule fenêtre qui liste les dossiers de 1er niveau avec une case chacun, tout
   coché sauf la Corbeille (la Recherche reste cochée, l'auteur la décoche s'il veut).
4. **Documents exclus de la compilation** dans le Manuscrit : importés comme scènes, et cités dans le rapport.
5. **Ordre des chantiers** : les préalables A, B, C, D d'abord, l'import Scrivener ensuite.
