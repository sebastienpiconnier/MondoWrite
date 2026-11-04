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
