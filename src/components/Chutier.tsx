// Chutier : les passages retirés du manuscrit, que l'on peut remettre exactement à leur place (voir chutier.ts).

import { useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { isTouch } from "../platform";
import type { Passage } from "../chutier";
import type { CardData } from "../types";

const EXCERPT = 140;
const excerpt = (text: string) => (text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text);

export function Chutier({ passages, cards, onPutBack }: { passages: Passage[]; cards: CardData[]; onPutBack: (p: Passage) => void }) {
  const c = useT().book.chutier;
  const lang = useSettings((s) => s.lang);
  const removePassage = useCosmos((s) => s.removePassage);
  // Suppression définitive : un second clic la confirme.
  const [sure, setSure] = useState<string | null>(null);
  const day = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(d);
  };

  return (
    <section className="sp-box ms-chutier" aria-label={c.title}>
      <h2 className="sp-box-title">
        {c.title}
        {passages.length > 0 ? <span className="ms-chutier-count"> ({passages.length})</span> : null}
      </h2>
      {passages.length === 0 ? <p className="sp-empty">{isTouch() ? c.hintTouch : c.hint}</p> : null}
      <ul className="ms-chutier-list">
        {[...passages].reverse().map((p) => {
          const scene = cards.find((x) => x.id === p.scene);
          const text = excerpt(p.text);
          return (
            <li key={p.id} className="ms-chutier-item">
              <p className="ms-chutier-text">{text}</p>
              <p className="ms-chutier-meta">
                {fmt(c.from, { scene: scene ? scene.title.trim() || c.untitled : c.sceneGone })}
                {day(p.date) ? ` · ${day(p.date)}` : ""}
              </p>
              <div className="ms-chutier-actions">
                <button type="button" aria-label={fmt(c.putBackAria, { text })} onClick={() => onPutBack(p)}>
                  {c.putBack}
                </button>
                <button
                  type="button"
                  className={sure === p.id ? "is-danger" : ""}
                  aria-label={fmt(c.removeAria, { text })}
                  onBlur={() => setSure((s) => (s === p.id ? null : s))}
                  onClick={() => {
                    if (sure === p.id) {
                      removePassage(p.id);
                      setSure(null);
                    } else setSure(p.id);
                  }}
                >
                  {sure === p.id ? c.removeSure : c.remove}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
