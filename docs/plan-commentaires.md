# Plan : commentaires ancrés (préalable C)

Troisième des chantiers préalables à l'import Scrivener (`docs/plan-import-scrivener.md`, « Préalables »),
après le point de vue et les versions d'une scène. Version visée : avec eux dans la 1.13.0 (à décider à la
publication).

L'auteur relit, ou un lecteur bêta lui fait un retour : il veut attacher une remarque à un passage précis, la
retrouver plus tard et la résoudre. « À reprendre » marque un passage sans dire pourquoi ; le commentaire dit
pourquoi. C'est aussi ce que deviendront les commentaires et annotations d'un projet Scrivener.

## Décisions (prises par Claude le 2 novembre 2026, sur « Fais le C »)

1. **Roman et scénario dans la même version.** Roman : un passage choisi du texte. Scénario : un élément entier
   (action ou réplique) ; une note au milieu d'une ligne Fountain gênerait la relecture par les autres logiciels,
   et la didascalie et le nom du personnage ne doivent pas porter de note (leur détection en dépend).
2. **Le texte des commentaires est à part**, dans `commentaires/<id de la carte Scène>.md`, un Markdown lisible
   hors de l'app ; le texte de la scène ne porte que la marque. Comme le manuscrit, hors de l'historique
   d'annulation (sinon Annuler sur le canevas effacerait un commentaire, ou laisserait une marque sans
   commentaire).
3. **En marge = un onglet « Commentaires » de la colonne de droite**, à côté de « Scène » et « Vérifier », là
   où s'affiche déjà « Vérifier » (sur téléphone aussi, à vérifier sur appareil). Des bulles alignées sur le texte
   demanderaient de suivre la mise en pages du livre : plus tard, si l'usage le demande.
4. **Raccourci Cmd/Ctrl + Alt + M**, celui de Word et de Google Docs.
5. **Jamais exportés** dans le livre, le PDF du scénario ni la Bible. Des commentaires Word dans le .docx : plus
   tard (lot 3).

## Format de projet

```
commentaires/<id de la carte>.md
```

```markdown
<!-- MondoWrite : commentaires de la scène, un par titre « ## identifiant · date ». -->

## abc123def456 · 2026-11-02T10:12:00+01:00
> six heures
Trop tôt pour lui ?

## zzz999yyy888 · 2026-11-02T10:15:00+01:00 · resolved
> Ethan
Déjà résolu.
```

- Marque dans le manuscrit d'un roman : `<span data-comment="<id>">…</span>`, gardée telle quelle dans le
  Markdown de `manuscrit/` (comme la marque de l'IA). Plusieurs commentaires peuvent se chevaucher.
- Scénario : note `[[cosmos:comment:<id>]]` en fin de ligne de l'action ou de la réplique, après une éventuelle
  `[[ia]]`. Les autres logiciels n'impriment pas les notes Fountain.
- `commentaires/` est dans `TEXT_DIRS` : lu à l'ouverture (les commentaires sont surlignés et comptés dans
  « À faire » sans attendre), emporté par le .zip et la suppression du projet.
- Versions précédentes de l'app : elles ne lisent pas `commentaires/` et ne l'effacent pas. Une version d'avant la
  1.13.0 qui réenregistre une scène perd la marque `<span data-comment>` (turndown ne garde que le texte) : le
  commentaire reste, montré « Ce passage n'est plus dans le texte » avec sa citation. Dans un scénario, elle garde la
  note (texte de la ligne), et l'affiche.

## Lot 1 : roman

- [x] `src/comments.ts` (pur) : fichier écrit et relu (en-tête protégé si le texte lui ressemble), identifiants
      sûrs, marques d'un HTML (`commentIdsIn`, `removeCommentMark`), ordre du texte, ouverts pour « À faire »
- [x] Marque TipTap `comment` (`commentMark.ts`) dans les éditeurs du texte des scènes (`prose`) : manuscrit et
      carte Scène agrandie (elle y est gardée ; on commente dans le Manuscrit)
- [x] Store : `comments`, `addComment`, `editComment`, `resolveComment`, `deleteComment` (marque comprise) et
      `undoDeleteComment` (la marque revient si le texte n'a pas changé depuis), `commentFocus` (affichage)
- [x] « Commenter » dans la barre de mise en forme, Cmd/Ctrl + Alt + M, menu Édition du Mac
- [x] Onglet « Commentaires · N » : citation (mène au passage), texte modifiable, date, Résoudre / Rouvrir,
      « Résolus · N » replié, Supprimer dans ⋯ (annulable) ; un commentaire laissé vide disparaît
- [x] Surlignage des seuls commentaires ouverts (feuille de style tirée des identifiants), plus fort pour celui
      qu'on regarde ; un clic dans un passage commenté ouvre son commentaire
- [x] « À faire » : groupe « Commentaires », qui mène à la scène et sélectionne le passage
- [x] L'éditeur du livre enregistre aussi une marque posée sans frappe (`changedRange` lit les étapes de marque)

## Lot 2 : scénario

- [x] `comments` d'un élément, note lue par `parse`, écrite par `serialize`, attribut de l'éditeur (pas repris par
      Entrée), conversion aller-retour
- [x] « Commenter cet élément » dans le ⋯ de la barre du Scénario et Cmd/Ctrl + Alt + M ; refus en clair hors d'une
      action ou d'une réplique, ou dans une scène sans carte
- [x] Même onglet, même « À faire » ; supprimer retire la note, Annuler la remet si le scénario n'a pas changé

## Lot 3 : pour plus tard

- Commentaires dans l'export Word (vrais commentaires .docx), et dans un PDF de relecture
- Commenter depuis la carte Scène agrandie (aujourd'hui la marque y est gardée et visible, sans volet)
- Bulles dans la marge alignées sur le texte, sur grand écran
- Nom de l'auteur du commentaire (lecteurs bêta), si l'app devient collaborative
- Import Scrivener : commentaires (`scrivcmt://`) et annotations en ligne → commentaires ancrés

## Tests

- **Unitaires** (`comments.test.ts`) : fichier aller-retour, en-tête protégé, doublons et identifiants piégés,
  marque gardée par le Markdown et le nettoyage, ordre, surlignage, marque sans frappe enregistrée, « À faire »,
  store (ajouter, écrire, résoudre, supprimer, annuler, refus), enregistrement et relecture ; scénario : notes lues
  et réécrites à l'identique (avec `[[ia]]`), éditeur aller-retour, suppression et annulation dans le store
- **Bout en bout** : roman (Ctrl + Alt + M, champ, enregistré, « À faire », résoudre, supprimer et annuler,
  rechargement, clic dans le passage) ; scénario (élément commenté, note dans le Fountain, rechargement)
- **À la main** : app Mac (menu Édition, ⌥⌘M), iPad (barre de mise en forme au doigt, volet), Windows

## Reste

- [ ] À la main : Mac, iPad, Windows
- [ ] Captures du guide (onglet Commentaires)
