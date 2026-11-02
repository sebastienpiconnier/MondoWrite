# Plan : notes de bas de page (préalable D)

Dernier des chantiers préalables à l'import Scrivener (`docs/plan-import-scrivener.md`, « Préalables »), après le
point de vue, les versions d'une scène et les commentaires. Version : 1.13.0, avec eux.

Un roman historique, un récit qui cite ses sources, un essai : l'auteur veut une note numérotée au fil du texte,
qui sorte en vraie note dans Word et dans l'EPUB. C'est aussi ce que deviendront les notes de bas de page d'un
projet Scrivener.

## Décisions (prises par Claude le 2 novembre 2026, sur « Ok D »)

1. **Roman seulement.** Un scénario n'a pas de notes de bas de page (le format standard n'en a pas) ; les
   commentaires y suffisent.
2. **Une note est un appel dans le texte, son texte dans une petite fenêtre** posée sous l'appel (cliquer
   l'appel, ou y arriver aux flèches). Le numéro n'est jamais écrit : il vient de la place de l'appel, à l'écran
   (compteur CSS) comme à l'export. Ajouter ou retirer une note renumérote tout seul.
3. **Format sur disque : la syntaxe Markdown connue** (Pandoc, Obsidian, GitHub, iA Writer) dans le fichier de la
   scène : `[^1]` à l'endroit de l'appel, `[^1]: texte` en fin de fichier. Numéros locaux à la scène.
4. **Raccourci Cmd/Ctrl + Alt + F**, celui de Word sur Mac ; bouton « Note » dans la barre de mise en forme ; menu
   Format du Mac.
5. **Numérotation du livre continue** (1, 2, 3… d'un chapitre à l'autre), comme Word par défaut.
6. **Exports** : Word, de vraies notes de bas de page (`footnotes.xml`) ; EPUB, appel lié à sa note en fin de
   chapitre (`epub:type="noteref"` et `footnote`, que les liseuses ouvrent en fenêtre) ; Markdown, `[^n]` ; PDF du
   manuscrit et livre broché, « [n] » dans le texte et les notes sous « Notes » à la fin du chapitre (les polices
   embarquées n'ont pas tous les chiffres en exposant ; de vraies notes en bas de page du livre broché : plus
   tard). Le texte d'une note est du texte simple (une ligne).

## Ce qui est fait

- [x] `src/footnotes.ts` (pur) : `[^n]` et définitions écrits (`takeFootnotes`, `putFootnotes`) et relus
      (`readFootnotes`), note nettoyée et bornée (`cleanNote`, 2 000 caractères)
- [x] `htmlToMarkdown` et `markdownToHtml` passent par eux ; `sanitizeHtml` ne garde d'un `<sup>` que
      `data-footnote` (vide, texte borné) ; tout autre `<sup>` perd sa balise
- [x] Nœud TipTap `footnote` (atome en ligne) dans les éditeurs `prose` (manuscrit, carte Scène agrandie),
      commande `insertFootnote`, Cmd/Ctrl + Alt + F
- [x] Fenêtre de la note (`FootnotePopover`) : numéro, texte, Entrée ou Échap reviennent au texte après l'appel, une
      note vide disparaît, « Supprimer la note » ; le champ ne prend le focus qu'à la pose ou au clic
- [x] Barre de mise en forme : bouton « Note » ; cachée quand un appel est choisi (sa fenêtre suffit)
- [x] Exports : `Run.footnote` (doc.ts), `numberFootnotes`, `endnotes` ; Markdown, Word, EPUB, PDF, livre broché
- [x] Textes fr et en, raccourci dans la fenêtre d'aide, menu Format du Mac, guide

## Versions précédentes de l'app

Une version d'avant la 1.13.0 lit `[^1]` comme du texte et la définition comme un paragraphe ; en réenregistrant
la scène, elle peut les échapper (`\[^1\]`). Le texte de la note n'est pas perdu, mais il faudra le remettre en note.

## Pour plus tard

- Vraies notes en bas de page dans le livre broché et le PDF du manuscrit (chiffres en exposant dessinés)
- Mise en forme dans une note (italique d'un titre d'ouvrage)
- Import Scrivener : notes de bas de page en ligne et de l'inspecteur → notes
- Numérotation par chapitre dans l'EPUB, si les auteurs le demandent

## Tests

- **Unitaires** (`footnotes.test.ts`) : aller-retour exact sur disque (guillemets, esperluettes), appel sans
  définition, `<sup>` piégé, numérotation continue, Markdown, Word (`footnotes.xml`, types, relations), EPUB, PDF
- **Bout en bout** : poser une note au clavier, l'écrire, Entrée, enregistrée en `[^1]`, rechargement, clic qui
  la rouvre, suppression enregistrée
- **À la main** : ouvrir le .docx dans Word et Pages, l'EPUB dans Apple Livres ; Mac (⌥⌘F), iPad (bouton au
  doigt), Windows (Ctrl + Alt + F avec un clavier AZERTY)

## Reste

- [ ] Les vérifications à la main ci-dessus
- [ ] Capture du guide (fenêtre d'une note)
