// Commandes de la lecture à voix haute, dans les barres du Scénario et du Manuscrit : « Écouter », puis Pause,
// Reprendre, Arrêter et le choix des voix (narrateur, personnages, vitesse). Les voix sont celles de l'appareil ;
// leur choix est un réglage de l'appareil (settings.reading), jamais du projet.
// #54 : dans les barres d'écriture, « Écouter » et « Voix de la lecture… » sont dans le menu ⋯ (`useReaderItems`) ;
// la barre ne montre Pause, Reprendre, Arrêter et la flèche des voix que pendant une lecture (`menu`).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "./portalRoot";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { foldName } from "../review/names";
import { voicesFor } from "../reading";
import { canSpeak, pauseReading, previewVoice, resumeReading, stopReading, useReaderState, useSystemVoices } from "./useReader";
import type { MoreItem } from "./MoreMenu";

/** « Voix de la lecture… » du menu ⋯ : la barre de lecture posée dans la même barre ouvre son panneau. */
const voiceRequests = new Set<() => void>();
export function openReaderVoices() {
  voiceRequests.forEach((open) => open());
}

/** Entrées du menu ⋯ d'une barre d'écriture : « Écouter » (sans lecture en cours) et le choix des voix. */
export function useReaderItems(onStart: () => void): MoreItem[] {
  const r = useT().reading;
  const status = useReaderState((s) => s.status);
  if (!canSpeak()) return [];
  const voices: MoreItem = { label: r.voicesMenu, title: r.voicesHint, onSelect: openReaderVoices };
  return status === "idle" ? [{ label: r.listen, title: r.listenHint, onSelect: onStart }, voices] : [voices];
}

interface Props {
  /** Commence la lecture (à partir de la scène ou du passage en cours). */
  onStart: () => void;
  /** Personnages du texte, pour leur donner une voix (scénario seulement). */
  speakers?: string[];
  /** Classe des boutons, celle de la barre où ils sont posés. */
  buttonClass: string;
  /** Scénario : propose aussi de lire les didascalies. */
  screenplay?: boolean;
  /** « Écouter » et les voix sont dans le menu ⋯ : rien n'est affiché tant qu'on ne lit pas (#54). */
  menu?: boolean;
}

export function ReaderBar({ onStart, speakers = [], buttonClass, screenplay = false, menu = false }: Props) {
  const t = useT();
  const r = t.reading;
  const status = useReaderState((s) => s.status);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Sans lecture en cours, en mode menu, le panneau des voix se pose sous ce repère (la place de la barre de lecture).
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hidden = menu && status === "idle";

  useEffect(() => {
    if (!menu) return;
    const request = () => setOpen(true);
    voiceRequests.add(request);
    return () => {
      voiceRequests.delete(request);
    };
  }, [menu]);

  // Le panneau est posé hors de la barre (une barre qui défile de côté, ou une colonne, le coupait ; sur téléphone il
  // sortait de l'écran par la gauche) : sous le bouton, aligné sur son bord droit, toujours dans la fenêtre.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const panel = panelRef.current;
      const btn = toggleRef.current ?? anchorRef.current;
      if (!panel || !btn) return;
      const b = btn.getBoundingClientRect();
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const left = Math.max(8, Math.min(b.right - w, window.innerWidth - w - 8));
      const below = b.bottom + 6;
      const top = below + h > window.innerHeight - 8 && b.top - 6 - h > 8 ? b.top - 6 - h : below;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Quitter la vue arrête la lecture.
  useEffect(() => () => stopReading(), []);

  // Le panneau des voix se ferme par Échap ou un clic à côté.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !toggleRef.current?.contains(target) && !(e.target instanceof Element && e.target.closest(".more-menu"))) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  if (!canSpeak()) return null;
  const prevent = (e: React.PointerEvent) => e.preventDefault();

  if (hidden)
    return (
      <span className="reader is-anchor" ref={anchorRef}>
        {open && createPortal(panel(), portalRoot(anchorRef.current))}
      </span>
    );

  return (
    <span className="reader">
      {status === "idle" ? (
        <button type="button" className={buttonClass} title={r.listenHint} onPointerDown={prevent} onClick={onStart}>
          {r.listen}
        </button>
      ) : (
        <>
          <span className="sr-only" role="status">
            {status === "playing" ? r.playing : r.paused}
          </span>
          <button type="button" className={buttonClass} aria-pressed={status === "paused"} onPointerDown={prevent} onClick={status === "playing" ? pauseReading : resumeReading}>
            {status === "playing" ? r.pause : r.resume}
          </button>
          <button type="button" className={buttonClass} onPointerDown={prevent} onClick={stopReading}>
            {r.stop}
          </button>
        </>
      )}
      {/* Bouton partagé avec « Écouter », comme « Nouvelle carte » : la flèche ouvre le choix des voix. */}
      <button ref={toggleRef} type="button" className={`${buttonClass} reader-voices`} aria-expanded={open} aria-haspopup="dialog" aria-label={r.voices} title={r.voicesHint} onClick={() => setOpen((v) => !v)}>
        <svg className="reader-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(panel(), portalRoot(toggleRef.current))}
    </span>
  );

  function panel() {
    return (
        <div
          ref={panelRef}
          className="reader-panel"
          role="dialog"
          aria-label={r.voicesTitle}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              (toggleRef.current ?? anchorRef.current?.closest("[role=toolbar]")?.querySelector<HTMLElement>(".more-button"))?.focus();
            }
          }}
        >
          <VoiceChoices speakers={speakers} screenplay={screenplay} />
        </div>
    );
  }
}

function VoiceChoices({ speakers, screenplay }: { speakers: string[]; screenplay: boolean }) {
  const t = useT();
  const r = t.reading;
  const lang = useSettings((s) => s.lang);
  const reading = useSettings((s) => s.reading);
  const setReading = useSettings((s) => s.setReading);
  const all = useSystemVoices();
  const voices = voicesFor(all, lang);

  if (all.length === 0) return <p className="reader-empty">{r.noVoice}</p>;

  const select = (label: string, value: string, onChange: (uri: string) => void, sample: string, autofocus = false) => (
    <div className="reader-row">
      <label className="reader-field">
        <span>{label}</span>
        <select value={value} autoFocus={autofocus} onChange={(e) => onChange(e.target.value)}>
          <option value="">{r.auto}</option>
          {voices.map((v) => (
            <option key={v.uri} value={v.uri}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="reader-try" disabled={!value} title={r.sample} aria-label={fmt(r.sampleFor, { name: label })} onClick={() => value && previewVoice(value, sample)}>
        ▶
      </button>
    </div>
  );

  return (
    <>
      <h2 className="reader-title">{r.voicesTitle}</h2>
      {select(r.narrator, reading.narrator, (narrator) => setReading({ narrator }), r.sampleText, true)}
      <label className="reader-field">
        <span>
          {r.rate} · {new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(reading.rate)}
        </span>
        <input type="range" min={0.5} max={2} step={0.1} value={reading.rate} onChange={(e) => setReading({ rate: Number(e.target.value) })} />
      </label>
      {screenplay && (
        <label className="reader-check">
          <input type="checkbox" checked={reading.parentheticals} onChange={(e) => setReading({ parentheticals: e.target.checked })} />
          {r.parentheticals}
        </label>
      )}
      {speakers.length > 0 && (
        <div className="reader-speakers">
          {speakers.map((name) => {
            const key = foldName(name);
            return (
              <div key={key}>
                {select(name, reading.voices[key] ?? "", (uri) => {
                  const next = { ...reading.voices };
                  if (uri) next[key] = uri;
                  else delete next[key];
                  setReading({ voices: next });
                }, r.sampleText)}
              </div>
            );
          })}
        </div>
      )}
      <p className="reader-hint">{r.voicesNote}</p>
    </>
  );
}
