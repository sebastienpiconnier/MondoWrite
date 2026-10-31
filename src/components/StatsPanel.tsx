// Fenêtre « Statistiques » (bouton du Manuscrit et du Scénario, menu Présentation du Mac) : personnages, lieux
// ou décors, qui croise qui, et pour un scénario intérieur ou extérieur, jour ou nuit. Tout est relu dans le
// texte (useProjectStats) : rien n'est enregistré, l'onglet choisi est un état d'affichage. Le dépouillement
// d'un scénario (1.9.0) a son onglet : il lit les fiches des scènes, et ses propositions s'y ajoutent sur un clic.

import { useMemo, useState, type CSSProperties } from "react";
import { fmt } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { useVocab } from "../vocab";
import { CharacterStats } from "./CharacterStats";
import { PlaceStats } from "./PlaceStats";
import { BreakdownStats } from "./StructureTools";
import { useProjectStats } from "./useProjectStats";
import { castForMatrix, neverMeet, shared, topDuo, type Cast, type Presence } from "../review/crossings";
import type { SettingSummary } from "../review/places";
import { iaPercent, iaShareOfManuscript, iaShareOfScreenplay } from "../atelier";
import { IaImageStats } from "./ImageGen";

type Tab = "characters" | "places" | "crossings" | "setting" | "breakdown";

/** Au-delà, la matrice devient illisible : les plus présents seulement. */
const MATRIX_MAX = 12;
/** Paires « ne se croisent jamais » montrées avant « et n autres ». */
const NEVER_SHOWN = 8;

export function StatsPanel() {
  const { t, types } = useVocab();
  const s = t.projectStats;
  const { script, characters, places, summary, cast } = useProjectStats();
  const [tab, setTab] = useState<Tab>("characters");
  const close = () => useCosmos.getState().setDialog(null);
  const openCard = (id: string) => {
    close();
    useCosmos.getState().openInBible(id);
  };
  const seeLines = (name: string) => {
    close();
    useCosmos.getState().setCharFilter({ name: name.toLocaleUpperCase(useSettings.getState().lang), mode: "lines" });
    useCosmos.getState().setView("manuscrit");
  };
  const tabs: [Tab, string][] = [
    ["characters", s.tabCharacters],
    ["places", types.lieu.section],
    ["crossings", s.tabCrossings],
    ...(script ? ([["setting", s.tabSetting], ["breakdown", t.structure.breakdownTitle]] as [Tab, string][]) : []),
  ];

  return (
    <div className="stats-panel">
      {/* Fermer sans descendre au bas d'un long tableau. */}
      <button type="button" className="expanded-close" aria-label={t.gallery.close} title={t.gallery.close} onClick={close}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <h2 id="app-dialog-title">{s.title}</h2>
      <div className="sq-modes stats-tabs" role="group" aria-label={s.tabsAria}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "characters" && <CharacterStats rows={characters} kind={script ? "script" : "text"} onOpen={openCard} onSeeLines={script ? seeLines : undefined} />}
      {tab === "places" && <PlaceStats rows={places} kind={script ? "script" : "text"} onOpen={openCard} />}
      {tab === "crossings" && <Crossings cast={cast} script={script} onOpen={openCard} />}
      {tab === "setting" && summary && <Setting summary={summary} />}
      {/* Dépouillement (1.9.0) : tout le scénario par l'IA, à cocher, puis la liste par catégorie avec les scènes. */}
      {tab === "breakdown" && script && <BreakdownStats />}
      <IaShare script={script} />
    </div>
  );
}

/**
 * Mode Atelier : la part du texte touchée par l'IA (passages proposés et pas encore repris), en mots. Montrée
 * dès que le projet est en Atelier ou qu'il reste un passage marqué (Atelier arrêté depuis).
 */
function IaShare({ script }: { script: boolean }) {
  const { t } = useVocab();
  const mode = useCosmos((s) => s.aiMode);
  const manuscript = useCosmos((s) => s.manuscript);
  const screenplay = useCosmos((s) => s.screenplay);
  const share = useMemo(() => (script ? iaShareOfScreenplay(screenplay) : iaShareOfManuscript(manuscript)), [script, screenplay, manuscript]);
  if (mode !== "atelier" && share.ia === 0) return <IaImageStats />;
  return (
    <section className="stats-ia" aria-label={t.atelier.marked}>
      <p>{share.ia > 0 ? fmt(t.atelier.stats, { n: share.ia, p: iaPercent(share) }) : t.atelier.statsNone}</p>
      <IaImageStats />
      <p className="settings-hint">{t.atelier.statsHint}</p>
    </section>
  );
}

/** « Qui croise qui » : matrice des scènes partagées, paires qui ne se croisent jamais, duo le plus présent. */
function Crossings({ cast, script, onOpen }: { cast: Cast; script: boolean; onOpen: (id: string) => void }) {
  const { t } = useVocab();
  const s = t.projectStats;
  const lang = useSettings((st) => st.lang);
  const title = useCosmos((st) => st.title);
  const people = useMemo(() => castForMatrix(cast.people, MATRIX_MAX, lang), [cast, lang]);
  const present = cast.people.filter((p) => p.scenes.length > 0).length;
  const never = useMemo(() => neverMeet(people), [people]);
  const duo = useMemo(() => topDuo(people), [people]);
  const max = useMemo(() => Math.max(1, ...people.flatMap((a, i) => people.slice(i + 1).map((b) => shared(a, b).length))), [people]);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const number = (n: number) => new Intl.NumberFormat(lang).format(n);
  const pair = (a: Presence, b: Presence) => fmt(s.pair, { a: a.name, b: b.name });

  if (people.length < 2) return <p className="muted">{s.empty}</p>;

  const exportCsv = async () => {
    const sep = lang.startsWith("fr") ? ";" : ",";
    const cell = (v: string) => (v.includes(sep) || /["\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      [s.corner, ...people.map((p) => p.name)].map(cell).join(sep),
      ...people.map((a) => [a.name, ...people.map((b) => (a === b ? "" : String(shared(a, b).length)))].map(cell).join(sep)),
    ];
    const csv = `﻿${lines.join("\r\n")}\r\n`;
    await storage.saveAs({ name: `${title || "MondoWrite"} - ${s.csvCrossings}`, extension: "csv", mime: "text/csv", data: new TextEncoder().encode(csv) }, "CSV");
  };

  const chosen = picked ? { a: people[picked[0]], b: people[picked[1]] } : null;
  const together = chosen ? shared(chosen.a, chosen.b) : [];
  const sceneOf = (n: number) => cast.scenes[n - 1];
  const openScene = (cardId: string) => {
    useCosmos.getState().setDialog(null);
    useCosmos.getState().openInManuscript(cardId);
  };
  const seeInScript = () => {
    if (!chosen) return;
    useCosmos.getState().setDialog(null);
    useCosmos.getState().setCharFilter({ name: chosen.a.name.toLocaleUpperCase(lang), with: chosen.b.name.toLocaleUpperCase(lang), mode: "scenes" });
    useCosmos.getState().setView("manuscrit");
  };

  return (
    <div className="char-stats cross">
      <div className="cross-head">
        <p className="muted">
          {script ? s.crossIntroScript : s.crossIntroText}
          {present > MATRIX_MAX && ` ${fmt(s.crossTop, { n: number(MATRIX_MAX) })}`}
        </p>
        <button type="button" className="ghost-button" onClick={() => void exportCsv()}>
          {t.charStats.export}
        </button>
      </div>
      <div className="cross-layout">
        <div className="cross-main">
          <div className="cross-table">
            <table>
              <thead>
                <tr>
                  <td />
                  {people.map((p) => (
                    <th key={p.id ?? p.name} scope="col" title={p.name}>
                      <span>{p.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((a, i) => (
                  <tr key={a.id ?? a.name}>
                    <th scope="row">
                      {a.id ? (
                        <button type="button" className="link-button char-stats-name" aria-label={fmt(t.charStats.openAria, { name: a.name })} onClick={() => onOpen(a.id!)}>
                          {a.name}
                        </button>
                      ) : (
                        <span className="char-stats-name">{a.name}</span>
                      )}
                    </th>
                    {people.map((b, j) => {
                      if (i === j) return <td key={j} className="cross-cell is-self" aria-hidden="true">·</td>;
                      const n = shared(a, b).length;
                      const label = fmt(n === 0 ? s.cellNone : n === 1 ? s.cellOne : s.cellMany, { a: a.name, b: b.name, n: number(n) });
                      const on = picked !== null && ((picked[0] === i && picked[1] === j) || (picked[0] === j && picked[1] === i));
                      return (
                        <td key={j} className="cross-cell-wrap">
                          <button
                            type="button"
                            className={`cross-cell${n === 0 ? " is-never" : ""}${n === max ? " is-top" : ""}`}
                            style={n ? ({ "--heat": `${Math.round(10 + (25 * n) / max)}%` } as CSSProperties) : undefined}
                            aria-label={label}
                            title={label}
                            aria-pressed={on}
                            onClick={() => setPicked(on ? null : [i, j])}
                          >
                            {number(n)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {chosen ? (
            <div className="cross-shared" role="status">
              <p>
                <strong>
                  {together.length === 0
                    ? fmt(s.sharedNone, { a: chosen.a.name, b: chosen.b.name })
                    : fmt(together.length === 1 ? s.sharedOne : s.sharedMany, { a: chosen.a.name, b: chosen.b.name, n: number(together.length) })}
                </strong>
              </p>
              {together.length > 0 && (
                <ul>
                  {together.map((n) => {
                    const scene = sceneOf(n);
                    const name = scene?.title.trim() || s.untitledScene;
                    return (
                      <li key={n}>
                        <span className="muted">{fmt(s.sceneNumber, { n: number(n) })}</span>{" "}
                        {scene?.cardId ? (
                          <button type="button" className="link-button" aria-label={fmt(s.openSceneAria, { title: name })} onClick={() => openScene(scene.cardId!)}>
                            {name}
                          </button>
                        ) : (
                          name
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="cross-shared-actions">
                {script && together.length > 0 && (
                  <button type="button" className="ghost-button" onClick={seeInScript}>
                    {s.seeInScript}
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => setPicked(null)}>
                  {s.closeShared}
                </button>
              </div>
            </div>
          ) : (
            <p className="muted char-stats-note">{s.cellHint}</p>
          )}
        </div>
        <aside className="cross-side">
          <section>
            <h3>{s.duoTitle}</h3>
            {duo ? (
              <>
                <p className="cross-big">{pair(duo.a, duo.b)}</p>
                <p className="muted">{fmt(duo.scenes.length === 1 ? s.duoScene : s.duoScenes, { n: number(duo.scenes.length), total: number(cast.scenes.length) })}</p>
              </>
            ) : (
              <p className="muted">{s.duoNone}</p>
            )}
          </section>
          <section>
            <h3>{s.neverTitle}</h3>
            {never.length === 0 ? (
              <p className="muted">{s.neverNone}</p>
            ) : (
              <>
                <ul>
                  {never.slice(0, NEVER_SHOWN).map((p) => (
                    <li key={`${p.a.name}|${p.b.name}`}>{pair(p.a, p.b)}</li>
                  ))}
                </ul>
                {never.length > NEVER_SHOWN && <p className="muted">{fmt(s.neverMore, { n: number(never.length - NEVER_SHOWN) })}</p>}
                <p className="muted">{s.neverNote}</p>
              </>
            )}
          </section>
          <section>
            <h3>{s.relationsTitle}</h3>
            <p className="muted">{s.relationsNote}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Scénario entier : intérieur ou extérieur, jour ou nuit (moments repris comptés à part). */
function Setting({ summary }: { summary: SettingSummary }) {
  const { t } = useVocab();
  const s = t.projectStats;
  const p = t.placeStats;
  const lang = useSettings((st) => st.lang);
  if (summary.scenes === 0) return <p className="muted">{s.empty}</p>;
  const number = (n: number) => new Intl.NumberFormat(lang).format(n);
  const percent = (n: number) => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(n);
  const tiles: [string, number, number][] = [
    [p.int, summary.int, 0],
    [p.ext, summary.ext, 0],
    [p.day, summary.day, summary.inheritedDay],
    [p.night, summary.night, summary.inheritedNight],
  ];
  const extra: [string, number][] = [
    [s.unknownSetting, summary.unknownSetting],
    [s.otherMoment, summary.otherMoment],
  ];
  return (
    <div className="char-stats">
      <h3 className="char-stats-title">{p.summaryTitle}</h3>
      <ul className="char-stats-genders">
        {tiles.map(([label, n, inherited]) => (
          <li key={label}>
            <span className="char-stats-gender">{label}</span>
            <span className="char-stats-big">{percent(n / summary.scenes)}</span>
            <span className="char-stats-sub">
              {fmt(p.ofScenes, { n: number(n), total: number(summary.scenes) })}
              {inherited > 0 && `, ${fmt(s.inherited, { n: number(inherited) })}`}
            </span>
          </li>
        ))}
        {extra
          .filter(([, n]) => n > 0)
          .map(([label, n]) => (
            <li key={label}>
              <span className="char-stats-gender">{label}</span>
              <span className="char-stats-big">{number(n)}</span>
              <span className="char-stats-sub">{fmt(p.ofScenes, { n: number(n), total: number(summary.scenes) })}</span>
            </li>
          ))}
      </ul>
      <p className="muted char-stats-note">{s.settingNote}</p>
    </div>
  );
}
