# Demandes d'évolution

Demandes de l'auteur pas encore planifiées dans un lot. Chaque entrée garde sa date ; une entrée prise dans un plan (`docs/plan-*.md`) y est cochée et retirée d'ici. Cochées ici : faites sur la branche `ameliorations-1.3.4`.

## 27 octobre 2026

- [x] **Importer un scénario en PDF.** (Fait, et aussi un roman en PDF : `import/pdf.ts`.) Lire le texte du PDF (pdf.js, déjà dans l'app pour les cartes Document) et reconnaître les éléments par leur retrait et leur casse (en-tête, personnage, dialogue, didascalie, transition), puis passer par `importScreenplayModel` comme le FDX. À tester sur des PDF de Final Draft, Fade In, Highland et du nôtre.
- [x] **Bug : « Dans cette scène » ne suit pas la scène choisie dans le volet de gauche** (Scénario, et à vérifier dans le Manuscrit). Les personnages présents n'apparaissent qu'après un clic dans le texte de la scène : le panneau suit le curseur de l'éditeur, que le choix dans la liste ne déplace pas.
- [x] **Répartition compacte du canevas.** « Organiser » adapte la disposition au nombre de cartes pour que l'ensemble forme un bloc compact (proche d'un carré ou du format de l'écran), au lieu d'une longue bande.
- [x] **Recherche d'une carte : centrer et zoomer.** Choisir une carte dans la recherche centre le canevas sur elle avec un zoom de 50 % (aujourd'hui : mise en avant seulement).
- [ ] **Carte monde ?** À préciser avec l'auteur (carte géographique de l'univers, avec les lieux posés dessus ?).
- [x] **Option « (CONT'D) » et « (MORE) »** (Fait : PDF et écran, plus « (SUITE) » quand un personnage reprend après une action.) dans l'export PDF du scénario : pouvoir ne pas les imprimer (aujourd'hui toujours imprimés quand une réplique passe d'une page à l'autre). À préciser : aussi à l'écran ?

## 4 novembre 2026

Manques relevés en comparant MondoWrite à Scrivener (les formats de script théâtre, BD et radio ont été écartés).

- [ ] **Sauvegardes automatiques hors du projet.** Des .zip datés du projet, écrits dans un dossier à part (pas dans le dossier du projet, synchronisé avec lui), avec une rotation (garder les N derniers). Aujourd'hui, les versions du jour (`markdown/versions/`) vivent dans le projet : si le dossier est abîmé ou effacé, elles partent avec.
- [ ] **Objectifs plus fins.** En plus de l'objectif par jour et pour le livre (`goals`) : une échéance (date de fin, l'objectif du jour se calcule tout seul), un objectif de séance avec un signal quand il est atteint, un objectif par chapitre ou par scène.
- [ ] **Fréquence des mots et répétitions.** Les mots les plus utilisés du manuscrit (hors mots outils), et les répétitions proches, dans l'onglet « Vérifier » : signaler, jamais corriger.
- [ ] **Mode révision pour le roman.** Comme les révisions de scénario (`docs/plan-revisions-scenario.md`) : le texte modifié pendant une passe de révision prend la couleur de cette passe.
- [ ] **Fusionner deux scènes.** L'inverse de « Couper la scène » : réunir une scène et la suivante (texte, synopsis, fils), la carte de la seconde partant à la corbeille.

Idées reprises de Studio (BYOK, application d'écriture gratuite présentée comme alternative à Scrivener, vidéo du 26 octobre 2026) :

- [ ] **Palette de commandes.** Cmd/Ctrl + K ouvre un champ où l'on tape le nom d'une action (« organiser », « exporter en PDF », « mode focus »…) et l'exécute. « Aller à » mène à des endroits ; la palette, à des actions. Utile surtout sous Windows et Linux, sans barre des menus. Les commandes viendraient de la même liste que le menu du Mac (`appMenu.ts`) et les raccourcis (`shortcuts.ts`), pour ne rien décrire deux fois.
- [ ] **Page des projets plus riche.** Recherche, tri (nom, dernière ouverture, type) et filtre roman / scénario quand la liste grandit, et un bouton « Reprendre là où j'en étais » qui rouvre le dernier projet à la bonne vue, à la bonne scène, curseur compris (position gardée sur l'appareil, jamais dans le projet).
- [ ] **Police et interligne de la page d'écriture.** Réglages de l'appareil (`settings.writing`) : choix entre quelques polices embarquées (licence OFL) et interligne simple, 1,5 ou double, pour le Manuscrit à l'écran seulement (les exports gardent leur format). Attention aux coupures de page : tout est en `em`, l'interligne entre dans le calcul des pages.
- [ ] **Revenir au projet tel qu'il était un jour donné.** À partir des sauvegardes .zip hors du projet (voir plus haut) : une liste datée, et « Ouvrir cette sauvegarde » en nouveau projet (jamais par-dessus le projet actuel), pour retrouver un canevas, une Bible ou un plan d'avant, pas seulement le texte d'une scène.
