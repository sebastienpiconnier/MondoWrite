# MondoWrite

*Anciennement Cosmos : seul le nom change, vos projets et réglages restent les mêmes.*

**Français** · [English](README.en.md)

**Du chaos au monde ordonné : un canevas pour les romanciers et les scénaristes qui construisent leur histoire avant de l'écrire.**

<img width="1389" height="868" alt="preview (3)" src="https://github.com/user-attachments/assets/05dfbce7-cc79-433a-bb5a-b9e2ab889e2b" />

<a href="https://youtu.be/5rjuSszJ8mA"><img src="docs/images/video-poster-fr.jpg" width="640" alt="Voir la vidéo de présentation de MondoWrite (1 min)"></a>

[Télécharger](#télécharger) · [Fonctionnalités](#fonctionnalités) · [L'IA](#lia-si-vous-le-souhaitez) · [Plateformes](#plateformes) · [Développer](#pour-développer)

---

## 🏛️ Chers auteurs architectes

Vous ne commencez pas un roman en naviguant à vue. Vous ne faites pas sauter vos personnages du haut d'une falaise en espérant qu'un filet apparaisse au chapitre suivant.

Pour vous, écrire est un acte de construction. Avant d'aligner la première phrase du chapitre un, vous avez besoin de voir l'ossature, d'éprouver la charpente, de cartographier la géographie du monde et d'établir les motivations profondes de chaque protagoniste.

Mais jusqu'ici, vous deviez jongler : un tableau virtuel d'un côté, un traitement de texte de l'autre, des dossiers de notes éparpillés, des fiches personnages dupliquées trois fois… Le chaos avant l'ordre.

En grec, *kosmos* désigne justement l'ordre du monde, né du chaos.

## 📐 Un outil pensé pour votre méthode de travail

MondoWrite a été conçu sur un principe fondamental : votre structure doit émerger naturellement, sans bureaucratie.

```text
   [ IDÉES & FRAGMENTS ] ──► ( Canevas interactif )
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
   [ BIBLE DU RÉCIT ]       [ PLAN & GABARITS ]      [ MANUSCRIT CLEAN ]
   Fiches synchronisées     3 actes, Save the Cat    Fichiers Markdown
   sans aucune retape       ou Voyage du héros       locaux et pérennes
```

- **4 vues, 1 seul contenu.** Modifiez un trait de caractère sur le Canevas, la Bible se met à jour immédiatement. Renommez une scène dans le Plan, le Manuscrit suit. Vous ne recopiez plus jamais la même information.
- **Des gabarits de structure éprouvés.** Placez vos scènes selon le Voyage du héros, Save the Cat! ou la structure en trois actes. Visualisez la chronologie par intrigue pour repérer d'un coup d'œil où un sous-fil narratif s'estompe.
- **La fiche personnage comme moteur dramatique.** Définissez en trois cases lisibles le moteur de vos personnages (Veut, A besoin de, Blessure). Laissez l'assistant vous poser les bonnes questions pour combler vos zones d'ombre.
- **Souveraineté et pérennité.** Pas de cloud propriétaire, pas d'abonnement, pas de format verrouillé. Vos projets sont de simples dossiers de fichiers Markdown enregistrés sur votre machine. Vous gardez 100 % du contrôle sur votre œuvre.
- **Libre et gratuit.** MondoWrite est un logiciel libre, distribué sous licence GPL-3.0 : vous pouvez l'utiliser, l'étudier, le modifier et le partager.

**L'IA ne rédigera pas votre livre.** Si vous choisissez de l'activer (y compris un modèle 100 % local sur votre ordinateur), elle se contente d'analyser vos incohérences, de remettre vos notes en ordre et de vous poser des questions pointues. Vous restez l'unique architecte.

## 🧱 Prêts à bâtir votre prochain univers ?

[Téléchargez MondoWrite](https://github.com/sebastienpiconnier/cosmos/releases/latest) gratuitement pour macOS, Windows ou Linux, et transformez vos fragments d'idées en un monde parfaitement ordonné.

## Télécharger

Les installeurs pour macOS (Apple Silicon et Intel), Windows et Linux sont disponibles dans les [Releases](https://github.com/sebastienpiconnier/cosmos/releases).

> **Premier lancement.** Sur macOS, l'app est signée et vérifiée par Apple : elle s'ouvre normalement. Sur Windows, elle n'est pas encore signée : si SmartScreen s'affiche, cliquez sur « Informations complémentaires » puis « Exécuter quand même ».

**Mises à jour :** MondoWrite vous prévient quand une nouvelle version sort et l'installe d'un clic, après avoir enregistré votre projet (Réglages, « Mises à jour », ou « À propos de MondoWrite »).

MondoWrite est en cours de développement (version 0.1.7).

## Fonctionnalités

### Le canevas

- **Cartes libres :** double-clic ou clic droit sur le canevas, appui long au doigt, bouton « Nouvelle carte » ou touche N, et vous écrivez directement son titre (Entrée passe au texte). Texte riche (gras, italique, listes). Une nouvelle carte ne se pose jamais sur une autre.
- **Dix types de carte :** Idée, Personnage, Lieu, Scène, Intrigue, Thème, Question, Image, Lien, Document. On change de type en tapant `/` en début de ligne ou en touchant l'étiquette du type.
- **Coller, comme dans Milanote :** collez ou déposez un lien ou une image sur le canevas : une seule carte **Lien** ou **Image** naît là où vous êtes (un texte collé devient une Idée, une Scène s'il commence par un en-tête comme « INT. PHARE - NUIT », et un intertitre `# …` lui donne son titre). L'adresse d'une image, ou une image glissée depuis une page web, devient une carte Image. Plusieurs fichiers déposés d'un coup font une carte chacun, et un fichier `.md` ou `.txt` devient la carte qu'il annonce (titre, type et fiche d'une carte MondoWrite ou d'une note Obsidian). Collez une adresse dans une carte encore vide : c'est elle qui devient la carte Lien, sans en créer une deuxième. « Organiser le canevas » les range dans les cadres Images et Liens, et la Bible a une rubrique pour chacun. Pour un lien, MondoWrite lit la page : titre, auteur, date de publication et image du site arrivent d'eux-mêmes. Le même lien collé deux fois ne crée qu'une carte. Un lien garde le jour où vous l'avez consulté ; « Compléter depuis la page » remplit ce qui manque, « Ouvrir » affiche la page.
- **Cartes repliées :** une carte au texte long se replie, « Plus de détails » la déplie.
- **Mise en forme et Markdown :** sélectionnez un mot, une barre propose gras, italique, barré, titre, listes, case à cocher, citation. Le Markdown marche à la frappe (`**gras**`, `*italique*`, `# titre`, `- liste`, `[ ] tâche`) et au collage, dans les cartes, la Bible et le manuscrit, et les fichiers restent en Markdown.
- **À faire :** les cases non cochées, les passages « à reprendre », les questions gardées pour plus tard et les questions ouvertes, rassemblés dans un seul panneau, chacun relié à sa carte ou à sa scène.
- **Raccourcis clavier** pour tout ce qui compte ; Ctrl/Cmd+/ en donne la liste.
- **Fils étiquetés :** tirez un fil d'une carte à une autre et nommez le lien (« y travaille », « soupçonne », « se passe à »). Le fil part toujours du bord le plus proche. Clic sur le fil (ou appui au doigt) pour le renommer ou le **délier** ; dans la Bible, la croix d'un lien fait de même.
- **Mentions :** tapez `@` dans une carte pour en citer une autre. Le fil se tire tout seul, la mention suit si vous renommez la carte, et vous pouvez créer la carte citée sans quitter votre phrase.
- **Images :** déposez une image sur une carte ou sur le canevas, ou utilisez le bouton image de la carte. Elle garde ses proportions (un fond flou tiré d'elle comble les côtés), est copiée dans le dossier `medias/` du projet et apparaît aussi dans la Bible.
- **PDF :** déposez, collez ou importez un PDF (menu « Nouvelle carte », « Document PDF… ») : une carte **Document** naît, avec l'aperçu de sa première page, son nombre de pages, son auteur et son année quand le fichier les donne. « Lire le document » l'ouvre dans l'app, page après page. Le PDF est copié dans `medias/`.
- **Votre profil d'auteur :** sur la page des projets, saisissez une fois votre prénom, votre nom, votre nom de plume et vos coordonnées. Chaque nouveau scénario les reprend sur sa page de titre (auteur et contact), et le manuscrit exporté les porte sur sa page de garde. Ils restent sur l'appareil et se modifient à tout moment.
- **Photos libres :** le menu « Nouvelle carte », « Photo libre… » (ou « Ajouter des photos » dans la galerie d'une fiche) cherche des photos sur **Openverse** (images sous licence libre, sans clé), **Pixabay** ou **Unsplash** (clé gratuite, collée une fois, gardée sur l'appareil). La photo choisie devient une carte Image, avec l'auteur, le lien, la source et la licence dans sa fiche. Le bouton image d'une carte (et le portrait d'un personnage dans la Bible) ouvre la même fenêtre : une photo libre, ou une image de l'appareil.
- **Lien vers la fiche :** chaque carte typée a un bouton qui ouvre sa fiche dans la Bible.
- **Sélection multiple :** Maj + glisser entoure des cartes, Ctrl/Cmd + clic en ajoute une, Ctrl/Cmd + A sélectionne tout, Échap désélectionne ; au doigt, le bouton « Sélection ». Les cartes choisies se déplacent ensemble, et une barre propose de les encadrer ou de les mettre à la corbeille.
- **Largeur des cartes :** tirez la poignée du coin bas droit d'une carte sélectionnée, ou Alt+→ et Alt+←.
- **Nouvelle carte :** le bouton crée une Idée (touche N) ; sa flèche propose aussi un **Lien** (collez ou tapez l'adresse dans son titre), un **Document PDF**, une **Photo libre** ou une **Image de l'appareil**.
- **Cadres :** un rectangle nommé (« Acte 1 ? », « Le phare ») pour regrouper des cartes. Bouton ou touche C ; avec des cartes sélectionnées, le cadre les entoure. Le déplacer emmène ses cartes et les cadres qu'il contient. Le cadenas de son en-tête le **verrouille** : « Organiser » n'y touche plus (ni au cadre, ni à ses cartes) et il ne bouge plus par mégarde.
- **Organiser le canevas :** un bouton range toutes les cartes en cadres (personnages, lieux, thèmes, questions, idées en vrac, images, liens, documents, pages du livre) et les scènes par case du gabarit et par chapitre, reliées dans l'ordre du récit, sous les cadres verrouillés qu'il laisse en place. En paysage : les cases se suivent de gauche à droite, rangées de 8 scènes au plus. Ctrl/Cmd+Z remet tout comme avant.
- **Corbeille :** une carte supprimée (sur le canevas, dans le plan, le séquencier ou le manuscrit) part à la corbeille avec ses fils, et dans un scénario avec le texte de sa scène. Un message propose d'annuler ; la corbeille (dans les Réglages) remet chaque carte à sa place ou la supprime pour de bon. Elle vit dans le dossier `corbeille/` du projet.
- **Annuler et rétablir :** Ctrl/Cmd+Z et Ctrl/Cmd+Maj+Z, ou les deux boutons du canevas. Cartes, fils, déplacements et textes.
- **Recherche :** la loupe de la barre du haut, ou Ctrl/Cmd+F, retrouve une carte par son titre ou son texte et la montre sur le canevas.
- **Mini-carte et zoom** pour s'y retrouver quand le canevas grandit.

### La Bible

La Bible s'ouvre sur **la couverture du projet**, comme une quatrième de couverture : titre, tagline, logline, résumé, comparables et note d'intention, avec des pastilles à toucher pour le genre, le public, le format, le point de vue, le temps du récit et le ton (une liste de choix courants, ou votre propre formulation). Le volume vient de votre objectif de mots, les thèmes de vos cartes Thème. Rien n'est obligatoire.

La rubrique Personnages propose une **carte des relations** : les portraits reliés par les fils du canevas, avec leurs étiquettes (« sœur de », « trahit »).

Puis toutes les fiches, générées à partir des cartes, sur une seule page et groupées par rubrique, avec leurs images et leurs liens ; le sommaire mène à chaque rubrique. La Bible se lit comme le document qu'elle exporte : mêmes rubriques, même ordre. Il n'y a rien à remplir : la Bible se met à jour quand le canevas change. On peut aussi y créer une fiche et la nommer : sa carte apparaît sur le canevas. Toutes les rubriques sont affichées, même vides ; vous choisissez lesquelles garder et dans quel ordre, et l'export suit ce choix. Tout s'y modifie sur place, titre et texte. Chaque fiche peut avoir sa galerie de photos (ajout par bouton ou par dépôt, agrandissement, choix de l'image principale), lieux et intrigues ont aussi leur fiche (ambiance, époque ; question dramatique, enjeu, déclencheur, obstacles, résolution), et un personnage a son portrait dans un cercle, son **moteur** en trois cases lues d'un coup d'œil (Veut, A besoin de, Blessure ; pour un antagoniste : Motivation, Force, Faille), son type d'arc dessiné (positif, tragique, plat), un assistant qui pose des questions **par thème** (l'essentiel, passé, corps, voix, émotions, colère, relations…), dont les réponses remplissent la fiche et sa **fiche d'identité** : rôle, genre, âge, métier, surnoms, origine, apparence, personnalité, voix, faille, peur, secret, relations, évolution. Tout est facultatif : seuls les champs remplis restent affichés. Sous le nom, l'affiche résume genre, âge, métier et rôle, et dit combien de fois le texte le cite et depuis quelle scène.

### Le plan

- **Quatre gabarits :** libre, trois actes, Save the Cat, voyage du héros. Chaque case rappelle en une ligne ce qu'on y attend.
- **Ranger les scènes :** glissez une scène dans une case, déplacez-la avec les flèches ou choisissez sa case dans un menu. Les scènes du canevas qui n'ont pas encore leur place attendent dans « À placer ».
- **Écrire depuis le plan :** une scène créée dans une case a aussitôt sa carte sur le canevas, et son titre se modifie des deux côtés. Chaque scène a son **synopsis** (ce qui s'y passe, en une phrase), écrit directement dans le plan.
- **Chapitres :** dans chaque case, les scènes se regroupent par chapitre. « Nouveau chapitre à partir d'ici » coupe le récit à une scène ; le numéro suit tout seul, le titre est facultatif.
- **Chaque gabarit s'explique :** sous le choix, une phrase dit ce qu'il est.
- **Changer d'avis :** passer d'un gabarit à l'autre ne perd rien, chaque gabarit garde son rangement.
- **Liste ou fiches :** le plan s'affiche en liste ou en fiches.
- **Chronologie par intrigue :** un tableau des scènes où chaque intrigue (une carte Thème), chaque personnage et chaque lieu a sa ligne. Vous voyez d'un coup d'œil où une intrigue disparaît trop longtemps, et vous reliez une carte à une scène en touchant une case.

### L'assistant personnage

- **Des questions, pas des réponses :** dans la fiche d'un personnage, « Questionner » pose une question à la fois, rangées par thème (l'essentiel d'abord, puis passé, corps, voix, quotidien, émotions…). Remplir la fiche ou se laisser guider : les deux mènent au même endroit.
- Votre réponse remplit le champ de la fiche qui lui correspond (Veut, Blessure, Voix…) s'il est vide ; les autres réponses se rangent dans « Réponses aux questions », repliées sous la fiche et modifiables. Vous pouvez aussi passer à une autre question.
- **« Je ne sais pas encore »** garde la question pour plus tard, dans l'onglet « À creuser » de la fiche. Sur le canevas, la carte du personnage affiche seulement « 3 questions à compléter », qui ouvre sa fiche.
- **Synthèse par l'IA** (si une IA est branchée) : elle remet en ordre ce que vous avez écrit du personnage (fiche, notes, réponses), sans rien inventer. Vous l'ajoutez à la fiche ou vous l'ignorez.

### Le manuscrit

- **Chapitrer en écrivant, comme dans NEO :** Entrée deux fois sur une ligne vide coupe la scène, la suite part dans une nouvelle scène ; Entrée une troisième fois ouvre un nouveau chapitre. Chaque coupure s'annonce en bas de page avec un bouton « Annuler » ; Retour arrière dans la scène vide l'annule aussi. Le numéro et le titre du chapitre s'écrivent en tête de page, comme dans un livre.
- **Les pages du livre :** une scène peut devenir page de titre, mentions légales, dédicace, épigraphe, prologue, épilogue, remerciements ou « à propos de l'auteur ». Elles se placent d'elles-mêmes avant ou après le récit, et chacune dit ce qu'on y écrit (« À qui dédies-tu ce livre ? »).
- **Une scène à la fois, en pages :** vous écrivez le texte de chaque scène dans l'ordre du plan, sur des pages au format livre, à la taille de l'écran (alinéas, texte justifié, lettrine en ouverture de chapitre), numérotées d'une scène à l'autre. Les scènes sont regroupées par chapitre ; un chapitre se déplace en le glissant dans la colonne de gauche, ou avec ses flèches. Au-dessus de la page, une barre discrète : le titre de la scène, le type de page, le mode focus et la corbeille.
- **Mode focus :** la page seule à l'écran, en machine à écrire si vous le souhaitez (la ligne en cours reste à hauteur d'yeux), avec la phrase, la ligne ou le paragraphe en pleine encre et le reste estompé. Ctrl/Cmd+Maj+X marque un passage « à reprendre ».
- **Statistiques et objectifs :** mots, pages, temps de lecture, scènes écrites, moyenne par scène ; mots écrits aujourd'hui, jours d'affilée, objectif du jour et objectif du livre (idée reprise de NEO).
- **Dans cette scène :** les personnages et les lieux cités dans le texte s'affichent à côté, avec les notes de la carte.
- **Vos fichiers :** chaque scène écrite est un fichier Markdown dans `manuscrit/`. Supprimer une carte n'efface jamais son texte : elle va à la corbeille et en revient avec lui.

### Romans et scénarios

Un projet est un roman ou un scénario, et vous pouvez basculer à tout moment. Le canevas et les fichiers restent les mêmes, seul le vocabulaire s'adapte : le Lieu devient Décor, le Plan devient Séquencier, le Manuscrit devient Scénario, et les cartes Scène prennent la forme d'un en-tête de scène (INT. PHARE - NUIT) en Courier Prime.

### L'éditeur de scénario

Pour un projet scénario, la vue Scénario est un éditeur au format cinéma, relié au canevas : chaque en-tête de scène est lié à sa carte Scène, et ce que vous écrivez dans l'un apparaît dans l'autre.

![L'éditeur de scénario : liste des scènes, feuille au format standard et panneau « Dans cette scène »](docs/images/scenario-fr.png)

<details>
<summary><strong>Toutes les fonctions de l'éditeur de scénario</strong></summary>

- **De vraies pages :** la feuille a les proportions et les marges du format choisi (A4 ou US Letter), page après page, comme à l'impression.
- **Page de titre :** une page de garde où vous écrivez le titre, votre nom, la mention « Écrit par », votre adresse de contact et la date. Votre nom est retenu pour vos prochains scénarios.
- **Six éléments :** en-tête de scène, action, personnage, didascalie, dialogue, transition, avec les retraits standard.
- **Tout au clavier :** Tab change le type de l'élément, Entrée passe à l'élément suivant logique (personnage, puis dialogue, puis action). Une barre d'éléments fait la même chose à la souris et au doigt.
- **Détection à la frappe :** une ligne qui commence par `int.` ou `ext.` devient un en-tête de scène, une parenthèse ouvre une didascalie.
- **Complétion :** les personnages et les décors de la Bible se proposent pendant que vous écrivez, avec les extensions (V.O., H.C.) et les moments (JOUR, NUIT). Un personnage ou un décor inconnu peut devenir une carte en un geste.
- **Relié au canevas :** renommer un en-tête de scène renomme sa carte, et inversement. Une scène, son décor ou un personnage que vous écrivez dans le scénario reçoit sa carte sur le canevas ; une carte Scène créée sur le canevas entre dans le scénario.
- **Pages et minutes :** le nombre de pages et la durée estimée (une page pour une minute environ) s'affichent en permanence.
- **Séquencier :** les scènes dans l'ordre, en liste ou en fiches, avec leur synopsis, leurs personnages et leur longueur. On les réordonne en les glissant ou avec les flèches, et le texte de la scène suit dans le fichier. Dans la vue Scénario aussi, la liste des scènes de gauche se réordonne : glisser une scène, les flèches de la scène en cours ou Alt+↑ / Alt+↓.
- **Gabarits du séquencier :** trois actes, Save the Cat, huit séquences ou épisode de série (pré-générique, quatre actes, épilogue). Chaque gabarit et chaque case expliquent ce qu'on y met. Les cases sont des sections du fichier Fountain, lisibles dans les autres logiciels, avec la durée de chacune.
- **Supprimer une scène :** depuis le séquencier, la scène part à la corbeille avec son texte.
- **Synopsis :** une phrase par scène, écrite depuis le volet des scènes ou le séquencier, enregistrée comme synopsis Fountain.
- **Import :** un fichier `.fountain` existant devient un projet, avec ses cartes Scène, Personnage et Décor déjà créées et reliées.
- **Numéros de scène, en-têtes soulignés et mode focus :** deux boutons de la barre numérotent les scènes dans la marge et soulignent les en-têtes (à l'écran, dans le PDF et dans Final Draft), et un mode ne garde que la feuille à l'écran.
- **Un format ouvert :** le texte est enregistré dans `scenario.fountain`, au format Fountain, lisible par les autres logiciels de scénario.

</details>

### L'IA, si vous le souhaitez

MondoWrite fonctionne entièrement sans IA. Vous pouvez en brancher une dans les Réglages :

- **En local**, avec Ollama ou LM Studio : vos textes ne quittent jamais votre machine. Aucun réglage du serveur n'est nécessaire.
- **Avec votre propre clé**, chez Claude, OpenAI ou OpenRouter : les passages analysés sont alors envoyés à ce fournisseur, selon ses conditions. Votre clé reste sur votre appareil, jamais dans le projet.

Elle questionne, elle n'écrit pas : aucune action ne modifie votre projet sans votre accord.

- **Ranger les idées :** propose un type (Personnage, Lieu, Scène…) pour vos idées en vrac. Vous appliquez ou vous ignorez, une par une, puis « Organiser le canevas » range tout en cadres.
- **Questions sur mesure :** dans l'assistant personnage, une question posée d'après ce que dit déjà la fiche. C'est vous qui répondez.
- **Synthèse d'un personnage :** remet en ordre ce que vous avez écrit, sans rien ajouter.
- **Décrire un lieu d'après une photo :** si vous le demandez, l'IA relève en notes ce que montre la photo (lumière, matières, ambiance), sans rien inventer. Il faut un modèle qui lit les images.
- **Vérifier la cohérence :** relève les contradictions possibles entre vos cartes (un âge, une date, un lieu), sous forme de questions que vous pouvez garder pour plus tard.

Quand l'IA parle d'une carte, elle la nomme par son titre et son type, par exemple « Inès Morvan (personnage) ».

Les consignes exactes envoyées à l'IA sont publiées dans [docs/prompts-ia.md](docs/prompts-ia.md).

### Les exports

- **Manuscrit :** les scènes d'un même chapitre forment un chapitre, séparées par « * * * ». PDF au format manuscrit (Courier 12, double interligne), Word (.docx), EPUB pour liseuse, ou un seul fichier Markdown.
- **Scénario :** PDF au format standard (Courier 12, marges normalisées, répliques coupées proprement entre deux pages), Fountain et Final Draft (FDX).
- **Bible :** PDF, Word ou Markdown, la couverture du projet en tête, puis les rubriques choisies dans la Bible, dans son ordre, avec les images de chaque fiche et leurs liens.
- **Canevas :** image PNG du tableau entier, PDF standard (A4, à envoyer) ou grand format (A1, à imprimer), et le texte des cartes en Word ou Markdown, un cadre par partie.
- **Sans rien installer :** tout est fabriqué par l'app elle-même.

### Confort

- **Plusieurs projets :** un écran d'accueil pour choisir celui sur lequel travailler, ou en créer un.
- **Sauvegarde automatique** dans des fichiers Markdown, ou Cmd+S / Ctrl+S.
- **Français et anglais**, avec la typographie propre à chaque langue.
- **Mode clair, sombre** ou comme le système.
- **Souris, doigt et clavier :** chaque action a les trois chemins.
- **Hors ligne :** polices embarquées, aucun compte, aucun serveur.
- **Mises à jour d'un clic** (ordinateur) : une vérification par jour au plus, désactivable ; rien n'est installé sans votre accord.

![Le même canevas en mode sombre, interface en anglais](docs/images/canvas-dark-en.png)

## Prise en main

- **Choisir un projet :** à chaque lancement, l'accueil liste vos projets. Depuis un projet, le bouton « Projets » enregistre et y revient.
- **Nouveau projet :** un titre de travail, roman ou scénario, et sur ordinateur le dossier où l'enregistrer. « Essayer avec un exemple » crée un projet complet, « Le Petit Chaperon rouge » de Perrault illustré par Gustave Doré (personnages, lieux, plan en trois actes, chapitres et conte écrit dans le manuscrit), et ouvre une visite guidée en six étapes (elle reste dans les Réglages).
- **Nouvelle carte :** double-clic ou clic droit sur le canevas, touche N, appui long au doigt, ou bouton « Nouvelle carte ». On écrit directement.
- **Changer le type :** taper `/` en début de ligne, ou toucher l'étiquette du type (« IDÉE »).
- **Relier :** tirer un fil depuis un point au bord d'une carte vers une autre, puis nommer le lien.
- **Réglages** (icône en haut à droite) : type de projet, corbeille, langue de l'interface, apparence, et branchement d'une IA.

### Vos fichiers

Chaque projet est un dossier :

- `cosmos.json` : titre, positions, liens et cadres
- `cartes/*.md` : une carte par fichier Markdown
- `manuscrit/` : le texte des scènes (roman)
- `scenario.fountain` : le texte du scénario
- `medias/` : les images
- `corbeille/` : les cartes supprimées, restaurables
- `markdown/` : le manuscrit, la bible et le canevas en trois fichiers Markdown, avec leurs images et des liens entre les fiches, à lire hors de MondoWrite (Obsidian, Typora, GitHub…). Ils sont réécrits à chaque enregistrement : modifiez le texte dans l'app, pas dans ces copies. `markdown/versions/` en garde une version par jour pendant 30 jours, puis une par mois. Le réglage se coupe dans les Réglages du projet.

```markdown
---
id: k3x9a7bq2m
type: personnage
title: "Inès Morvan"
---
Gardienne remplaçante. Ne supporte pas le **silence**.
```

**Travailler sur plusieurs ordinateurs :** placez le dossier du projet dans iCloud Drive, Dropbox ou OneDrive, en évitant de l'ouvrir sur deux machines en même temps. Le dossier choisi reste autorisé d'un lancement à l'autre, où qu'il soit (autre disque, OneDrive, clé USB). Si l'app ne parvient plus à l'ouvrir, elle vous le dit et vous le choisissez à nouveau avec « Ouvrir un dossier ».

## À venir

| Étape | Contenu |
|---|---|
| Scénario | Durées cibles par acte dans le séquencier, emphase (italique, gras) à l'écran et dans le PDF, dialogue double côte à côte |
| Mobile | Apps iOS et Android |
| Synchronisation | Entre appareils, puis collaboration |

## Plateformes

| Système | État |
|---|---|
| macOS (Apple Silicon et Intel), Windows, Linux | Prêt : installeurs fabriqués par GitHub Actions |
| iOS, iPadOS, Android | Code prêt (tactile, stockage), projet natif à initialiser |
| Navigateur | Pour le développement uniquement (stockage dans le navigateur) |

---

## Pour développer

**Stack :** Tauri 2, React 19, TypeScript strict, Vite, React Flow pour le canevas, TipTap pour l'éditeur, Zustand pour l'état.

### Prérequis

- Node 20+ et Rust (https://rustup.rs)
- **Mac :** les outils Xcode en ligne de commande (`xcode-select --install`)
- **Windows :** les Build Tools de Visual Studio (C++) et WebView2 (déjà présent sur Windows 10 et 11)
- **Linux :** `libwebkit2gtk-4.1-dev` et ses dépendances (voir `ci.yml`)

### Lancer

```bash
npm install
npm run tauri dev      # app desktop
# ou
npm run dev            # dans le navigateur (http://localhost:1420), sans accès disque
```

**Mobile (sur Mac) :** `npm run tauri ios init` puis `npm run tauri ios dev` (Xcode requis), ou `android init` / `android dev` (Android Studio et NDK requis). Sur mobile, les projets sont rangés dans l'espace privé de l'app.

### Vérifier

```bash
npm run build   # vérification TypeScript + build
npm test        # tests (Vitest)
```

### Publier une version

```bash
git tag v0.1.0 && git push --tags
```

GitHub fabrique les installeurs des trois systèmes et les dépose dans un brouillon de Release, qu'il reste à publier. Les secrets nécessaires pour signer les apps (compte développeur Apple, clé de signature des mises à jour, certificat Windows) sont listés dans `release.yml`. Une Release publiée normalement (pas en préversion) est celle que l'app trouve et installe.

### Travailler sur plusieurs ordinateurs

Le code passe par GitHub : `git push` en fin de session, `git pull` puis `npm install` si besoin en début de session sur l'autre machine. Ne pas mettre le dossier du code dans OneDrive ou iCloud.

### Documentation

Architecture, conventions et feuille de route détaillée : voir [CLAUDE.md](CLAUDE.md), prévu pour travailler avec Claude Code.

## Licence

MondoWrite est un logiciel libre, distribué sous licence [GNU GPL v3.0 ou ultérieure](LICENSE). Vous pouvez l'utiliser, l'étudier, le modifier et le redistribuer ; toute version modifiée que vous distribuez doit rester sous la même licence.

Le PDF embarque la police Courier Prime (licence SIL OFL, voir [OFL.txt](src/assets/fonts/OFL.txt)).

Le projet d'exemple reprend « Le Petit Chaperon rouge » de Charles Perrault (*Histoires ou contes du temps passé*, 1697) et trois gravures de Gustave Doré, gravées sur bois par Pannemaker (édition Hetzel, 1862), tous du domaine public. La traduction anglaise du conte a été faite pour MondoWrite.
