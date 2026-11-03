// Série (docs/plan-episodes.md) : choix de l'épisode ouvert dans la vue Scénario. La liste vient des sections
// du scénario (saisons et épisodes, screenplay/series.ts) : « Tout le scénario », puis chaque épisode, et
// « Nouvel épisode ». Les flèches passent à l'épisode précédent ou suivant. Rien n'est affiché hors d'une série.

import { useMemo, useCallback } from "react";
import { MoreMenu, type MoreItem } from "./MoreMenu";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { allEpisodes, isSeries, resolveEpisode, seriesOf, type Episode } from "../screenplay/series";

/** Libellé d'un épisode : « Ép. 3 · Tempête », ou « Ép. 3 · Épisode sans titre ». */
export function useEpisodeLabel(): (ep: Episode) => string {
  const t = useT().season;
  // Même fonction tant que la langue ne change pas : elle sert de dépendance à des calculs mémorisés.
  return useCallback((ep: Episode) => fmt(t.episodeTitled, { n: ep.number, title: ep.title || t.untitled }), [t]);
}

export function EpisodePicker({ beforeSwitch, onNotice }: { beforeSwitch?: () => void; onNotice?: (text: string) => void }) {
  const t = useT().season;
  const full = useCosmos((s) => s.screenplay);
  const current = useCosmos((s) => resolveEpisode(s.screenplay, s.currentEpisode));
  const label = useEpisodeLabel();
  const seasons = useMemo(() => (full ? seriesOf(full.elements) : []), [full]);
  const episodes = useMemo(() => (full ? allEpisodes(full.elements) : []), [full]);
  if (!full || !isSeries(full)) return null;

  const open = (id: string | null) => {
    if (id === current) return;
    beforeSwitch?.();
    useCosmos.getState().openEpisode(id);
    const ep = episodes.find((e) => e.id === id);
    onNotice?.(ep ? fmt(t.opened, { title: label(ep) }) : t.whole);
  };
  const addEpisode = () => {
    beforeSwitch?.();
    const s = useCosmos.getState();
    const id = s.addSeriesEpisode(episodes.find((e) => e.id === current)?.season);
    if (id) s.openEpisode(id);
  };
  // Plusieurs saisons : le nom de la saison précède ses épisodes dans le menu.
  const many = seasons.length > 1;
  const items: MoreItem[] = [
    { label: t.whole, onSelect: () => open(null), hint: current === null ? t.current : undefined },
    ...seasons.flatMap((s) =>
      s.episodes.map((ep) => ({
        label: many ? `${s.title || (s.id ? t.seasonUntitled : t.noSeason)} · ${label(ep)}` : label(ep),
        onSelect: () => open(ep.id),
        hint: ep.id === current ? t.current : undefined,
      })),
    ),
    { label: t.newEpisode, onSelect: addEpisode },
  ];
  const at = current ? episodes.findIndex((e) => e.id === current) : -1;
  const shown = at >= 0 ? label(episodes[at]) : t.whole;
  return (
    <div className="episode-picker" role="group" aria-label={t.picker}>
      <button type="button" className="icon-button" aria-label={t.previous} title={t.previous} disabled={at <= 0} onClick={() => open(episodes[at - 1].id)}>
        <span aria-hidden="true">‹</span>
      </button>
      <MoreMenu
        items={items}
        label={fmt(t.pickerAria, { title: shown })}
        className="episode-picker-menu"
        icon={
          <>
            <span className="episode-picker-label">{shown}</span>
            <span className="disclosure is-open" aria-hidden="true" />
          </>
        }
      />
      <button type="button" className="icon-button" aria-label={t.next} title={t.next} disabled={at >= episodes.length - 1} onClick={() => open(episodes[at + 1].id)}>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
