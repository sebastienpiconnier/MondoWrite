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

## Décisions prises (13 novembre 2026)
- **Variante A** (clair) pour la structure de tous les écrans ; le sombre en dérive avec les jetons sombres de `glass.css`.
- **Même interface partout.** Windows : verre actif, barre de titre du système. Linux : même forme (arrondis, liseré, ombre), fond plein et sans flou par défaut (WebKitGTK rend mal `backdrop-filter`). Mac : verre, feux tricolores dans la barre.
- **Réglage « Effets de transparence »** (Réglages › Général, appareil, jamais le projet) : Automatique (actif sauf sous Linux, `isLinuxDesktop`, défaut seulement), Oui, Non. Il pose `data-glass="on|off"` sur `<html>` (`glassShown`, settings.ts) ; `glass.css` lit `off` (fond plein, sans flou). « Réduire la transparence » du système l'emporte toujours.
- **Pas de `windowEffects`** (Mica, Acrylic, vibrance) sur aucune plateforme : il exige une fenêtre transparente et le Mac App Store le refuse.
- Police : SF Pro n'est pas embarquée, IBM Plex Sans reste le repli ; les proportions des maquettes bougent légèrement.

## Avancement
- Étape 1 : fait. Étape 2 : fait (coque) : colonne de verre sur toute la hauteur (retour, nom du projet, vues avec icône), plus de barre pleine largeur, capsules d'outils flottantes, canevas plein cadre sous le verre (glass.css, `.shell-side`, `data-view` sur `.app`). Reste, pour ressembler aux maquettes : types de cartes avec comptes et « À faire » dans la colonne, zoom en capsule, inspecteur à droite, puis écrans 1 (accueil en grille) et 3 à 9.
