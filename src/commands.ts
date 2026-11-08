// Commandes venues d'ailleurs que le composant qui les sert (barre des menus du Mac, raccourci global) :
// ouvrir les réglages, la recherche, le menu Exporter. Ces fenêtres gardent leur état ouvert/fermé chez elles ;
// la commande leur demande seulement de s'ouvrir. Toujours « ouvrir », jamais « basculer » : si le menu et le
// raccourci clavier arrivaient tous les deux, la fenêtre resterait ouverte.

import { useEffect, useRef } from "react";
import { isAppleKeyboard } from "./platform";

export type AppCommand = "settings" | "search" | "export" | "review" | "new-card" | "new-frame" | "toggle-scenes" | "toggle-side" | "merge-next" | "omit-scene";

const EVENT = "mondowrite:command";

export function sendCommand(command: AppCommand) {
  window.dispatchEvent(new CustomEvent<AppCommand>(EVENT, { detail: command }));
}

/** Le composant qui sert la commande l'écoute ici. */
export function useCommand(command: AppCommand, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<AppCommand>).detail === command) ref.current();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [command]);
}

/**
 * Rejoue un raccourci clavier depuis le menu : il suit alors exactement le chemin du clavier (la vue en cours
 * peut le servir à sa façon, comme Rechercher et remplacer dans le Manuscrit, qui part de la scène ouverte).
 */
export function replayShortcut(key: string, code: string, shift = false, alt = false) {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  // Cmd sur un clavier d'Apple, Ctrl ailleurs (palette de commandes sous Windows et Linux) : les éditeurs de texte
  // lisent « Mod » selon le système, Cmd n'y vaudrait rien.
  const apple = isAppleKeyboard();
  target.dispatchEvent(new KeyboardEvent("keydown", { key, code, metaKey: apple, ctrlKey: !apple, shiftKey: shift, altKey: alt, bubbles: true, cancelable: true }));
}
