# Plan : l'iPhone en Carnet (branche `iphone-carnet`)

Demande du 27 octobre 2026 : sur iPhone, simplifier. Le téléphone sert à **écrire**, **consulter** et **capturer** ; ce qu'on capture arrive dans une boîte de réception, rangée plus tard sur le canevas depuis l'iPad ou l'ordinateur.

## Principes

- On détecte la **largeur** (720 px ou moins, seuil de `phone.css`), jamais l'iPhone : un iPhone pliant ouvert, un iPad en Split View étroit suivent la place disponible (`usePhone.ts`).
- Rien n'est recopié : une note du Carnet est une carte ordinaire, aussitôt dans la Bible et sur le canevas des autres appareils.
- Format : une seule ligne de frontmatter facultative, `inbox: true`, écrite seulement quand elle est vraie. La 1.3.x et la 1.4.0 la gardent (`keep.front`) ; elles montrent la carte sans la boîte.

## Fait

- [x] `inbox.ts` (pur) : `capturedCard` (première ligne = titre, la suite = texte, une adresse seule = Lien), `inboxCards`, `fileCards`, `CAPTURE_TYPES` (Idée, Question, Personnage, Lieu, Objet, Thème ; pas de Scène, qui s'écrit dans le Manuscrit ou le Scénario).
- [x] Format : `CardData.inbox`, `markdown.ts` (lecture, écriture, `KNOWN_FRONT`).
- [x] Store : `captureCard`, `fileInbox` (annulables) ; une carte déplacée à la main sur le canevas (`dragging: false`) ou reliée (`onConnect`, `linkCards`) quitte la boîte.
- [x] Vue `carnet` : sur téléphone, onglets Manuscrit, Bible, Carnet ; le canevas et le Plan cèdent la place au Carnet (`shownView`) ; ailleurs, `carnet` affiche le canevas. « Voir sur le canevas » ouvre la fiche dans la Bible (`revealCard`).
- [x] Masqués sur téléphone : menu Exporter, « Choisir et ranger » de la Bible, « Voir sur le canevas » (Statistiques l'étaient déjà).
- [x] `Carnet.tsx` : pastilles de type, champ, « Garder » (Cmd/Ctrl + Entrée), liste « À ranger » (ouvrir la fiche, photo, rangé, corbeille).
- [x] Canevas (iPad, ordinateur) : `InboxMenu`, bouton « À ranger · N » dans la rangée d'outils (seulement s'il y en a), liste (montrer, rangé, tout est rangé) ; pointillé d'accent sur les cartes à ranger (`is-inbox`).
- [x] Tests `carnet.test.ts`, guide (fr, en), `CLAUDE.md`.

## Plus tard

- Capturer depuis la feuille de partage d'iOS (texte, photo, page web) vers la boîte : extension de partage, plus lourde.
- Une capture vocale (dictée du clavier suffit pour l'instant).
- Essai sur un vrai iPhone par TestFlight : clavier, zones de sécurité, hauteur du champ.
