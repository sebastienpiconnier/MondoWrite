// Commandes de la lecture à voix haute, dans les barres du Scénario et du Manuscrit : « Écouter », puis Pause,
// Reprendre, Arrêter et le choix des voix (narrateur, personnages, vitesse). Les voix sont celles de l'appareil ;
// leur choix est un réglage de l'appareil (settings.reading), jamais du projet.

import { useEffect, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { foldName } from "../review/names";
import { voicesFor } from "../reading";
import { canSpeak, pauseReading, previewVoice, resumeReading, stopReading, useReaderState, useSystemVoices } from "./useReader";

interface Props {
  /** Commence la lecture (à partir de la scène ou du passage en cours). */
  onStart: () => void;
  /** Personnages du texte, pour leur donner une voix (scénario seulement). */
  speakers?: string[];
  /** Classe des boutons, celle de la barre où ils sont posés. */
  buttonClass: string;
  /** Scénario : propose aussi de lire les didascalies. */
  screenplay?: boolean;
}

export function ReaderBar({ onStart, speakers = [], buttonClass, screenplay = false }: Props) {
  const t = useT();
  const r = t.reading;
  const status = useReaderState((s) => s.status);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Quitter la vue arrête la lecture.
  useEffect(() => () => stopReading(), []);

  // Le panneau des voix se ferme par Échap ou un clic à côté.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !toggleRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  if (!canSpeak()) return null;
  const prevent = (e: React.PointerEvent) => e.preventDefault();

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
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          className="reader-panel"
          role="dialog"
          aria-label={r.voicesTitle}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              toggleRef.current?.focus();
            }
          }}
        >
          <VoiceChoices speakers={speakers} screenplay={screenplay} />
        </div>
      )}
    </span>
  );
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
