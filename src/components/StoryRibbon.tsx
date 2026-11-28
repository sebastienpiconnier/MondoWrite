// Ruban du récit, en haut du Manuscrit et du Scénario : chaque case du gabarit à la place que ses scènes
// prennent vraiment, et en fantôme la position où elle commence d'ordinaire. Toucher une scène y mène.
// Discret : il n'apparaît qu'avec un gabarit, et le mode focus le cache.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { currentScript, useCosmos } from "../store";
import { useSettings } from "../settings";
import { screenplaySceneTexts, timeline } from "../timeline";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { useRibbon } from "./useRibbon";
import { fortuneCurve, heroIssues } from "../ribbon";
import { useBeatText } from "./useBeatText";
import { narratorColors } from "../pov";
import { plotColors } from "../plotColors";
import { usePhone } from "./usePhone";
import { useBoard } from "./Frise";

interface Props {
  /** Scène en cours (carte, ou `@<index>` pour une scène de scénario sans carte). */
  currentId: string | null;
  onGo: (id: string) => void;
}

export function StoryRibbon({ currentId, onGo }: Props) {
  const { t, kind } = useVocab();
  const r = t.ribbon;
  // Téléphone : libellés courts et sans la note « une part par scène », pour gagner une ligne (novembre 2026).
  const phone = usePhone();
  const nodes = useCosmos((s) => s.nodes);
  // Point de vue (1.13.0) : le ruban existe aussi en plan libre dès qu'une scène a un narrateur.
  const anyPov = useMemo(() => nodes.some((n) => n.data.type === "scene" && n.data.fiche?.pov), [nodes]);
  // Intrigues (lot 17) : le ruban existe aussi en plan libre dès qu'il y a une carte Intrigue, pour leurs pistes.
  const hasPlots = useMemo(() => nodes.some((n) => n.data.type === "intrigue" && n.data.title.trim()), [nodes]);
  const ribbon = useRibbon(anyPov || hasPlots);
  const beatInfo = useBeatText();
  const povPref = useSettings((s) => s.ribbonPov);
  const setPovPref = useSettings((s) => s.setRibbonPov);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.data.title.trim()])), [nodes]);
  // Piste des intrigues (dépliée à la demande) : où paraît chaque carte Intrigue, par fil ou citée dans la scène.
  // null : d'office, ouvertes en plan libre sans point de vue (le ruban n'est là que pour elles).
  const [lanesChoice, setLanesOpen] = useState<boolean | null>(null);
  const autoLanes = !!ribbon && ribbon.template === "libre" && !anyPov;
  const lanesOpen = lanesChoice ?? autoLanes;
  const plotOn = useSettings((s) => s.plotColors);
  const edges = useCosmos((s) => s.edges);
  const manuscript = useCosmos((s) => s.manuscript);
  const screenplay = useCosmos(currentScript);
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
    const colors = plotColors(nodes, edges).plots;
    return (plots?.rows ?? []).map((row) => ({ id: row.card.id, title: row.card.title.trim(), color: colors.get(row.card.id) ?? 1, cells: row.cells.map((presence, i) => ({ presence, scene: scenes[i] })) }));
  }, [lanesOpen, ribbon, hasPlots, kind, screenplay, manuscript, nodes, edges, lang]);
  // Couleurs des intrigues allumées, ou pistes des intrigues ouvertes : chaque scène du ruban prend celle de son intrigue principale.
  const plotOf = useMemo(() => {
    if (!plotOn && !(lanesOpen && hasPlots)) return null;
    const c = plotColors(nodes, edges);
    return (id: string) => {
      const main = c.main.get(id);
      return main ? c.plots.get(main) : undefined;
    };
  }, [plotOn, lanesOpen, hasPlots, nodes, edges]);
  // Courbe du récit : d'après « Pour le héros, la scène finit » des fiches de scène.
  const [curveOpen, setCurveOpen] = useState(false);
  // Légende des traits, et nom d'une partie montré un instant au toucher d'un trait (#163).
  const [keyOpen, setKeyOpen] = useState(false);
  const keyId = useId();
  const [peek, setPeek] = useState<string | null>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  const showPeek = (text: string) => {
    setPeek(text);
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeek(null), 4000);
  };
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);
  const curve = useMemo(() => {
    if (!ribbon) return null;
    // Courbe du héros (#171) : les scènes racontées par un autre personnage n'y entrent pas.
    const fiche = heroIssues(nodes.map((n) => n.data));
    return fortuneCurve(
      ribbon.segments.flatMap((seg) => seg.scenes),
      (id) => fiche.get(id),
    );
  }, [ribbon, nodes]);
  // Narrateur de chaque scène du ruban (carte Personnage qui existe encore), et sa couleur stable.
  const povs = useMemo(() => {
    const people = new Map(nodes.filter((n) => n.data.type === "personnage").map((n) => [n.id, n.data.title.trim()]));
    const of = new Map<string, string>();
    for (const n of nodes) if (n.data.type === "scene" && n.data.fiche?.pov && people.has(n.data.fiche.pov)) of.set(n.id, n.data.fiche.pov);
    const colors = narratorColors(of.values());
    return { of, colors, name: (id: string) => people.get(id) || t.plan.untitled };
  }, [nodes, t.plan.untitled]);
  if (!ribbon) return null;
  const marksKinds = (["level1", "level2", "level3", "expected"] as const).filter((k) =>
    ribbon.markers.some((m) => (k === "expected" ? !m.actual : m.actual && `level${m.level ?? 1}` === k)),
  );
  // Plan libre : pas de case à montrer, le ruban n'est là que pour les points de vue.
  const free = ribbon.template === "libre";
  const povMode = anyPov && (povPref || free);
  const legend = povMode
    ? [...povs.colors.keys()]
        .map((id) => ({ id, color: povs.colors.get(id)!, name: povs.name(id), n: ribbon.segments.reduce((sum, seg) => sum + seg.scenes.filter((sc) => povs.of.get(sc.id) === id).length, 0) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, lang))
    : [];
  const allScenes = ribbon.segments.reduce((sum, seg) => sum + seg.scenes.length, 0);
  const withoutPov = allScenes - legend.reduce((sum, x) => sum + x.n, 0);
  const sceneLabel = (id: string, base: string) => {
    const pov = povMode ? povs.of.get(id) : undefined;
    return pov ? fmt(r.povScene, { scene: base, name: povs.name(pov) }) : base;
  };
  const pct = (v: number) => Math.round(v * 100);
  const beatLabel = (key: string | null) => (key ? beatInfo(key).label : free ? r.story : kind === "scenario" ? r.beforeFirst : t.plan.unplaced);
  const here = ribbon.segments.flatMap((seg) => seg.scenes.map((s) => ({ seg, s }))).find((x) => x.s.id === currentId);

  return (
    <nav className={`ribbon${povMode ? " is-pov" : ""}${lanes.length > 0 ? " has-lanes" : ""}`} aria-label={r.aria}>
      <div className="ribbon-track">
        {ribbon.segments.map((seg, i) => (
          <div
            key={`${seg.key ?? "free"}-${i}`}
            className={`ribbon-beat${i % 2 ? " is-odd" : ""}${seg.key ? "" : " is-free"}`}
            style={{ left: `${seg.start * 100}%`, width: `${seg.length * 100}%` }}
            title={beatLabel(seg.key)}
          >
            {seg.scenes.map((s, j) => {
              const label = sceneLabel(s.id, fmt(r.scene, { title: titles.get(s.id) || t.plan.untitled, beat: beatLabel(seg.key), n: j + 1 }));
              const pov = povMode ? povs.of.get(s.id) : undefined;
              const color = pov ? povs.colors.get(pov) : plotOf?.(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`ribbon-scene${s.id === currentId ? " is-current" : ""}${color ? " has-pov" : ""}`}
                  style={{
                    left: `${seg.length > 0 ? ((s.start - seg.start) / seg.length) * 100 : 0}%`,
                    width: `${seg.length > 0 ? (s.length / seg.length) * 100 : 0}%`,
                    ...(color ? ({ "--scene-pov": `var(--${pov ? "pov" : "plot"}-${color})` } as React.CSSProperties) : {}),
                  }}
                  aria-current={s.id === currentId ? "true" : undefined}
                  aria-label={label}
                  title={label}
                  onClick={() => onGo(s.id)}
                />
              );
            })}
          </div>
        ))}
        {ribbon.markers.map((m) => {
          const text = m.actual ? fmt(r.startsAt, { beat: beatLabel(m.key), n: pct(m.at) }) : fmt(r.expected, { beat: beatLabel(m.key), n: pct(m.at) });
          // Nom de la partie au survol et au toucher (#163) : dit dans la légende sous le ruban, pas seulement en infobulle.
          return (
            <span
              key={m.key}
              className={`ribbon-mark${m.actual ? ` is-actual is-level-${m.level ?? 1}` : ""}${peek === text ? " is-peeked" : ""}`}
              style={{ left: `${m.at * 100}%` }}
              title={text}
              aria-hidden="true"
              onPointerEnter={(e) => e.pointerType === "mouse" && setPeek(text)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setPeek(null)}
              onClick={() => showPeek(text)}
            />
          );
        })}
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
        <div key={lane.id} className="ribbon-lane" style={{ "--lane": `var(--plot-${lane.color})` } as React.CSSProperties}>
          {/* Lire le récit fil par fil (#117) : le nom de l'intrigue ouvre ses seules scènes. */}
          <button type="button" className="ribbon-lane-name" title={fmt(t.thread.readOf, { title: lane.title })} onClick={() => useCosmos.getState().readThread(lane.id)}>
            {lane.title}
          </button>
          <div className="ribbon-lane-track" role="img" aria-label={fmt(r.laneAria, { title: lane.title, n: lane.cells.filter((c) => c.presence !== "none").length })}>
            {lane.cells.map((c) =>
              c.presence === "none" ? null : (
                <span key={c.scene.id} className={`ribbon-lane-mark is-${c.presence}`} style={{ left: `${c.scene.start * 100}%`, width: `${c.scene.length * 100}%` }} />
              ),
            )}
          </div>
        </div>
      ))}
      {legend.length > 0 && (
        <ul className="ribbon-legend" aria-label={r.povLegend}>
          {legend.map((x) => (
            <li key={x.id} style={{ "--scene-pov": `var(--pov-${x.color})` } as React.CSSProperties}>
              <span className="ribbon-legend-swatch" aria-hidden="true" />
              {fmt(r.povCount, { name: x.name, n: x.n })}
            </li>
          ))}
          {withoutPov > 0 && (
            <li className="is-none">
              <span className="ribbon-legend-swatch" aria-hidden="true" />
              {fmt(r.povCount, { name: r.noPov, n: withoutPov })}
            </li>
          )}
        </ul>
      )}
      <p className="ribbon-caption" aria-live="polite">
        {peek ? <span className="ribbon-peek">{peek}</span> : here ? sceneLabel(here.s.id, free ? fmt(r.freeCaption, { n: pct(here.s.start) }) : fmt(r.caption, { beat: beatLabel(here.seg.key), n: pct(here.s.start) })) : free ? (anyPov ? r.povHint : r.plotsHint) : r.hint}
        {!ribbon.measured && !phone && <span className="ribbon-note"> · {r.byCount}</span>}
        {anyPov && !free && (
          <>
            {" · "}
            <button type="button" className="ribbon-toggle" aria-pressed={povMode} title={r.povHint} onClick={() => setPovPref(!povPref)}>
              {phone ? r.povShort : povMode ? r.hidePov : r.showPov}
            </button>
          </>
        )}
        {curve && (
          <>
            {" · "}
            <button type="button" className="ribbon-toggle" aria-expanded={curveOpen} title={r.curveHint} onClick={() => setCurveOpen(!curveOpen)}>
              {phone ? r.curveShort : curveOpen ? r.hideCurve : r.showCurve}
            </button>
          </>
        )}
        {hasPlots && (
          <>
            {" · "}
            <button type="button" className="ribbon-toggle" aria-expanded={lanesOpen} title={r.plotsHint} onClick={() => setLanesOpen(!lanesOpen)}>
              {phone ? r.plotsShort : lanesOpen ? r.hidePlots : r.showPlots}
            </button>
          </>
        )}
        {marksKinds.length > 0 && (
          <>
            {" · "}
            <button type="button" className="ribbon-toggle" aria-expanded={keyOpen} aria-controls={keyId} onClick={() => setKeyOpen(!keyOpen)}>
              {r.keyToggle}
            </button>
          </>
        )}
        {/* Le ruban en grand (#173) : la frise au-dessus du texte, cartes à la longueur des scènes, pistes et courbes. */}
        {!phone && (
          <>
            {" · "}
            <button type="button" className="ribbon-toggle" onClick={() => useBoard.getState().setOpen(true)}>
              {t.frise.expand}
            </button>
          </>
        )}
      </p>
      {/* Ce que disent les traits du ruban (#163) : seulement ceux qu'il montre. */}
      {keyOpen && marksKinds.length > 0 && (
        <ul className="ribbon-key" id={keyId}>
          {marksKinds.map((k) => (
            <li key={k}>
              <span className={`ribbon-key-mark ${k === "expected" ? "" : `is-actual is-level-${k.slice(-1)}`}`} aria-hidden="true" />
              {r.key[k]}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
