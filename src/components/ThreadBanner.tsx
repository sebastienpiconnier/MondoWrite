// Lire le récit fil par fil (#117) : bandeau au-dessus du texte du Manuscrit et du Scénario. Il dit la carte suivie
// et combien de scènes restent, offre « Aussi celles qui la citent » et rend tout le texte. Affichage seulement.

import { fmt, useT, type Messages } from "../i18n";
import { useCosmos } from "../store";
import type { CardData } from "../types";

/** Texte de l'écart devant une scène gardée : scènes sautées, et pages s'il y en a au moins une. */
export function gapText(scenes: number, pages: number, t: Messages): string {
  const r = t.thread;
  const head = scenes === 1 ? r.gapOne : fmt(r.gapMany, { n: scenes });
  return pages < 1 ? head : head + (pages === 1 ? r.gapPageOne : fmt(r.gapPages, { n: Math.round(pages) }));
}

export function ThreadBanner({ card, shown, total }: { card: CardData | undefined; shown: number; total: number }) {
  const t = useT();
  const r = t.thread;
  const filter = useCosmos((s) => s.threadFilter);
  const setFilter = useCosmos((s) => s.setThreadFilter);
  if (!filter) return null;
  const title = card?.title.trim() || t.manuscript.untitled;
  return (
    <div className="thread-banner" role="status">
      <span className="thread-banner-title">{card ? fmt(r.banner, { title }) : r.gone}</span>
      {card && <span className="thread-banner-count">{shown === 0 ? fmt(r.none, { title }) : shown === 1 ? fmt(r.countOne, { total }) : fmt(r.count, { shown, total })}</span>}
      {card && (
        <label className="thread-banner-cited">
          <input type="checkbox" checked={filter.cited} onChange={(e) => setFilter({ ...filter, cited: e.target.checked })} />
          <span>{r.cited}</span>
        </label>
      )}
      <button type="button" className="ghost-button" aria-label={r.clearAria} onClick={() => setFilter(null)}>
        {r.clear}
      </button>
    </div>
  );
}
