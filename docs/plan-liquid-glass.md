# Plan : refonte Liquid Glass (maquettes de novembre 2026)

Source : maquettes macOS, iPad et iPhone (9 écrans, clair et sombre), contenus tirés du projet d'exemple
« Le Petit Chaperon rouge ». Choix : **on reste sur Tauri** (même code, Windows et Linux conservés) ; le verre est
rendu en CSS (`backdrop-filter`), sans la réfraction du vrai Liquid Glass. Une version Swift native reste un projet à part.

## Principes (à respecter à chaque écran)
- Aucune couleur en dur : `src/styles/glass.css` dérive tout des jetons de palette (huit palettes, deux thèmes).
- Verre seulement sur les surfaces flottantes (barre latérale, inspecteur, capsules, barre d'onglets iPhone), jamais sur le texte courant (`.glass-strong`).
- Réduire la transparence : fonds pleins (déjà géré). Contraste AA vérifié (`palettes-contrast.test.ts`).
- Rien ne dépend du survol, cibles tactiles ≥ 44 px, trois chemins par action (règles de CLAUDE.md).

## Étapes
1. **Jetons et classes** (`glass.css` : `.glass`, `.glass-pill`, `.glass-strong`) : fait, sans effet visible tant qu'on ne les pose pas.
2. **Coque macOS** : barre latérale flottante (Canevas · Plan · Bible · Manuscrit), barre d'outils en capsules, inspecteur à droite ; barre de titre en superposition (`titleBarStyle: Overlay`, feux tricolores à leur place).
3. **Écrans 1 à 3** : accueil (bibliothèque en grille, reprise mise en avant), canevas (outils en capsule flottante, zoom), Bible (trois colonnes).
4. **Écrans 4 à 9** : Plan, Manuscrit, Scénario, Assistant IA, Export, Réglages.
5. **iPad** : mêmes surfaces, barre latérale repliable.
6. **iPhone** : barre d'onglets flottante en verre, boutons de coin, feuilles à détentes ; retirer le réglage d'apparence propre à l'app si l'on suit le système.
7. **Vérification** : captures Playwright clair et sombre (8 palettes), puis essai sur appareil (zones de sécurité, clavier).

## Décisions à prendre avec l'auteur
- Variante a (clair) ou b (sombre, structure différente) pour chaque écran : les maquettes en proposent deux.
- Sur Windows et Linux : verre identique ou repli sans flou.
