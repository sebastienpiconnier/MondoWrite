// Bible › Personnages › Chiffres : un tableau trié par colonne (scènes, répliques, mots dits, temps de parole,
// apparitions), la répartition par genre, et l'export en CSV. Tout est relu dans le texte (review/report.ts).

import { useMemo, useState } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { storage } from "../storage";
import { genderSummary, reportCsv, sortRows, type CharacterRow, type SortKey } from "../review/report";

interface Props {
  rows: CharacterRow[];
  kind: "script" | "text";
  onOpen: (id: string) => void;
  /** Scénario : ses répliques (filtre par personnage de la vue Scénario). */
  onSeeLines?: (name: string) => void;
}

export function CharacterStats({ rows, kind, onOpen, onSeeLines }: Props) {
  const t = useT().charStats;
  const lang = useSettings((s) => s.lang);
  const title = useCosmos((s) => s.title);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: kind === "script" ? "lines" : "scenes", desc: true });
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.desc, lang), [rows, sort, lang]);
  const groups = useMemo(() => genderSummary(rows), [rows]);
  const number = (n: number) => new Intl.NumberFormat(lang).format(n);
  const percent = (n: number) => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(n);
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : fmt(many, { n: number(n) }));

  const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "name", label: t.columns.name },
    { key: "gender", label: t.columns.gender },
    { key: "scenes", label: t.columns.scenes, numeric: true },
    ...(kind === "script" ? [{ key: "lines" as SortKey, label: t.columns.lines, numeric: true }] : []),
    { key: "words", label: kind === "script" ? t.columns.wordsScript : t.columns.wordsText, numeric: true },
    { key: "share", label: kind === "script" ? t.columns.shareScript : t.columns.shareText },
    { key: "first", label: t.columns.appear },
  ];

  const exportCsv = async () => {
    const csv = `﻿${reportCsv(sorted, t.csvHeaders, lang)}`;
    await storage.saveAs({ name: `${title || "MondoWrite"} - ${t.columns.name}`, extension: "csv", mime: "text/csv", data: new TextEncoder().encode(csv) }, "CSV");
  };

  if (rows.length === 0) return <p className="muted">{t.empty}</p>;

  return (
    <div className="char-stats">
      <div className="char-stats-tools">
        <button type="button" className="ghost-button" onClick={() => void exportCsv()}>
          {t.export}
        </button>
      </div>
      <div className="char-stats-table">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.numeric ? "is-number" : ""} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                  <button
                    type="button"
                    aria-label={fmt(t.sortBy, { column: c.label })}
                    onClick={() => setSort(sort.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.numeric === true || c.key === "share" })}
                  >
                    {c.label}
                    {sort.key === c.key && <span aria-hidden="true">{sort.desc ? " ▾" : " ▴"}</span>}
                  </button>
                </th>
              ))}
              {onSeeLines && <td />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id ?? `name:${r.name}`}>
                <th scope="row">
                  {r.id ? (
                    <button type="button" className="link-button char-stats-name" aria-label={fmt(t.openAria, { name: r.name })} onClick={() => onOpen(r.id!)}>
                      {r.name}
                    </button>
                  ) : (
                    <span className="char-stats-name">
                      {r.name} <span className="muted">({t.noCard})</span>
                    </span>
                  )}
                </th>
                <td className={r.gender ? "" : "muted"}>{r.gender || t.genderNone}</td>
                <td className="is-number">{number(r.scenes)}</td>
                {kind === "script" && <td className="is-number">{number(r.lines)}</td>}
                <td className="is-number">{number(r.words)}</td>
                <td>
                  <span className="char-stats-share">
                    <span className="char-stats-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(r.share * 100)}%` }} />
                    </span>
                    {percent(r.share)}
                  </span>
                </td>
                <td>{r.first === null ? "" : r.first === r.last ? number(r.first) : fmt(t.appearRange, { first: number(r.first), last: number(r.last!) })}</td>
                {onSeeLines && (
                  <td>
                    {r.lines > 0 && (
                      <button type="button" className="link-button" aria-label={fmt(t.seeLinesAria, { name: r.name })} onClick={() => onSeeLines(r.name)}>
                        {t.seeLines}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="char-stats-title">{t.byGender}</h4>
      <ul className="char-stats-genders">
        {groups.map((g) => (
          <li key={g.gender || "-"}>
            <span className="char-stats-gender">{g.gender || t.genderNone}</span>
            <span className="char-stats-big">{percent(g.share)}</span>
            <span className="char-stats-sub">
              {plural(g.characters, t.charactersOne, t.charactersMany)}
              {kind === "script" ? ` · ${plural(g.lines, t.linesOne, t.linesMany)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted char-stats-note">{kind === "script" ? t.noteScript : t.noteText}</p>
    </div>
  );
}
