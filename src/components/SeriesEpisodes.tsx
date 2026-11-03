// Rubrique « Épisodes » de la Bible d'une série (plan des épisodes, lot 3) : les saisons et les épisodes sont
// des sections du scénario (screenplay/series.ts), lus et modifiés ici sans rien recopier. Titres et synopsis
// se changent sur place, comme dans le séquencier ; « Nouvel épisode » ajoute une section.

import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { seriesOf } from "../screenplay/series";
import { useEpisodeLabel } from "./EpisodePicker";
import { SynopsisField } from "./SynopsisField";
import { usePagination } from "./usePagination";
import { pagesBetween } from "../screenplay/paginate";
import { useSettings } from "../settings";

const EMPTY: never[] = [];

export function SeriesEpisodes() {
  const t = useT();
  const ts = t.season;
  const screenplay = useCosmos((s) => s.screenplay);
  const seasons = screenplay ? seriesOf(screenplay.elements) : EMPTY;
  const label = useEpisodeLabel();
  const pagination = usePagination(true);
  const s = useCosmos.getState;
  const write = (id: string) => {
    s().openEpisode(id);
    s().setView("manuscrit");
  };
  const add = () => {
    const id = s().addSeriesEpisode();
    if (id) s().openEpisode(id);
  };
  const lang = useSettings((x) => x.lang);
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });

  if (seasons.length === 0) {
    return (
      <div className="bible-empty-section">
        <p className="muted">{ts.bibleEmpty}</p>
        <button type="button" className="ghost-button" onClick={add}>
          + {ts.newEpisode}
        </button>
      </div>
    );
  }
  return (
    <div className="series-bible">
      {seasons.map((season) => (
        <section key={season.id ?? "none"} className="series-bible-season" aria-label={season.title || ts.seasonUntitled}>
          {season.id && (
            <input
              key={`${season.id}:${season.title}`}
              className="series-bible-title is-season"
              defaultValue={season.title}
              placeholder={ts.seasonUntitled}
              aria-label={ts.seasonTitleAria}
              onBlur={(e) => s().renameSeriesPart(season.id!, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          )}
          <ol className="series-bible-list">
            {season.episodes.map((ep) => {
              const pages = pagination ? pagesBetween(pagination, ep.start, ep.end) : 0;
              return (
                <li key={ep.id} className="series-bible-episode bible-entry">
                  <div className="series-bible-head">
                    <span className="beat-rank">{fmt(ts.episodeNumber, { n: ep.number })}</span>
                    <input
                      key={`${ep.id}:${ep.title}`}
                      className="series-bible-title"
                      defaultValue={ep.title}
                      placeholder={ts.untitled}
                      aria-label={fmt(ts.episodeTitleAria, { n: ep.number })}
                      onBlur={(e) => s().renameSeriesPart(ep.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    {pages > 0 && <span className="muted series-bible-pages">{fmt(t.screenplay.lengthShort, { n: number.format(pages) })}</span>}
                    <button type="button" className="ghost-button" onClick={() => write(ep.id)}>
                      {ts.write}
                    </button>
                  </div>
                  <SynopsisField value={ep.synopsis} scene={label(ep)} onSave={(text) => s().setEpisodeSynopsis(ep.id, text)} />
                </li>
              );
            })}
          </ol>
          {season.id && (
            <button type="button" className="link-button" onClick={() => s().addSeriesEpisode(season.id)}>
              + {ts.newEpisodeIn}
            </button>
          )}
        </section>
      ))}
      <div className="series-bible-actions">
        <button type="button" className="ghost-button" onClick={() => s().addSeriesSeason()}>
          + {ts.newSeason}
        </button>
        <button type="button" className="link-button" onClick={() => s().setView("plan")}>
          {ts.openOutline}
        </button>
      </div>
    </div>
  );
}
