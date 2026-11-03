# Plan : un univers partagé entre plusieurs projets

Demande de l'auteur du 3 novembre 2026 : pour une série de romans (ou plusieurs films dans un même monde), une
Bible commune à plusieurs projets. Le plus gros des chantiers retenus : à faire en dernier, après une étude.

Aujourd'hui chaque projet a sa Bible. Un auteur de saga recopie Inès Morvan dans le tome 2, et les deux fiches
divergent.

## Ce que l'auteur doit pouvoir faire

- Créer un **univers** (« La saga du phare ») et y rattacher plusieurs projets (tome 1, tome 2, une nouvelle).
- Ranger une carte dans l'univers (personnage, lieu, groupe, objet, règle du monde, événement) : elle apparaît
  dans tous les projets de l'univers, sur leur canevas et dans leur Bible, et se modifie depuis n'importe lequel.
- Garder ce qui est propre à un tome : l'arc d'Inès dans le tome 2, sa place sur le canevas, ses fils avec les
  cartes du tome.
- Exporter la Bible de l'univers seule (bible de saga).

## Décisions à prendre (auteur), avant tout code

1. **Ce qui est commun et ce qui est propre au tome.** Proposition : commun, le titre, le type, le texte, la
   fiche d'identité, les images ; propre au tome, la position sur le canevas, les fils, le moteur et l'arc du
   personnage (Veut, A besoin de, arc), les questions « à creuser ». À confirmer champ par champ.
2. **Où vit l'univers.** Proposition : un dossier frère des projets, de même format qu'un projet MondoWrite
   (`cosmos.json` avec `kind: "univers"`, `cartes/`, `medias/`), que chaque projet cite par un identifiant dans
   son `cosmos.json` (`universe: { id, path }`). Sur mobile, dans l'espace privé de l'app comme les projets ;
   par iCloud entre Mac, iPad et iPhone.
3. **Un projet ouvert sans son univers** (dossier absent, pas encore synchronisé) : les cartes communes
   s'affichent depuis une copie de lecture gardée dans le projet (`univers/`), avec un bandeau ; rien n'est
   perdu, rien n'est écrit dans l'univers tant qu'il manque.

## Principes respectés

- **Un seul contenu** : une carte commune n'existe qu'une fois, dans l'univers. Le projet ne garde que ce qui
  lui est propre, sous le même identifiant.
- **Rien d'obligatoire** : un projet sans univers ne change pas ; rattacher un projet à un univers ne déplace
  rien d'office (l'auteur choisit les cartes à partager, une par une ou par rubrique).
- **L'auteur possède ses textes** : l'univers est un dossier lisible comme un projet.

## Points durs (à étudier avant de chiffrer)

- Conflits : deux projets ouverts sur deux appareils modifient la même carte commune. On réutilise la règle
  actuelle (`conflicts.ts` : rien n'est écrasé, une copie à côté, l'auteur choisit), avec un verrou par
  appareil sur l'univers comme sur un projet.
- Mentions `@` : une mention d'une carte commune vit dans le texte d'un tome ; renommer la carte depuis le
  tome 2 doit mettre à jour le texte du tome 1, qui n'est pas ouvert. Proposition : la mention se met à jour à
  la prochaine ouverture du tome 1 (le titre est relu par l'identifiant), jamais d'écriture dans un projet fermé.
- Corbeille : supprimer une carte commune depuis un tome la retire-t-elle de l'univers ou seulement de ce tome ?
  Proposition : « Retirer de ce tome » par défaut, « Supprimer de l'univers » en second choix, avec la liste des
  projets concernés.
- Recherche, statistiques, IA : elles lisent le projet ouvert plus les cartes communes, jamais les autres tomes
  (sauf une future option « Dans toute la saga »).

## Lots (à détailler après l'étude)

- [ ] Étude : maquette des choix ci-dessus, format exact, comportement hors ligne et iCloud ; validée par
      l'auteur
- [ ] Lot 1 : créer un univers, y rattacher un projet, partager une carte, l'afficher et la modifier depuis deux
      projets
- [ ] Lot 2 : champs propres au tome, corbeille, conflits, copie de lecture
- [ ] Lot 3 : Bible de l'univers et son export, « Organiser » qui range les cartes communes à part, import d'un
      tome existant dans un univers (fusion des personnages en double, proposée et jamais automatique)
