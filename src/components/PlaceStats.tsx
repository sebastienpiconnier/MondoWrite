// Bible › Lieux › Statistiques (Décors dans un scénario) : tableau trié par colonne, répartition intérieur
// ou extérieur, jour ou nuit (scénario), export CSV. Tout est relu dans le texte (review/places.ts).

import { useMemo, useState } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { storage } from "../storage";
import { useVocab } from "../vocab";
import { placesCsv, sortPlaces, type PlaceRow, type PlaceSortKey, type SettingSummary } from "../review/places";

interface Props {
  rows: PlaceRow[];
  kind: "script" | "text";
  /** Scénario : répartition sur tout le texte. */
  summary?: SettingSummary;
  onOpen: (id: string) => void;
}

/** Personnages montrés sous le nom d'un lieu : les quatre premiers, puis « +n ». */
const SHOWN = 4;

export function PlaceStats({ rows, kind, summary, onOpen }: Props) {
  const t = useT().placeStats;
  const cs = useT().charStats;
  const { types } = useVocab();
  const lang = useSettings((s) => s.lang);
  const title = useCosmos((s) => s.title);
  const script = kind === "script";
  const [sort, setSort] = useState<{ key: PlaceSortKey; desc: boolean }>({ key: script ? "pages" : "scenes", desc: true });
  const sorted = useMemo(() => sortPlaces(rows, sort.key, sort.desc, lang), [rows, sort, lang]);
  const number = (n: number) => new Intl.NumberFormat(lang).format(n);
  const decimal = (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n);
  const percent = (n: number) => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(n);

  const sortable: { key: PlaceSortKey; label: string; numeric?: boolean }[] = [
    { key: "name", label: types.lieu.label },
    { key: "scenes", label: t.columns.scenes, numeric: true },
    script ? { key: "pages", label: t.columns.pages, numeric: true } : { key: "words", label: t.columns.words, numeric: true },
    { key: "share", label: t.columns.share },
    { key: "first", label: t.columns.appear },
  ];

  const exportCsv = async () => {
    const csv = `﻿${placesCsv(sorted, script ? t.csvHeadersScript : t.csvHeadersText, script, lang)}`;
    await storage.saveAs({ name: `${title || "MondoWrite"} - ${types.lieu.section}`, extension: "csv", mime: "text/csv", data: new TextEncoder().encode(csv) }, "CSV");
  };

  if (rows.length === 0) return <p className="muted">{t.empty}</p>;

  const header = (c: { key: PlaceSortKey; label: string; numeric?: boolean }) => (
    <th key={c.key} scope="col" className={c.numeric ? "is-number" : ""} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        aria-label={fmt(cs.sortBy, { column: c.label })}
        onClick={() => setSort(sort.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.numeric === true || c.key === "share" })}
      >
        {c.label}
        {sort.key === c.key && <span aria-hidden="true">{sort.desc ? " ▾" : " ▴"}</span>}
      </button>
    </th>
  );

  return (
    <div className="char-stats place-stats">
      <div className="char-stats-tools">
        <button type="button" className="ghost-button" onClick={() => void exportCsv()}>
          {cs.export}
        </button>
      </div>
      <div className="char-stats-table">
        <table>
          <thead>
            <tr>
              {sortable.map(header)}
              {script && (
                <>
                  <th scope="col">
                    <span className="char-stats-head">{t.columns.setting}</span>
                  </th>
                  <th scope="col">
                    <span className="char-stats-head">{t.columns.moment}</span>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id ?? `name:${r.name}`}>
                <th scope="row">
                  <span className="place-stats-who">
                  {r.id ? (
                    <button type="button" className="link-button char-stats-name" aria-label={fmt(cs.openAria, { name: r.name })} onClick={() => onOpen(r.id!)}>
                      {r.name}
                    </button>
                  ) : (
                    <span className="char-stats-name">
                      {r.name} <span className="muted">({cs.noCard})</span>
                    </span>
                  )}
                  {r.characters.length > 0 && (
                    <span className="place-stats-people" title={r.characters.join(", ")}>
                      {r.characters.slice(0, SHOWN).join(", ")}
                      {r.characters.length > SHOWN && ` ${fmt(t.more, { n: number(r.characters.length - SHOWN) })}`}
                    </span>
                  )}
                  </span>
                </th>
                <td className="is-number">{number(r.scenes)}</td>
                <td className="is-number">{script ? (r.pages ? fmt(t.pagesValue, { n: decimal(r.pages) }) : number(0)) : number(r.words)}</td>
                <td>
                  <span className="char-stats-share">
                    <span className="char-stats-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(r.share * 100)}%` }} />
                    </span>
                    {percent(r.share)}
                  </span>
                </td>
                <td>{r.first === null ? "" : r.first === r.last ? number(r.first) : fmt(cs.appearRange, { first: number(r.first), last: number(r.last!) })}</td>
                {script && (
                  <>
                    <td className="is-number">{r.scenes ? `${number(r.int)} / ${number(r.ext)}` : ""}</td>
                    <td className="is-number">{r.scenes ? `${number(r.day)} / ${number(r.night)}` : ""}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary && summary.scenes > 0 && (
        <>
          <h4 className="char-stats-title">{t.summaryTitle}</h4>
          <ul className="char-stats-genders">
            {(
              [
                [t.int, summary.int],
                [t.ext, summary.ext],
                [t.day, summary.day],
                [t.night, summary.night],
              ] as const
            ).map(([label, n]) => (
              <li key={label}>
                <span className="char-stats-gender">{label}</span>
                <span className="char-stats-big">{percent(n / summary.scenes)}</span>
                <span className="char-stats-sub">{fmt(t.ofScenes, { n: number(n), total: number(summary.scenes) })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted char-stats-note">{script ? t.noteScript : t.noteText}</p>
    </div>
  );
}
