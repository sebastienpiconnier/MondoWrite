// Ruban du récit, en haut du Manuscrit et du Scénario : chaque case du gabarit à la place que ses scènes
// prennent vraiment, et en fantôme la position où elle commence d'ordinaire. Toucher une scène y mène.
// Discret : il n'apparaît qu'avec un gabarit, et le mode focus le cache.

import { useMemo, useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { screenplaySceneTexts, timeline } from "../timeline";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { useRibbon } from "./useRibbon";
import { fortuneCurve } from "../ribbon";
import { useBeatText } from "./useBeatText";

interface Props {
  /** Scène en cours (carte, ou `@<index>` pour une scène de scénario sans carte). */
  currentId: string | null;
  onGo: (id: string) => void;
}

export function StoryRibbon({ currentId, onGo }: Props) {
  const { t, kind } = useVocab();
  const r = t.ribbon;
  const ribbon = useRibbon();
  const beatInfo = useBeatText();
  const nodes = useCosmos((s) => s.nodes);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.data.title.trim()])), [nodes]);
  // Piste des intrigues (dépliée à la demande) : où paraît chaque carte Intrigue, par fil ou citée dans la scène.
  const [lanesOpen, setLanesOpen] = useState(false);
  const hasPlots = useMemo(() => nodes.some((n) => n.data.type === "intrigue" && n.data.title.trim()), [nodes]);
  const edges = useCosmos((s) => s.edges);
  const manuscript = useCosmos((s) => s.manuscript);
  const screenplay = useCosmos((s) => s.screenplay);
  const lang = useSettings((s) => s.lang);
  const lanes = useMemo(() => {
    if (!lanesOpen || !ribbon || !hasPlots) return [];
    const scenes = ribbon.segments.flatMap((seg) => seg.scenes).filter((s) => !s.id.startsWith("@"));
    const texts = kind === "scenario" ? screenplaySceneTexts(screenplay?.elements ?? []) : manuscript;
    const plots = timeline(
      nodes.map((n) => n.data),
      edges,
      texts,
      scenes.map((s) => s.id),
      lang,
    ).find((g) => g.type === "intrigue");
    return (plots?.rows ?? []).map((row) => ({ id: row.card.id, title: row.card.title.trim(), cells: row.cells.map((presence, i) => ({ presence, scene: scenes[i] })) }));
  }, [lanesOpen, ribbon, hasPlots, kind, screenplay, manuscript, nodes, edges, lang]);
  // Courbe du récit : d'après « Pour le héros, la scène finit » des fiches de scène.
  const [curveOpen, setCurveOpen] = useState(false);
  const curve = useMemo(() => {
    if (!ribbon) return null;
    const fiche = new Map(nodes.map((n) => [n.id, n.data.fiche?.issue]));
    return fortuneCurve(
      ribbon.segments.flatMap((seg) => seg.scenes),
      (id) => fiche.get(id),
    );
  }, [ribbon, nodes]);
  if (!ribbon) return null;
  const pct = (v: number) => Math.round(v * 100);
  const beatLabel = (key: string | null) => (key ? beatInfo(key).label : kind === "scenario" ? r.beforeFirst : t.plan.unplaced);
  const here = ribbon.segments.flatMap((seg) => seg.scenes.map((s) => ({ seg, s }))).find((x) => x.s.id === currentId);

  return (
    <nav className="ribbon" aria-label={r.aria}>
      <div className="ribbon-track">
        {ribbon.segments.map((seg, i) => (
          <div
            key={`${seg.key ?? "free"}-${i}`}
            className={`ribbon-beat${i % 2 ? " is-odd" : ""}${seg.key ? "" : " is-free"}`}
            style={{ left: `${seg.start * 100}%`, width: `${seg.length * 100}%` }}
            title={beatLabel(seg.key)}
          >
            {seg.scenes.map((s, j) => (
              <button
                key={s.id}
                type="button"
                className={`ribbon-scene${s.id === currentId ? " is-current" : ""}`}
                style={{ left: `${seg.length > 0 ? ((s.start - seg.start) / seg.length) * 100 : 0}%`, width: `${seg.length > 0 ? (s.length / seg.length) * 100 : 0}%` }}
                aria-current={s.id === currentId ? "true" : undefined}
                aria-label={fmt(r.scene, { title: titles.get(s.id) || t.plan.untitled, beat: beatLabel(seg.key), n: j + 1 })}
                title={fmt(r.scene, { title: titles.get(s.id) || t.plan.untitled, beat: beatLabel(seg.key), n: j + 1 })}
                onClick={() => onGo(s.id)}
              />
            ))}
          </div>
        ))}
        {ribbon.markers.map((m) => (
          <span key={m.key} className="ribbon-mark" style={{ left: `${m.at * 100}%` }} title={fmt(r.expected, { beat: beatLabel(m.key), n: pct(m.at) })} aria-hidden="true" />
        ))}
      </div>
      {curveOpen && curve && (
        <div className="ribbon-curve" role="img" aria-label={r.curveAria}>
          <svg viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" y1="22" x2="1000" y2="22" className="ribbon-curve-mid" />
            <polyline points={curve.map((p) => `${p.x * 1000},${22 - p.y * 18}`).join(" ")} className="ribbon-curve-line" />
          </svg>
          {curve.map((p) =>
            p.set ? <span key={p.id} className={`ribbon-curve-dot${p.id === currentId ? " is-current" : ""}`} style={{ left: `${p.x * 100}%`, top: `${((22 - p.y * 18) / 44) * 100}%` }} /> : null,
          )}
        </div>
      )}
      {lanes.map((lane) => (
        <div key={lane.id} className="ribbon-lane">
          <span className="ribbon-lane-name">{lane.title}</span>
          <div className="ribbon-lane-track" role="img" aria-label={fmt(r.laneAria, { title: lane.title, n: lane.cells.filter((c) => c.presence !== "none").length })}>
            {lane.cells.map((c) =>
              c.presence === "none" ? null : (
                <span key={c.scene.id} className={`ribbon-lane-mark is-${c.presence}`} style={{ left: `${c.scene.start * 100}%`, width: `${c.scene.length * 100}%` }} />
              ),
            )}
          </div>
        </div>
      ))}
      <p className="ribbon-caption">
        {here ? fmt(r.caption, { beat: beatLabel(here.seg.key), n: pct(here.s.start) }) : r.hint}
        {!ribbon.measured && <span className="ribbon-note"> · {r.byCount}</span>}
        {curve && (
          <>
            {" · "}
            <button type="button" className="ribbon-toggle" aria-expanded={curveOpen} title={r.curveHint} onClick={() => setCurveOpen(!curveOpen)}>
              {curveOpen ? r.hideCurve : r.showCurve}
            </button>
          </>
        )}
        {hasPlots && (
          <>
            {" · "}
            <button type="button" className="ribbon-toggle" aria-expanded={lanesOpen} title={r.plotsHint} onClick={() => setLanesOpen(!lanesOpen)}>
              {lanesOpen ? r.hidePlots : r.showPlots}
            </button>
          </>
        )}
      </p>
    </nav>
  );
}
