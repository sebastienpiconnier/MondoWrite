# Couverture complète pour le livre broché (KDP)

> Issue : #78.

> **Statut : étude faite, décisions de l'auteur prises (14 novembre 2026), lot 1 pas commencé.** Les deux premières demandes de la même série sont faites dans la fenêtre « Générer la couverture » : nom de l'auteur sur l'image, style de l'image avec un conseil selon le genre, place laissée au texte.

Question de l'auteur : MondoWrite peut-il fabriquer la couverture entière d'un livre broché pour Amazon KDP (premier plat, dos, quatrième de couverture), au bon gabarit, à partir de la couverture générée ?

## Réponse courte

Oui, sans dépendance nouvelle, **à condition que l'app compose la couverture** (image, textes, dos, quatrième) au lieu de la faire dessiner en entier par l'IA. Le seul point dur est la **résolution de l'image** : une image générée aujourd'hui (1024 × 1536 px) est trop petite pour 300 DPI. On peut le mesurer et le dire à l'auteur dès le premier lot ; l'agrandir proprement est un chantier à part.

## Ce qui existe déjà

- `coverLayout` (paperback.ts, pur, testé) : dimensions exactes de la couverture entière, dos selon le papier et le nombre de pages, fond perdu de 0,125 in, zones sûres (plats et dos), place du code-barres (2 × 1,2 in), texte du dos permis ou non (`SPINE_TEXT_PAGES`).
- `buildCoverTemplate` (paperbackPdf.ts) : le gabarit PDF actuel, un guide à poser sous un logiciel de mise en page, avec ses mesures écrites dessus.
- Le nombre de pages réel : `PaperbackPanel` met le livre en page avant de proposer les deux PDF (`prepared.pages`). La couverture complète se fabriquera donc au même endroit, après l'intérieur.
- L'image de couverture : `pitch.visuel` (générée en Atelier, photo libre ou image de l'appareil).
- Les textes : titre du projet, nom signé du profil (`settings.author`), parcours de l'auteur (`profile.bio`), tagline, logline et résumé de la couverture de la Bible, ISBN (`print.isbn`).
- pdf-lib et des polices embarquées sous licence OFL (Crimson Text, polices Fontsource du PDF de la Bible).

## Exigences de KDP à respecter

- Un seul PDF d'une page : quatrième, dos et premier plat, fond perdu de 0,125 in sur les bords extérieurs.
- Images à 300 DPI au moins.
- Texte sur le dos seulement au-delà de 79 pages, à 0,0625 in au moins de chaque bord du dos. L'aide de KDP dit tantôt « plus de 79 », tantôt « au moins 79 », et son outil de couverture demande 80 : `SPINE_TEXT_PAGES` vaut 80 depuis le 14 novembre 2026 (gabarit et guide suivent).
- Titre présent sur le premier plat ; polices incorporées ; ni repères de coupe, ni annotations, ni texte provisoire.
- Code-barres : si l'auteur n'en fournit pas, KDP l'imprime dans la zone prévue. Il suffit de la laisser claire et vide.

## Pourquoi composer plutôt que tout faire dessiner

- La largeur du dos change avec chaque page ajoutée ; l'IA ne la tiendrait pas au centième de pouce.
- Les modèles d'image écrivent mal les lettres (la fenêtre le dit déjà) ; un titre, un nom et une quatrième composés en vraies polices restent nets et corrigeables.
- Les tailles d'image proposées par les services sont fixes et ne suivent pas le format du livre.

L'IA garde donc son rôle actuel : l'image du premier plat (ou, en option, une image en largeur pour toute la couverture, voir le lot 3).

## Le point dur : la résolution

Premier plat avec son fond perdu, à 300 DPI :

| Format | Taille du plat avec fond perdu | Pixels nécessaires | Image de 1024 × 1536 px |
|---|---|---|---|
| 5 × 8 in | 5,125 × 8,25 in | 1 538 × 2 475 | environ 186 DPI |
| 5,5 × 8,5 in | 5,625 × 8,75 in | 1 688 × 2 625 | environ 176 DPI |
| 6 × 9 in | 6,125 × 9,25 in | 1 838 × 2 775 | environ 166 DPI |

Pistes, de la plus simple à la plus lourde :

1. **Mesurer et prévenir** (lot 1) : vert à 300 DPI et plus, orange entre 200 et 300 (« risque de flou à l'impression »), rouge en dessous. L'auteur peut aussi déposer une image plus grande, faite ailleurs.
2. **Demander la plus grande taille au service** : vérifier les tailles que GPT Image 2.6 accepte réellement (Flare et Sunburst) et les demander pour une couverture.
3. **Agrandir** : un agrandissement par canvas reste flou. Un agrandisseur par IA sur l'appareil (Real-ESRGAN, licence BSD, modèle ONNX de quelques dizaines de Mo) ou par un service en ligne : dépendance lourde, à décider à part (lot 4).

## Découpage proposé

### Lot 1 : « Couverture complète » dans la fenêtre Livre broché

Un bouton de plus, à côté de « Gabarit de couverture » : un PDF prêt à déposer sur KDP.

- **Premier plat** : `pitch.visuel` recadré pour remplir le plat et son fond perdu (cadrage haut, centre ou bas). Titre et nom de l'auteur composés par l'app, en haut ou en bas, dans la zone sûre ; couleur claire ou foncée choisie d'après la luminosité de la zone (mesurée sur l'image). Case « Le titre est déjà sur l'image » quand l'auteur l'a fait écrire par l'IA.
- **Dos** : couleur unie tirée du bord de l'image (modifiable), titre et nom de haut en bas seulement quand KDP le permet, taille calculée pour tenir dans le dos moins ses marges.
- **Quatrième** : même couleur, ou l'image floutée et assombrie ; accroche (tagline) en tête, texte de quatrième, courte présentation de l'auteur (`profile.bio`, raccourcie à la demande), ISBN ; zone du code-barres laissée claire.
- **Contrôles avant d'enregistrer** : résolution, texte de quatrième trop long pour la place (mesuré, jamais coupé en silence), titre présent, rien hors des zones sûres.
- **Aperçu** dans la fenêtre (pdf.js, comme l'export de la Bible), avec les zones sûres en option, jamais dans le PDF final.

### Lot 2 : typographie selon le genre

Quatre à six jeux de polices (un serif classique, un sans-serif sobre, une police condensée pour le thriller, une police manuscrite pour la comédie romantique…), proposés selon le genre comme les styles d'image. Polices OFL seulement, chargées à l'export, citées dans `THIRD-PARTY-NOTICES.md`.

### Lot 3 : image enveloppante (option)

Générer une image en largeur qui couvre les deux plats et le dos, sujet principal tenu dans le tiers droit (premier plat) par la consigne. Plus spectaculaire, mais la résolution manque encore plus (environ 3 800 px de large pour un 6 × 9 de 200 pages) et le dos peut couper un détail. À n'essayer qu'après le lot 1.

### Lot 4 : agrandissement (si l'auteur le veut)

Voir la piste 3 ci-dessus.

### En passant : couverture Kindle

Le premier plat seul, en JPEG de 1 600 × 2 560 px, pour l'ebook : presque gratuit une fois le lot 1 fait.

## Format du projet

- Texte de quatrième : nouvelle clé de texte de la couverture (`pitch.quatrieme`, avec son champ dans la Bible), sinon le résumé. Une version d'avant la garde (clé de texte inconnue de `readPitch`).
- Réglages de la couverture (cadrage, place du titre, police, couleur du dos, fond de la quatrième) : un bloc à part dans cosmos.json (`coverDesign`, dans `KNOWN_META`), pas dans `print`, que `cleanPrint` d'une version d'avant viderait.
- L'image reste dans `medias/` ; rien n'est réécrit quand on ne fait qu'exporter.

## Décisions de l'auteur (14 novembre 2026)

1. **Quatrième de couverture** : un champ à part, `pitch.quatrieme` (conseil retenu, à confirmer). Le résumé de la Bible raconte toute l'histoire, fin comprise, pour un éditeur ou un producteur ; la quatrième donne envie sans rien dévoiler et tient en 150 à 200 mots. Le champ vide montre en filigrane le début du résumé, jamais recopié ; en mode Atelier, « Proposer une quatrième » comme le brouillon de la couverture (marqué et journalisé).
2. **Pas de photo de l'auteur** au dos.
3. **Agrandir les images** trop petites : oui. Moyen proposé (à confirmer) : agrandisseur sur l'appareil, Real-ESRGAN (licence BSD 3 clauses) par onnxruntime-web (MIT), modèle téléchargé à la demande depuis mondowrite.app avec son empreinte SHA-256, comme les synonymes, jamais dans l'installeur ; agrandissement ×2 par tuiles (1024 × 1536 donne 2048 × 3072, assez pour tous les formats proposés). Taille du modèle et durée sur iPad à mesurer avant de s'engager. Pas de service en ligne : il faudrait une clé de plus.
4. **Texte du dos à partir de 80 pages** : fait (`SPINE_TEXT_PAGES`).
5. **Nom sur la couverture** : le nom de plume s'il est rempli, sinon prénom et nom (`authorName` du profil, déjà la règle de `settings.author`).
