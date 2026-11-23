# Plan : collaboration (lot 16)

Écrire à plusieurs et faire relire, **sans compte ni serveur** : le projet reste un dossier de fichiers Markdown et
Fountain, partagé par le service que les auteurs utilisent déjà (Dropbox, OneDrive, Google Drive, iCloud Drive).
Décidé le 23 novembre 2026. Les issues du lot (jalon « Lot 16 · Collaboration ») renvoient à ce plan.

## Principes

- **Pas de compte, pas de cloud MondoWrite, pas d'API des services.** On ne se branche ni sur l'API de Dropbox, ni sur
  Microsoft Graph, ni sur l'API de Google Drive (OAuth, application déclarée, audit de sécurité payant chez Google pour
  l'accès complet au Drive). Le partage se fait par l'application de synchronisation du service, sur l'ordinateur.
- **Pas de temps réel.** Pas de CRDT ni de serveur relais : contraire à « l'œuvre appartient à l'auteur », et trop lourd.
  La collaboration est asynchrone : chacun à son tour sur une scène, l'app prévient et ne perd jamais un texte.
- **Invisible pour qui écrit seul.** Rien ne change tant que le projet n'est pas partagé (aucun bouton, aucun nom affiché).
- **Le format reste un contrat.** Tout ajout est facultatif et lisible par les versions d'avant (clés inconnues gardées).

## Ce qui existe déjà (à prolonger, pas à refaire)

- Verrou par appareil (`src/lock.ts`, dossier `verrous/`, un fichier par appareil pour éviter les copies en conflit,
  battement 45 s, périmé à 150 s) : un projet ouvert ailleurs s'ouvre en lecture seule, avec « reprendre la main ».
- Modifications faites hors de l'app (`conflicts.ts`, `diffDisk` à trois versions) : changé ailleurs, on reprend ;
  changé des deux côtés, copie « … (MondoWrite).md » et bandeau de choix.
- Écriture sûre (`writeSafely`), surveillance du dossier (`storage.watch`), sauvegardes hors du projet.
- Commentaires ancrés (`commentaires/<id>.md`), versions d'une scène (`versions/`), profil de l'auteur (`settings.profile`).

## Lot A · Identité (#128)

- Profil : nom affiché dans le projet (prénom ou nom de plume, déjà dans `settings.profile`) et une couleur choisie.
  Réglage de l'appareil, jamais dans le projet.
- Chaque commentaire porte son auteur : titre « ## <id> · <date> · <nom> » (champ facultatif, une version d'avant le lit
  comme aujourd'hui).
- Le verrou de l'appareil porte aussi le nom de la personne (`Lock.who`, facultatif).
- Fichier `auteurs.json` (facultatif) : nom et couleur de chaque contributeur vu dans le projet, pour l'affichage.

## Lot B · Mode Relecteur (#130)

- Par appareil et par projet : « J'ouvre ce projet en relecteur ». Le texte n'est pas modifiable ; on peut commenter et
  **suggérer** (remplacer, insérer, supprimer un passage).
- Une suggestion est un commentaire d'un genre à part : citation exacte du passage et texte proposé, dans
  `commentaires/<id>.md` (même fichier, même ancrage). Jamais appliquée seule.
- L'auteur l'accepte (le passage est remplacé, une version de la scène gardée avant, une étape d'annulation) ou la refuse.
- Fonctionne avec un dossier partagé ou un .zip échangé (export, puis « Reprendre les commentaires de ce .zip »,
  qui ne reprend que `commentaires/`).

## Lot C · Projet partagé (#131)

- Verrou **par scène** en plus du verrou par appareil : quand le projet est partagé, plusieurs personnes l'ouvrent en
  écriture, et seule la scène en cours d'écriture est tenue (fichier `verrous/<appareil>.json` enrichi de la scène
  ouverte, même battement : toujours un fichier par appareil, jamais un fichier commun).
- Une scène tenue ailleurs s'affiche en lecture seule avec « Ouverte par Camille sur son Mac, il y a 2 min ». Le verrou
  **prévient**, il ne garantit rien : la synchronisation met quelques secondes, et le filet reste la détection de conflit.
- Journal des contributions : chaque enregistrement d'une scène note qui l'a changée (ligne ajoutée à `journal.md`,
  sur le modèle de `ia-journal.md`, seulement ajouté). Affichage « Modifiée par… » dans la liste des scènes.
- « Ce projet est partagé » : réglage du projet (`shared: true` dans `cosmos.json`), qui allume tout cela.
- Les cartes et `cosmos.json` restent sous le verrou du projet pour les changements de structure (canevas, plan) :
  à étudier pendant le lot, peut-être un verrou « structure » à part.

## Lot D · Services de synchronisation (#132)

- **Fichiers à la demande** (OneDrive « Fichiers à la demande », Google Drive en mode « streaming », Dropbox « en ligne
  uniquement ») : repérer un fichier pas encore présent (lecture en échec ou trop lente, attributs du système sous
  Windows et macOS), le dire en clair et conseiller « Toujours conserver sur cet appareil » pour le dossier du projet.
- **Copies de conflit des services** : chacun crée ses doublons à sa façon (Dropbox : « (copie en conflit de …) » ou
  « (conflicted copy …) » ; OneDrive : nom de l'ordinateur ajouté ; Google Drive : doublon ou « (1) »). Les reconnaître
  (liste de motifs testée, toutes langues des services), ne jamais les lire comme des cartes, et proposer de comparer
  les deux versions de la scène (`textDiff.ts`), puis de garder l'une, l'autre, ou de les fusionner à la main.
- Écrire scène par scène, jamais tout le projet d'un coup (déjà le cas : seuls les fichiers modifiés sont réécrits).
- Guide : comment partager un dossier dans chaque service, en français, anglais, espagnol.

## Lot E · iPhone et iPad (#129)

- Coécriture entre appareils Apple par un **dossier iCloud Drive partagé** (iOS 13.4 et après ; aussi avec iCloud pour
  Windows) : à vérifier sur appareil avec le conteneur actuel et un dossier choisi.
- Dropbox, OneDrive et Google Drive sur iOS : leur fournisseur de fichiers gère mal l'écriture dans un dossier de
  nombreux fichiers (OneDrive perso grisé dans le sélecteur, octobre 2026). D'abord **mode Relecteur** seulement, voire
  lecture seule, jusqu'à preuve du contraire sur appareil.

## Ordre

#128, puis #130 (utile seul : faire relire), puis #131 et #132 ensemble (coécriture), puis #129.

## Hors du lot (écarté)

- Édition simultanée en temps réel, curseurs des autres, serveur MondoWrite.
- Connexion aux API des services, comptes MondoWrite.
- Droits fins par personne (le partage du dossier, chez le service, fait foi).
