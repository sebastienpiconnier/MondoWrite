# Ce que MondoWrite peut reprendre de NEO

[NEO](https://github.com/hughhowey/neo) (Hugh Howey) est un traitement de texte pour romanciers, sous licence **MIT**. Son code peut être repris dans MondoWrite (AGPL-3.0) à condition de garder la mention de copyright et la licence MIT des fichiers copiés (dans `licenses/` et en tête du fichier repris).

Les deux outils se complètent : NEO est centré sur la page (on écrit le livre), MondoWrite sur le chaos des idées (canevas, bible, plan). Ce qui suit, ce sont les idées de NEO qui serviraient la vue Manuscrit de MondoWrite sans alourdir le reste.

## Déjà repris (octobre 2026)

| Idée de NEO | Dans MondoWrite |
|---|---|
| Des pages qui ressemblent à un livre | Manuscrit mis en pages au format livre (2:3, alinéas, justifié), numérotation continue d'une scène à l'autre |
| Lettrine en ouverture de chapitre | Première lettre de la première scène d'un chapitre |
| Chapitres numérotés automatiquement | Numéro tiré de la place dans le récit, jamais écrit dans le fichier |
| Objectif du jour, objectif du livre, compte des mots par jour | Panneau Statistiques : mots du jour, jours d'affilée, barres de progression, objectifs enregistrés dans `cosmos.json` |
| Entrée, Entrée, Entrée | Deux fois Entrée sur une ligne vide coupe la scène (nouvelle carte Scène, même chapitre) ; une troisième, au début de la nouvelle scène, ouvre un chapitre ; Retour arrière annule |
| Les pages d'un livre publié | Type de page d'une scène : page de titre, mentions légales, dédicace, épigraphe, prologue, épilogue, remerciements, à propos de l'auteur ; placées avant ou après le récit, hors chapitres |
| Bible du fork (`bible.js`, branche `pr-story-bible`) | Genre, surnoms et relations dans la fiche ; champs remplis seuls visibles, « Plus de détails » pour les autres ; surnoms reconnus dans le texte ; « Cité N fois, dès la scène X » sous le nom |
| Typographie automatique (`smartKeys`) | Extension `Typography` : guillemets, apostrophe, …, tiret, espaces insécables du français ; réglage de l'appareil |
| Note de plan en paragraphe fantôme | Le synopsis d'une scène vide s'affiche en filigrane (Manuscrit, carte agrandie) |
| « Renommer aussi dans le texte » | « Renommer partout… » dans le menu d'une carte, et Rechercher et remplacer (Cmd/Ctrl+Maj+H) |
| Import .docx, .md, .txt avec détection des chapitres | Accueil, « Importer un manuscrit ou un scénario… » : mêmes règles (styles Word, sauts de page, « Chapitre N », numéros en série, séparateurs, titre et auteur en tête) ; aussi le .fdx |

## À reprendre ensuite, par ordre d'intérêt

1. **Typographie automatique** (`app.js`, à partir de la ligne 4173 environ, fonction `smartKeys`) : tiret cadratin à partir de deux traits d'union, points de suspension, guillemets courbes et, en français, guillemets « » avec espaces insécables et espace fine avant `; : ! ?`. C'est le code le plus directement réutilisable : il est indépendant de l'éditeur (il travaille sur le texte autour du curseur) et Sébastien l'a déjà adapté au français dans son fork. À brancher comme règles de saisie TipTap dans le manuscrit et les cartes.
2. **Le Chutier** (« Darlings ») : glisser un passage sur un onglet pour le retirer du texte sans le perdre, et le remettre plus tard à sa place exacte. Dans MondoWrite, un passage chuté pourrait aussi devenir une carte Idée sur le canevas, ce qui prolonge naturellement la logique du chaos vers l'ordre.
3. **Marques à reprendre** (⌘⇧X) : un repère dans le texte et une note en marge (« vérifier la date »), un point rouge sur la scène dans la liste. Proche des questions « à creuser » des personnages : les deux pourraient partager le même panneau.
4. **Note de plan en paragraphe fantôme** : la note d'une scène (le texte de sa carte) s'affiche en gris dans la page vide et suit le curseur pendant qu'on écrit. Dans MondoWrite, c'est le lien le plus direct entre la carte Scène et son texte.
5. **Sprints d'écriture** : un objectif de mots en temps limité, avec le compte en direct.
6. **Bible du fork, encore à reprendre** : types de fiches du monde avec leurs champs (objet : à qui il appartient, pourquoi il compte ; groupe : membres, but ; indice : ce qu'il révèle, qui le sait ; système : principe, limites et prix à payer ; événement : quand, ce qui s'est passé, conséquences ; lieu : ambiance), galerie de plusieurs images par fiche, « renommer aussi dans le texte » quand on renomme un personnage, synopsis de toute l'histoire en tête du Plan, import de fiches d'un autre projet, export des fiches en un seul fichier HTML.
7. **Paragraphes « poésie » et « sans alinéa »** (⌘⇧Entrée, Maj+Entrée) : citations, chansons, lettres, panneaux dans le récit.
8. **Correcteur à la demande** (⌘;) plutôt que des soulignements pendant l'écriture.
9. **Sauvegardes quotidiennes** (archive ZIP du projet, gardée quinze jours) et **instantané PDF horodaté** avec empreinte SHA-256 du texte.
10. **Import .docx, .txt, .md** avec détection des chapitres et des sauts de section : utile pour faire entrer un manuscrit existant dans MondoWrite (chaque chapitre devient un chapitre du plan, chaque section une carte Scène).

## À ne pas reprendre

- **Couvertures générées par OpenAI** : contraire au pilier « souveraineté des données » si elles sont proposées par défaut. Une couverture abstraite générée localement (NEO sait aussi le faire, sans IA) serait acceptable pour l'écran d'accueil.
- **Bibliothèque en étagères** : l'écran d'accueil de MondoWrite remplit déjà ce rôle ; inutile de le compliquer.
- Tout ce qui tient à Electron (menus natifs, `preload.js`) : MondoWrite est en Tauri.

## L'export « Paperback for KDP » de NEO (relu en octobre 2026)

NEO fabrique un PDF d'intérieur prêt pour Amazon KDP, plus un gabarit de couverture. La mise en pages passe par Paged.js dans une fenêtre Electron cachée (`printToPDF`), ce que Tauri ne permet pas : chez nous, il faudrait composer les pages en TypeScript (comme `prose.ts` et `typeset.ts`) et les dessiner avec pdf-lib, avec une police à chasse variable et ses métriques (fontkit).

Ce que fait NEO (`app.js`, PRINT BOOK ; `main.js`, makePaperback) :

- **Formats** : 5 × 8, 5,25 × 8, 5,5 × 8,5 et 6 × 9 pouces, avec un corps de texte par format (10,5 à 11,5 pt), interligne 1,42.
- **Marges miroir** : marge extérieure par format (0,6 à 0,75 pouce), marge intérieure (petit fond) selon le nombre de pages, d'après les paliers de KDP (0,375 à 0,875 pouce, plus un quart de pouce de sécurité). La mise en page est refaite tant que le nombre de pages change de palier.
- **Pages paires et impaires** : chaque chapitre commence sur une belle page (à droite), le livre finit sur une page paire (une page blanche ajoutée au besoin).
- **Titres courants** : l'auteur en haut des pages de gauche, le titre en haut des pages de droite, en petites capitales espacées ; numéros de page aux coins extérieurs ; rien sur les pages de début, les ouvertures de chapitre et les pages blanches. La page 1 est la première page du récit.
- **Pages de début** : page de titre (titre, sous-titre, auteur), mentions légales au verso (texte standard, mention de fiction, ISBN), dédicace et épigraphe sur une belle page, table des matières avec numéros de page (calculés après une première mise en pages), parties.
- **Texte** : justifié, alinéa de 1,5 em, premier paragraphe d'un chapitre et paragraphe après un séparateur sans alinéa, lettrine sur deux lignes (sauf quand le chapitre s'ouvre sur un dialogue), séparateur « * * * », veuves et orphelines (2 lignes), paragraphes de poésie, notes de bas de page.
- **Césure** : faite par NEO lui-même (algorithme de Liang, motifs TeX par langue, paquet `hyphen`), avec des tirets conditionnels : jamais dans un mot à majuscule (un nom, sauf en allemand), au moins trois lettres de chaque côté, jamais dans le dernier mot d'un paragraphe.
- **Pages de fin** : « Merci de votre lecture » (demande d'avis, texte modifiable), site, lettre d'information, courriel, réseaux ; remerciements, à propos de l'auteur ; « Du même auteur ».
- **Gabarit de couverture** : PDF de la couverture complète (quatrième, dos, première) à la taille exacte pour ce nombre de pages, dos calculé selon le papier (blanc, crème, bouffant), fond perdu de 0,125 pouce, zones de sécurité, emplacement du code-barres, annotations ; taille de page réécrite au millième de pouce (KDP la vérifie).
- **Contrôles** : moins de 24 pages ou plus que le maximum du papier signalés.
- **Ailleurs** : format manuscrit à la Shunn (Times ou Courier, en-tête « Nom / TITRE / page », nombre de mots arrondi sur la page de titre, « # » entre les scènes, FIN), signets du PDF par chapitre, instantané PDF horodaté avec empreinte SHA-256, EPUB conforme aux règles de KDP.

Repris en octobre 2026 (points 1 à 7, `src/export/paperback.ts`, `paperbackPdf.ts`, fenêtre « Livre broché (KDP) » du menu Exporter). La police est Crimson Text (OFL), avec son italique et son gras ; le sommaire se fait en deux passages, le grand fond se recalcule tant que le nombre de pages change de palier. Liste d'origine :

1. **Un export « Livre broché (KDP) »** : formats, marges miroir et petit fond par paliers, chapitres sur une belle page, page 1 au début du récit, nombre de pages pair, titres courants et folios aux coins extérieurs, pages de début et de fin tirées de nos pages du livre (titre, mentions légales, dédicace, épigraphe, prologue, épilogue, remerciements, à propos de l'auteur). C'est le cœur ; tout se calcule dans un module pur et testé (`book.ts` de l'export), comme `prose.ts`.
2. **Texte composé** : justification, césure française et anglaise (paquet `hyphen` et ses motifs, chargés à l'export), veuves et orphelines, lettrine, sans alinéa après un titre ou un séparateur. Il faut embarquer une police à empattements libre avec son italique (EB Garamond, Libre Baskerville ou Source Serif, licence OFL).
3. **Mentions légales par défaut** : copyright, « Tous droits réservés », mention de fiction, ISBN, quand la page n'a pas été écrite.
4. **Table des matières avec numéros de page** : facile chez nous, la composition connaît la page de chaque chapitre (pas besoin de deux passes).
5. **Gabarit de couverture** : un second PDF à la taille exacte, dos calculé d'après le nombre de pages et le papier, fond perdu, zones de sécurité, code-barres.
6. **Pages de fin** : « Merci de votre lecture » avec liens (le profil d'auteur a déjà les coordonnées) et « Du même auteur ».
7. **Signets du PDF** par chapitre (pdf-lib sait écrire un plan de document) et **format manuscrit à la Shunn** pour notre PDF actuel (en-tête « Nom / TITRE / page », nombre de mots arrondi, « # » entre les scènes).
8. Plus tard : notes de bas de page (il faudrait d'abord des notes dans l'éditeur), instantané horodaté avec empreinte.

