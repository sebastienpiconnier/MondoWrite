// Statistiques › Courbes : l'évolution de chaque personnage en score cumulé (arcs.ts), une courbe par personnage
// sur la ligne du récit, puis sa lecture en constats et en questions. Rien n'est saisi ni enregistré ici : les
// réponses « Pour X, la scène finit » se donnent dans l'onglet Scène. Un nom mène à la fiche, une scène au texte.

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { fmt } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { useVocab } from "../vocab";
import { junctionOrder } from "../projectJunctions";
import { arcTicks, characterArcs, type ArcNote, type CharacterArc } from "../arcs";
import { characterColors } from "../plotColors";

/** Géométrie du dessin (unités du viewBox ; le dessin suit la largeur de la fenêtre). */
const W = 640;
const H = 150;
const PAD = { left: 34, right: 10, top: 10, bottom: 22 };

export function ArcStats({ onOpen, onGo }: { onOpen: (id: string) => void; onGo: (id: string) => void }) {
  const { t } = useVocab();
  const a = t.arcStats;
  const nodes = useCosmos((s) => s.nodes);
  const kind = useCosmos((s) => s.kind);
  const plan = useCosmos((s) => s.plan);
  const screenplay = useCosmos((s) => s.screenplay);
  const order = useMemo(() => junctionOrder(kind, nodes, plan, screenplay), [kind, nodes, plan, screenplay]);
  const arcs = useMemo(() => characterArcs(nodes.map((n) => n.data), order), [nodes, order]);
  const hues = useMemo(() => characterColors(nodes), [nodes]);

  if (arcs.length === 0) return <p className="muted">{a.empty}</p>;
  return (
    <div className="arc-stats">
      <p className="muted arc-stats-note">{a.intro}</p>
      <p className="muted arc-stats-note">{a.source}</p>
      <p className="muted arc-stats-note">{a.legend}</p>
      {arcs.map((arc) => (
        <ArcCard key={arc.id} arc={arc} hue={hues.get(arc.id) ?? 1} onOpen={onOpen} onGo={onGo} />
      ))}
      <p className="muted arc-stats-note">{a.caveat}</p>
    </div>
  );
}

function ArcCard({ arc, hue, onOpen, onGo }: { arc: CharacterArc; hue: number; onOpen: (id: string) => void; onGo: (id: string) => void }) {
  const { t } = useVocab();
  const a = t.arcStats;
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.data.id, n.data.title.trim()])), [nodes]);
  const name = titles.get(arc.id) || a.untitledCharacter;
  const signed = (n: number) => new Intl.NumberFormat(lang, { signDisplay: "exceptZero" }).format(n);
  const sceneTitle = (rank: number) => titles.get(arc.points[rank]?.id ?? "") || a.untitledScene;
  const sceneButton = (rank: number) => (
    <button type="button" className="link-button" onClick={() => onGo(arc.points[rank].id)}>
      {fmt(a.sceneButton, { n: rank + 1, title: sceneTitle(rank) })}
    </button>
  );
  const s = arc.summary;
  const endText = fmt(a.end, { final: signed(s.final), n: s.answered, up: s.up, same: s.same, down: s.down });
  return (
    <section className="arc-card" style={{ "--curve": `var(--plot-${hue})` } as CSSProperties} aria-label={fmt(t.frise.lanes.curveOf, { name })}>
      <h3 className="arc-card-title">
        <span className="card-dot" aria-hidden="true" />
        <button type="button" className="link-button" onClick={() => onOpen(arc.id)}>
          {name}
        </button>
      </h3>
      <ArcChart arc={arc} label={fmt(a.chartAria, { name, end: endText })} sceneTitle={sceneTitle} signed={signed} />
      <ul className="arc-notes">
        {arc.notes.map((note, i) => (
          <li key={i} className={isQuestion(note) ? "is-question" : undefined}>
            <NoteText note={note} name={name} signed={signed} sceneButton={sceneButton} endText={endText} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const isQuestion = (note: ArcNote) => note.key === "neverDown" || note.key === "neverUp" || note.key === "lowAtEnd" || note.key === "declared";

/** Remplace `{scene}` par le bouton qui mène à la scène, sans passer par du HTML. */
function withScene(text: string, scene: ReactNode): ReactNode {
  const [before, after = ""] = text.split("{scene}");
  return (
    <>
      {before}
      {scene}
      {after}
    </>
  );
}

function NoteText({ note, name, signed, sceneButton, endText }: { note: ArcNote; name: string; signed: (n: number) => string; sceneButton: (rank: number) => ReactNode; endText: string }) {
  const a = useVocab().t.arcStats;
  switch (note.key) {
    case "few":
      return <>{note.n === 1 ? a.fewOne : fmt(a.fewMany, { n: note.n })}</>;
    case "end":
      return <>{endText}</>;
    case "peak":
      return withScene(fmt(a.peak, { score: signed(note.score), scene: "{scene}" }), sceneButton(note.rank));
    case "trough":
      return withScene(fmt(a.trough, { score: signed(note.score), scene: "{scene}" }), sceneButton(note.rank));
    case "rise":
      return <>{fmt(a.rise, { n: note.run.length, from: note.run.from + 1, to: note.run.to + 1 })}</>;
    case "fall":
      return <>{fmt(a.fall, { n: note.run.length, from: note.run.from + 1, to: note.run.to + 1 })}</>;
    case "neverDown":
      return <>{fmt(a.neverDown, { name })}</>;
    case "neverUp":
      return <>{fmt(a.neverUp, { name })}</>;
    case "lowAtEnd":
      return <>{fmt(a.lowAtEnd, { score: signed(note.score) })}</>;
    case "declared":
      return <>{fmt(a.declared[note.arc], { final: signed(note.final) })}</>;
  }
}

/** La courbe : une graduation par niveau entier, le zéro marqué, un point par scène notée (son titre au survol). */
function ArcChart({ arc, label, sceneTitle, signed }: { arc: CharacterArc; label: string; sceneTitle: (rank: number) => string; signed: (n: number) => string }) {
  const a = useVocab().t.arcStats;
  const { points, summary } = arc;
  const lo = Math.min(0, summary.trough.score);
  const hi = Math.max(0, summary.peak.score);
  const ticks = arcTicks(lo, hi);
  const top = Math.max(hi, ticks[ticks.length - 1]);
  const bottom = Math.min(lo, ticks[0]);
  const span = Math.max(1, top - bottom);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  // Le départ (0, avant la première scène) a sa place à gauche : la scène 1 vient juste après.
  const x = (rank: number) => PAD.left + ((rank + 1) / Math.max(1, points.length)) * innerW;
  const y = (score: number) => PAD.top + ((top - score) / span) * innerH;
  // Départ à 0 avant la première scène, puis un point par scène du récit (le score reste à plat sur une scène non notée).
  const path = [`M${x(-1).toFixed(1)} ${y(0).toFixed(1)}`, ...points.map((p) => `L${x(p.rank).toFixed(1)} ${y(p.score).toFixed(1)}`)].join(" ");
  return (
    <svg className="arc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? "arc-zero" : "arc-grid"} />
          <text x={PAD.left - 6} y={y(v)} className="arc-tick" textAnchor="end" dominantBaseline="middle">
            {signed(v)}
          </text>
        </g>
      ))}
      <text x={PAD.left + innerW / 2} y={H - 4} className="arc-axis" textAnchor="middle">
        {a.axis}
      </text>
      <path d={path} className="arc-line" />
      {points
        .filter((p) => p.step !== null)
        .map((p) => (
          <circle key={p.id} cx={x(p.rank)} cy={y(p.score)} r={3.5} className={`arc-dot is-${p.step === 1 ? "up" : p.step === -1 ? "down" : "same"}`}>
            <title>{fmt(a.dot, { n: p.rank + 1, title: sceneTitle(p.rank), score: signed(p.score) })}</title>
          </circle>
        ))}
    </svg>
  );
}
