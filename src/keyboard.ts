// Clavier virtuel (iPad, iPhone, Android) : hauteur masquée, exposée en variable CSS `--keyboard-h` sur <html>.
// Le Manuscrit et la Bible ajoutent cette hauteur à leur marge du bas : on peut faire défiler le texte au-dessus du clavier.
// L'éditeur de scénario garde sa propre variable (`--sp-keyboard`, barre d'éléments posée sur le clavier).

import { isTouch } from "./platform";

/** Hauteur de l'écran cachée par le clavier, en pixels entiers (0 si rien n'est masqué). */
export function hiddenByKeyboard(innerHeight: number, viewportHeight: number, viewportOffsetTop: number): number {
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportOffsetTop));
}

/** Suit `visualViewport` et tient `--keyboard-h` à jour. Renvoie la fonction qui arrête le suivi. */
export function watchKeyboard(): () => void {
  const viewport = typeof window !== "undefined" ? window.visualViewport : null;
  if (!viewport || !isTouch()) return () => {};
  const root = document.documentElement;
  const place = () => {
    const hidden = hiddenByKeyboard(window.innerHeight, viewport.height, viewport.offsetTop);
    root.style.setProperty("--keyboard-h", `${hidden}px`);
    // Clavier ouvert : la barre d'onglets du téléphone s'efface (elle se retrouverait derrière).
    if (hidden > 80) root.dataset.keyboard = "open";
    else delete root.dataset.keyboard;
  };
  place();
  viewport.addEventListener("resize", place);
  viewport.addEventListener("scroll", place);
  return () => {
    viewport.removeEventListener("resize", place);
    viewport.removeEventListener("scroll", place);
    root.style.removeProperty("--keyboard-h");
    delete root.dataset.keyboard;
  };
}
