// Mode focus, à la manière d'iA Writer (1.11.0), commun au Manuscrit et au Scénario :
// - une barre en haut (mise en valeur, largeur de colonne, machine à écrire, sortie) qui s'efface quelques secondes
//   après l'entrée et dès qu'on tape, et ne revient que quand la souris va en haut de la fenêtre ou qu'on touche le
//   haut de l'écran ;
// - un compteur discret en bas, qui s'efface pendant la frappe et revient à la pause ;
// - Cmd/Ctrl+Maj+E fait défiler la mise en valeur ;
// - plein écran de la fenêtre à l'entrée si le réglage le demande (ordinateur), quitté à la sortie.
// Rien n'est enregistré dans le projet : ce sont des réglages de l'appareil et des états d'affichage.

import { useEffect, useRef, useState, type RefObject } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { isAppleKeyboard, isMobileOS, isTauri } from "../platform";
import { nextColumn, nextHighlight, sessionDelta } from "../focusText";
import { sessionWords } from "../stats";

/** Pause après la dernière touche avant que le compteur revienne. */
export const TYPING_PAUSE_MS = 2000;

/** Délai après lequel la barre du haut s'efface d'elle-même (entrée dans le mode focus, souris partie du haut). */
export const BAR_IDLE_MS = 3000;

/** Hauteur de la bande du haut de la fenêtre où la souris (ou le doigt) fait revenir la barre. */
export const BAR_REVEAL_PX = 72;

/** La souris ou le doigt est-il dans la bande du haut qui fait revenir la barre ? (pur) */
/** Au doigt, la bande s'allonge de la zone de sécurité du haut (encoche, île de l'iPhone). */
const TOUCH_EXTRA_PX = 56;

export const inRevealZone = (y: number, safeTop = 0) => y <= BAR_REVEAL_PX + safeTop;

/** Classes de l'élément racine de la vue en mode focus : `is-quiet` (barre cachée), `is-typing` (compteur caché),
 *  `is-pointer-off` (pointeur caché pendant la frappe).
 *  La barre s'efface quelques secondes après l'entrée, aussitôt à la frappe, et ne revient que quand la souris va en
 *  haut de la fenêtre (ou qu'on touche le haut de l'écran) ; elle reste tant qu'elle a le focus ou le survol. */
export function useFocusChrome(focusMode: boolean, root: RefObject<HTMLElement | null>): { quiet: boolean; typing: boolean; pointerOff: boolean } {
  const [quiet, setQuiet] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pointerOff, setPointerOff] = useState(false);

  useEffect(() => {
    if (!focusMode) {
      setQuiet(false);
      setTyping(false);
      setPointerOff(false);
      return;
    }
    let timer = 0;
    let idle = 0;
    let last: { x: number; y: number } | null = null;
    const bar = () => root.current?.querySelector(".ms-focus-bar") ?? null;
    // La barre garde sa place tant qu'on s'en sert (focus clavier ou survol) ; sinon elle s'efface au bout du délai.
    const scheduleHide = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(function hide() {
        const b = bar();
        if (b && (b.contains(document.activeElement) || b.matches(":hover"))) {
          idle = window.setTimeout(hide, BAR_IDLE_MS);
          return;
        }
        setQuiet(true);
      }, BAR_IDLE_MS);
    };
    const reveal = () => {
      setQuiet(false);
      scheduleHide();
    };
    setQuiet(false);
    scheduleHide();
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
      window.clearTimeout(idle);
      setQuiet(true);
      setTyping(true);
      setPointerOff(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTyping(false), TYPING_PAUSE_MS);
    };
    // La souris qui bouge vraiment (pas le petit mouvement que certains systèmes envoient au défilement) rend le
    // pointeur ; elle ne ramène la barre qu'en haut de la fenêtre.
    const onMove = (e: MouseEvent) => {
      if (last && Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 4) {
        setPointerOff(false);
        if (inRevealZone(e.clientY)) reveal();
      }
      last = { x: e.clientX, y: e.clientY };
    };
    // La souris sortie de la fenêtre par le haut (vers la barre des menus) ramène aussi la barre.
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) reveal();
    };
    // Au doigt : toucher le haut de l'écran (plus haut d'une encoche, la zone de sécurité de l'iPhone).
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && inRevealZone(e.clientY, TOUCH_EXTRA_PX)) reveal();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(idle);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseout", onLeave);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [focusMode, root]);

  useFullscreen(focusMode);
  return { quiet, typing, pointerOff };
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

/** Barre du mode focus : mise en valeur et largeur de colonne (font défiler leurs choix), machine à écrire, sortie. */
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
        {/* Largeur de la colonne (Manuscrit et Scénario) ; sur téléphone, le texte prend toute la largeur. */}
        <button type="button" className="focus-column" onClick={() => setWriting({ ...writing, column: nextColumn(writing.column) })}>
          {fmt(t.focus.columnButton, { width: t.focus.columns[writing.column] })}
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
  // Objectif de séance (#20) : le signal reste discret, dans le même compteur.
  const goal = useCosmos((x) => x.goals.session);
  const sessionStart = useCosmos((x) => x.sessionStart);
  const reached = !!goal && sessionWords(sessionStart, words) >= goal;
  return (
    <p className="ms-focus-count" aria-hidden="true">
      {text}
      {" · "}
      {fmt(t.focus.session, { n: sessionDelta(start.current, words, num) })}
      {reached ? ` · ✓ ${t.stats.sessionReached}` : ""}
    </p>
  );
}


/** Bouton « Mode focus » des barres d'écriture (#54) : une icône seule (deux coins qui s'écartent), le nom et le
 *  raccourci dans l'infobulle et pour le lecteur d'écran. Il reste dans la barre : c'est le geste d'écriture. */
export function FocusButton({ className, title, onClick }: { className: string; title: string; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" className={`${className} focus-button`} aria-label={t.focus.enter} title={title} aria-keyshortcuts="Control+Shift+F Meta+Shift+F" onPointerDown={(e) => e.preventDefault()} onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
    </button>
  );
}
