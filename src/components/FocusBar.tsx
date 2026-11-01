// Mode focus, à la manière d'iA Writer (1.11.0), commun au Manuscrit et au Scénario :
// - une barre en haut (mise en valeur, machine à écrire, sortie) qui s'efface dès qu'on tape et revient quand la
//   souris bouge ou qu'on touche l'écran ;
// - un compteur discret en bas, qui s'efface pendant la frappe et revient à la pause ;
// - Cmd/Ctrl+Maj+E fait défiler la mise en valeur ;
// - plein écran de la fenêtre à l'entrée si le réglage le demande (ordinateur), quitté à la sortie.
// Rien n'est enregistré dans le projet : ce sont des réglages de l'appareil et des états d'affichage.

import { useEffect, useRef, useState, type RefObject } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { isAppleKeyboard, isMobileOS, isTauri } from "../platform";
import { nextHighlight, sessionDelta } from "../focusText";

/** Pause après la dernière touche avant que le compteur revienne. */
export const TYPING_PAUSE_MS = 2000;

/** Classes de l'élément racine de la vue en mode focus : `is-quiet` (barre et pointeur cachés), `is-typing` (compteur caché). */
export function useFocusChrome(focusMode: boolean, root: RefObject<HTMLElement | null>): { quiet: boolean; typing: boolean } {
  const [quiet, setQuiet] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!focusMode) {
      setQuiet(false);
      setTyping(false);
      return;
    }
    let timer = 0;
    let last: { x: number; y: number } | null = null;
    const onKey = (e: KeyboardEvent) => {
      // Mise en valeur suivante : Cmd/Ctrl+Maj+E.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.code === "KeyE" || e.key.toLowerCase() === "e")) {
        e.preventDefault();
        const s = useSettings.getState();
        s.setWriting({ ...s.writing, highlight: nextHighlight(s.writing.highlight) });
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest(".ProseMirror") || !root.current?.contains(target)) return;
      if (e.key.length !== 1 && e.key !== "Enter" && e.key !== "Backspace" && e.key !== "Delete") return;
      setQuiet(true);
      setTyping(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTyping(false), TYPING_PAUSE_MS);
    };
    // La souris qui bouge vraiment (pas le petit mouvement que certains systèmes envoient au défilement) ramène la barre.
    const onMove = (e: MouseEvent) => {
      if (last && Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 4) setQuiet(false);
      last = { x: e.clientX, y: e.clientY };
    };
    const onPointer = () => setQuiet(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [focusMode, root]);

  useFullscreen(focusMode);
  return { quiet, typing };
}

/** Le plein écran est-il proposé ici ? App de bureau, ou navigateur qui le permet ; jamais sur mobile. */
export const canFullscreen = () => !isMobileOS() && (isTauri() || (typeof document !== "undefined" && !!document.fullscreenEnabled));

/** Plein écran à l'entrée du mode focus (réglage `writing.fullscreen`), quitté à la sortie s'il venait de nous. */
function useFullscreen(focusMode: boolean) {
  const wanted = useSettings((s) => s.writing.fullscreen);
  useEffect(() => {
    if (!focusMode || !wanted || !canFullscreen()) return;
    let entered = false;
    let cancelled = false;
    void (async () => {
      try {
        if (isTauri()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          if (cancelled || (await win.isFullscreen())) return;
          await win.setFullscreen(true);
          entered = true;
        } else if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          entered = true;
        }
      } catch {
        // Refusé (fenêtre, navigateur) : le mode focus reste dans la fenêtre.
      }
    })();
    return () => {
      cancelled = true;
      if (!entered) return;
      void (async () => {
        try {
          if (isTauri()) {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().setFullscreen(false);
          } else if (document.fullscreenElement) {
            await document.exitFullscreen();
          }
        } catch {
          /* déjà sorti */
        }
      })();
    };
  }, [focusMode, wanted]);
}

/** Barre du mode focus : mise en valeur (fait défiler les modes), machine à écrire, sortie. */
export function FocusBar() {
  const t = useT();
  const writing = useSettings((s) => s.writing);
  const setWriting = useSettings((s) => s.setWriting);
  const setFocusMode = useCosmos((s) => s.setFocusMode);
  const mod = isAppleKeyboard() ? "Cmd" : "Ctrl";
  return (
    <div className="ms-focus-bar" role="toolbar" aria-label={t.focus.aria}>
      <div className="focus-options">
        <button
          type="button"
          title={fmt(t.focus.highlightKey, { mod })}
          onClick={() => setWriting({ ...writing, highlight: nextHighlight(writing.highlight) })}
        >
          {fmt(t.focus.highlightButton, { mode: t.focus.highlights[writing.highlight] })}
        </button>
        <button type="button" aria-pressed={writing.typewriter} onClick={() => setWriting({ ...writing, typewriter: !writing.typewriter })}>
          {t.focus.typewriter}
        </button>
      </div>
      <button type="button" className="focus-exit" aria-label={t.focus.exit} onClick={() => setFocusMode(false)}>
        <span className="focus-exit-text">{t.focus.exit}</span>
        <svg className="focus-exit-x" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Compteur discret du mode focus, en bas de l'écran : ce que la vue lui donne, puis les mots de la séance. */
export function FocusCounter({ text, words, num }: { text: string; words: number; num: (n: number) => string }) {
  const t = useT();
  const start = useRef(words);
  return (
    <p className="ms-focus-count" aria-hidden="true">
      {text}
      {" · "}
      {fmt(t.focus.session, { n: sessionDelta(start.current, words, num) })}
    </p>
  );
}

