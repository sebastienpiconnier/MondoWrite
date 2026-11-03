# Plan : synonymes, sans quitter l'app

Demande de l'auteur du 3 novembre 2026 : un dictionnaire des synonymes, à condition de ne jamais sortir de
MondoWrite. Version visée : 1.15.x ou 1.16.0 (petit lot).

## Ce que l'auteur doit pouvoir faire

Sélectionner un mot (ou poser le curseur dedans) dans le manuscrit, une scène, une carte ou la Bible, demander
« Synonymes » et remplacer le mot par l'un d'eux en un geste. Hors ligne, sans compte, sans appel réseau.

## Principes respectés

- **Trois chemins** : barre de mise en forme (bouton « Synonymes »), clic droit / appui long sur le mot,
  raccourci (Cmd/Ctrl + Alt + S, à vérifier qu'il est libre).
- **L'auteur choisit** : rien n'est remplacé sans son clic. C'est un dictionnaire, pas une IA.
- **Discret** : une petite fenêtre sous le mot, fermée par Échap ; le mot remplacé garde sa casse (capitale
  initiale, tout en capitales) avec la règle de `replace.ts`.

## Données

| Langue | Source envisagée | Licence | Taille brute |
|---|---|---|---|
| Français | Thésaurus de LibreOffice / Grammalecte (`thes_fr`, format MyThes) | LGPL 2.1, à confirmer dans son fichier de copyright | environ 5 Mo |
| Anglais | WordNet 3.1 (Princeton) | Licence WordNet, permissive (type BSD) | environ 10 Mo pour les synsets utiles |

**Décision à prendre (auteur)** : la règle du projet (CLAUDE.md, « Licences ») n'admet que MIT, BSD, ISC,
Apache-2.0, MPL-2.0, OFL et domaine public. La LGPL n'y est pas. Pour un fichier de données livré à part et
remplaçable, la LGPL ne pose en pratique pas de problème de boutique d'applications, mais c'est une exception à
la règle. Trois options :

1. Accepter la LGPL pour ce seul fichier de données (dans son propre fichier, avec sa licence, dans
   `THIRD-PARTY-NOTICES.md`), et noter l'exception dans CLAUDE.md.
2. Le télécharger à la demande depuis mondowrite.app au premier usage (l'app ne l'embarque pas), comme les
   grands exemples ; il reste ensuite hors ligne.
3. Chercher un thésaurus français sous licence permissive (WOLF, le WordNet libre du français, est sous
   CeCILL-C, à évaluer ; qualité moindre pour l'usage d'un romancier).

Proposition : option 2 (pas d'alourdissement de l'installeur, licence tenue à l'écart), avec l'option 1 en repli
si le téléchargement gêne.

## Lot 1

- [ ] Script `scripts/thesaurus/build.mjs` : MyThes (`.dat`) et WordNet vers un format compact (une entrée par
      lemme : sens, puis synonymes), compressé ; tests sur quelques mots (« beau », « marcher », « run »)
- [ ] `src/thesaurus.ts` (pur) : lemme d'un mot tapé (pluriel, féminin, verbe conjugué : au moins les cas
      simples ; sinon on cherche la forme telle quelle), sens et synonymes, casse du remplaçant
- [ ] Chargement à la demande, une fois par session, dans la langue du texte (réglage « Langue du texte » si
      elle diffère de l'interface ; par défaut, celle de l'interface)
- [ ] `SynonymsPopover.tsx` : sens groupés, Entrée et flèches, Échap ; « Aucun synonyme connu » sinon
- [ ] Branché dans `FormatBar`, le menu contextuel des éditeurs, le titre des cartes, l'éditeur de scénario
      (actions et répliques seulement)
- [ ] Textes `t.thesaurus.*` (fr, en), raccourci dans `shortcuts.ts`, guide

## Fichiers touchés

`scripts/thesaurus/`, `src/thesaurus.ts` (nouveau), `components/SynonymsPopover.tsx` (nouveau),
`FormatBar.tsx`, `editorKit.ts`, `screenplay/editor/index.ts`, `shortcuts.ts`, `settings.ts` (langue du texte),
`examples.ts` ou équivalent (téléchargement vérifié par SHA-256, option 2), `THIRD-PARTY-NOTICES.md`,
`i18n/fr.ts`, `i18n/en.ts`, guide.
