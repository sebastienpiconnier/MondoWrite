// Ruban agrandi (#173) : la tête de lecture suit le texte qu'on fait défiler (Manuscrit, Scénario). La vue donne
// de quoi lire la place de ses scènes à l'écran ; le calcul (playheadAt, frise.ts) est pur et testé.

import { useEffect, useRef, useState } from "react";
import { playheadAt, type SceneTop } from "../frise";

export interface TextPlaces {
  /** Ce qui défile (la ligne de lecture se pose dans son premier quart). */
  box: HTMLElement;
  /** Haut de chaque scène, dans l'ordre du texte. */
  tops: SceneTop[];
  /** Bas du texte. */
  end: number;
}

export type Playhead = { id: string; frac: number } | null;

/** Ligne de lecture : un peu sous le haut de ce qui défile, comme la scène « en cours » du volet. */
const lineOf = (box: DOMRect) => box.top + Math.min(160, Math.max(48, box.height * 0.25));

/**
 * Scène et part de la scène sous la ligne de lecture, relues à chaque défilement (une fois par image). `key` change
 * quand le texte change (hauteurs différentes). Rien n'est calculé tant que `enabled` est faux.
 */
export function useTextPlayhead(enabled: boolean, read: () => TextPlaces | null, key: unknown): Playhead {
  const [spot, setSpot] = useState<Playhead>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    if (!enabled) {
      setSpot(null);
      return;
    }
    let frame = 0;
    const run = () => {
      frame = 0;
      const places = readRef.current();
      if (!places) return;
      const next = playheadAt(lineOf(places.box.getBoundingClientRect()), places.tops, places.end);
      setSpot((prev) => (prev && next && prev.id === next.id && Math.abs(prev.frac - next.frac) < 0.002 ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    schedule();
    // En capture : le défilement d'un élément ne remonte pas jusqu'à la fenêtre.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, key]);
  return spot;
}
