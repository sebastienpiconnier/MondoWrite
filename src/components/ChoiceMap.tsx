// Carte des choix d'un roman interactif (lot 2, docs/plan-roman-interactif.md) : quatrième présentation du Plan.
// Une carte par scène, une flèche par choix. Le texte des scènes reste la seule source : chaque geste écrit dans le
// bloc de choix de la scène (store : addChoiceTo, editChoiceAt, addSceneAfter), et chaque choix tapé dans le texte
// apparaît ici. Les places vivent dans cosmos.json (`choiceMap`), jamais dans le canevas.
//
// Trois chemins : tirer une flèche (souris, doigt), lâcher dans le vide pour créer la scène suivante, et le menu ⋯ de
// chaque scène (clavier, doigt), qui fait la même chose. Une flèche choisie s'édite dans le bandeau du haut.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { plainText } from "../search";
import { END_TARGET, choiceGraph, endsByDivert, layoutChoiceMap, readChoiceMap, type ChoiceEdge, type MapPositions } from "../interactive/choices";
import { interactiveScenes } from "../interactive/scenes";
import { MoreMenu } from "./MoreMenu";
import { openPlay } from "../interactive/playState";
import { verifyStory } from "../interactive/verify";
import { readFactLabels } from "../interactive/facts";
import { useChoiceMapView } from "../interactive/mapView";
import { ChoiceRules, FactsPanel, ruleSummary, useFacts } from "./ChoiceRules";

interface SceneData extends Record<string, unknown> {
  title: string;
  rank: number;
  excerpt: string;
  start: boolean;
  ending: boolean;
  deadEnd: boolean;
  broken: number;
  /** Vérificateur (lot 5). */
  unreachable: boolean;
  locked: boolean;
  factIssue: boolean;
}
type SceneNode = Node<SceneData, "scene">;

const EXCERPT = 140;
const excerptOf = (html: string | undefined) => {
  const text = plainText((html ?? "").replace(/<pre data-choices="true">[\s\S]*?<\/pre>/g, ""));
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text;
};

const SceneCard = memo(function SceneCard({ id, data, selected }: NodeProps<SceneNode>) {
  const t = useT();
  const m = t.interactive.map;
  const title = data.title.trim() || m.untitled;
  const ask = (kind: "pick" | "after" | "end") => window.dispatchEvent(new CustomEvent("choice-map", { detail: { kind, id } }));
  return (
    <div className={`choice-scene${selected ? " is-selected" : ""}${data.start ? " is-start" : ""}`}>
      <Handle type="target" position={Position.Left} className="choice-handle" />
      <div className="choice-scene-head">
        <span className="choice-scene-title">
          <span className="choice-scene-rank">{data.rank}.</span> {title}
        </span>
        <MoreMenu
          className="nodrag"
          label={fmt(m.more, { title })}
          items={[
            { label: m.write, onSelect: () => useCosmos.getState().openInManuscript(id) },
            { label: t.interactive.play.openHere, onSelect: () => openPlay(id) },
            { label: m.addChoice, onSelect: () => ask("pick") },
            { label: m.sceneAfter, onSelect: () => ask("after") },
            { label: m.endHere, onSelect: () => ask("end") },
          ]}
        />
      </div>
      {data.excerpt && <p className="choice-scene-text">{data.excerpt}</p>}
      <p className="choice-scene-tags">
        {data.start && <span className="choice-tag is-start">{m.start}</span>}
        {data.ending && <span className="choice-tag is-end">{m.end}</span>}
        {data.deadEnd && <span className="choice-tag is-dead">{m.deadEnd}</span>}
        {data.broken > 0 && <span className="choice-tag is-broken">{fmt(m.broken, { n: data.broken })}</span>}
        {data.unreachable && <span className="choice-tag is-broken">{m.unreachable}</span>}
        {data.locked && <span className="choice-tag is-warn">{m.locked}</span>}
        {data.factIssue && <span className="choice-tag is-warn">{m.factIssue}</span>}
      </p>
      <Handle type="source" position={Position.Right} className="choice-handle" />
    </div>
  );
});

const nodeTypes = { scene: SceneCard };

function ChoiceFlow() {
  const t = useT();
  const m = t.interactive.map;
  const theme = useSettings((s) => s.theme);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const metaKeep = useCosmos((s) => s.metaKeep);
  const flow = useReactFlow();

  const scenes = interactiveScenes(nodes, plan);
  const graph = useMemo(() => choiceGraph(manuscript, scenes), [manuscript, scenes]);
  const saved = useMemo(() => readChoiceMap(metaKeep), [metaKeep]);
  const points = useMemo(() => verifyStory(scenes, manuscript, readFactLabels(metaKeep)), [scenes, manuscript, metaKeep]);
  const placed = useMemo(() => layoutChoiceMap(scenes.map((s) => s.id), graph, saved), [scenes, graph, saved]);

  const built = useMemo<SceneNode[]>(
    () =>
      scenes.map((s, i) => {
        const out = graph.filter((e) => e.from === s.id);
        return {
          id: s.id,
          type: "scene",
          position: placed[s.id],
          data: {
            title: s.title,
            rank: i + 1,
            excerpt: excerptOf(manuscript[s.id]),
            start: i === 0,
            // Un « -> END » écrit dans le bloc (fichier Ink importé) finit aussi l'histoire.
            ending: out.some((e) => e.to === END_TARGET) || endsByDivert(manuscript[s.id]),
            deadEnd: out.length === 0 && !endsByDivert(manuscript[s.id]),
            broken: out.filter((e) => e.to === null).length,
            unreachable: points.some((p) => p.rule === "unreachableScene" && p.scene === s.id),
            locked: points.some((p) => p.rule === "lockedScene" && p.scene === s.id),
            factIssue: points.some((p) => (p.rule === "factNeverGiven" || p.rule === "factTooLate") && p.scene === s.id),
          },
        };
      }),
    [scenes, graph, placed, manuscript, points],
  );
  // Places locales pendant qu'on glisse ; enregistrées au lâcher.
  const [local, setLocal] = useState<SceneNode[]>(built);
  useEffect(() => {
    setLocal((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return built.map((n) => (selected.has(n.id) ? { ...n, selected: true } : n));
    });
  }, [built]);
  // Une scène de plus (menu, dépôt) : la vue la montre.
  const count = built.length;
  const seenCount = useRef(count);
  useEffect(() => {
    if (count > seenCount.current) requestAnimationFrame(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }));
    seenCount.current = count;
  }, [count, flow]);
  // « Voir sur la carte des choix » (onglet « Vérifier ») : la scène est choisie et mise au centre.
  const focus = useChoiceMapView((s) => s.focus);
  useEffect(() => {
    if (!focus) return;
    const at = placed[focus];
    useChoiceMapView.setState({ focus: null });
    if (!at) return;
    setLocal((ns) => ns.map((n) => ({ ...n, selected: n.id === focus })));
    requestAnimationFrame(() => flow.setCenter(at.x + 130, at.y + 50, { zoom: Math.max(flow.getZoom(), 0.9), duration: 250 }));
  }, [focus, placed, flow]);
  const onNodesChange = useCallback((changes: NodeChange<SceneNode>[]) => setLocal((ns) => applyNodeChanges(changes, ns)), []);
  const savePositions = useCallback(() => {
    const pos: MapPositions = {};
    for (const n of flow.getNodes()) pos[n.id] = n.position;
    useCosmos.getState().setChoiceMapPositions(pos);
  }, [flow]);

  const titleOf = (id: string) => scenes.find((s) => s.id === id)?.title.trim() || m.untitled;
  const facts = useFacts();
  const edges = useMemo<Edge[]>(
    () =>
      graph
        .filter((e): e is ChoiceEdge & { to: string } => !!e.to && e.to !== END_TARGET)
        .map((e) => {
          // Un choix soumis à un fait, ou qui en donne un, le dit sur sa flèche.
          const rules = ruleSummary(e, facts, { ifFact: m.edgeIf, ifNot: m.edgeIfNot, gives: m.edgeGives });
          return {
          id: `${e.from}:${e.index}`,
          source: e.from,
          target: e.to,
          label: [rules.before, e.label || m.defaultLabel, rules.after].filter(Boolean).join(" · "),
          ariaLabel: fmt(m.edgeAria, { label: e.label || m.defaultLabel, from: titleOf(e.from), to: titleOf(e.to) }),
          className: e.label ? "choice-edge" : "choice-edge is-unnamed",
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--ink-2)" },
          // Choix soumis à une condition : flèche en pointillé.
          style: { stroke: "var(--ink-2)", strokeWidth: 1.5, ...(e.cond ? { strokeDasharray: "6 4" } : {}) },
          labelStyle: { fill: "var(--ink)", fontSize: 12 },
          labelBgStyle: { fill: "var(--surface)" },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
          data: { from: e.from, index: e.index },
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, scenes, t, facts],
  );
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const edgeInfo = graph.find((e) => `${e.from}:${e.index}` === selectedEdge) ?? null;

  // Tirer une flèche vers une autre scène : un choix. La lâcher dans le vide : une nouvelle scène et son choix.
  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target && c.source !== c.target) useCosmos.getState().addChoiceTo(c.source, c.target);
  }, []);
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || state.toNode) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const at = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY });
      useCosmos.getState().addSceneAfter(state.fromNode.id, { x: at.x, y: at.y - 40 });
    },
    [flow],
  );

  // Menu ⋯ d'une scène : choisir une destination dans une liste (clavier, doigt).
  const [picking, setPicking] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const { kind, id } = (e as CustomEvent<{ kind: "pick" | "after" | "end"; id: string }>).detail;
      const store = useCosmos.getState();
      if (kind === "pick") setPicking(id);
      else if (kind === "end") store.addChoiceTo(id, END_TARGET);
      else store.addSceneAfter(id);
    };
    window.addEventListener("choice-map", on);
    return () => window.removeEventListener("choice-map", on);
  }, [flow]);

  const tidy = () => {
    const pos = layoutChoiceMap(scenes.map((s) => s.id), graph, {});
    useCosmos.getState().setChoiceMapPositions(pos);
    requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 200 }));
  };
  const newFirst = () => {
    useCosmos.getState().addTitledCard("scene", m.newSceneTitle);
  };

  if (scenes.length === 0)
    return (
      <div className="choice-map is-empty">
        <p className="sp-empty">{m.empty}</p>
        <button type="button" className="ghost-button" onClick={newFirst}>
          + {m.newScene}
        </button>
      </div>
    );

  return (
    <div className="choice-map" aria-label={m.aria} role="region">
      <ReactFlow<SceneNode, Edge>
        nodes={local}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={savePositions}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onEdgesDelete={(gone) => {
          // Du plus haut rang au plus bas : retirer un choix ne décale pas ceux qui restent à retirer.
          const sorted = [...gone].sort((a, b) => Number((b.data as { index: number }).index) - Number((a.data as { index: number }).index));
          for (const e of sorted) {
            const d = e.data as { from: string; index: number };
            useCosmos.getState().editChoiceAt(d.from, d.index, null);
          }
          setSelectedEdge(null);
        }}
        onSelectionChange={({ edges: chosen }) => chosen.length === 1 && setSelectedEdge(chosen[0].id)}
        onEdgeClick={(_e, edge) => setSelectedEdge(edge.id)}
        onPaneClick={() => setSelectedEdge(null)}
        nodesConnectable
        deleteKeyCode={["Delete", "Backspace"]}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="bottom-left" className="choice-map-hint">
          {m.hint}
        </Panel>
        <Panel position="top-right" className="choice-map-actions">
          <button type="button" className="ghost-button" onClick={() => openPlay()}>
            {t.interactive.play.open}
          </button>
          <button type="button" className={`ghost-button${showFacts ? " is-on" : ""}`} aria-expanded={showFacts} onClick={() => setShowFacts((v) => !v)}>
            {fmt(t.interactive.facts.button, { n: facts.length })}
          </button>
          <button type="button" className="ghost-button" title={m.tidyHint} onClick={tidy}>
            {m.tidy}
          </button>
        </Panel>
        {edgeInfo && (
          <Panel position="top-center" className="choice-map-edge">
            <EdgeEditor key={selectedEdge} edge={edgeInfo} onDone={() => setSelectedEdge(null)} />
          </Panel>
        )}
      </ReactFlow>
      {showFacts && <FactsPanel onClose={() => setShowFacts(false)} />}
      {picking && <TargetPicker from={picking} title={titleOf(picking)} scenes={scenes.map((s, i) => ({ ...s, rank: i + 1 })).filter((s) => s.id !== picking)} onClose={() => setPicking(null)} />}
    </div>
  );
}

/** Bandeau d'une flèche choisie : son texte, et la retirer. */
function EdgeEditor({ edge, onDone }: { edge: ChoiceEdge; onDone: () => void }) {
  const m = useT().interactive.map;
  const [label, setLabel] = useState(edge.label);
  const commit = () => {
    if (label !== edge.label) useCosmos.getState().editChoiceAt(edge.from, edge.index, { label, target: edge.target, cond: edge.cond, effects: edge.effects });
  };
  return (
    <div className="choice-edge-editor">
      <label>
        <span>{m.edgeLabel}</span>
        <input
          type="text"
          value={label}
          maxLength={200}
          placeholder={m.defaultLabel}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              onDone();
            } else if (e.key === "Escape") onDone();
          }}
        />
      </label>
      <ChoiceRules line={{ ...edge, label }} n={edge.index + 1} onChange={(next) => useCosmos.getState().editChoiceAt(edge.from, edge.index, next)} />
      <button
        type="button"
        className="ghost-button is-danger"
        onClick={() => {
          useCosmos.getState().editChoiceAt(edge.from, edge.index, null);
          onDone();
        }}
      >
        {m.removeChoice}
      </button>
    </div>
  );
}

/** « Ajouter un choix vers… » : la liste des scènes, puis la fin. */
function TargetPicker({ from, title, scenes, onClose }: { from: string; title: string; scenes: { id: string; title: string; rank: number }[]; onClose: () => void }) {
  const m = useT().interactive.map;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const pick = (to: string) => {
    useCosmos.getState().addChoiceTo(from, to);
    onClose();
  };
  return (
    <div
      className="choice-picker"
      role="dialog"
      aria-label={fmt(m.pickTitle, { title })}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <p className="choice-picker-title">{fmt(m.pickTitle, { title })}</p>
      <p className="choice-picker-hint">{m.pickHint}</p>
      <ul>
        {scenes.map((s, i) => (
          <li key={s.id}>
            <button type="button" ref={i === 0 ? first : undefined} onClick={() => pick(s.id)}>
              {s.rank}. {s.title.trim() || m.untitled}
            </button>
          </li>
        ))}
        <li>
          <button type="button" ref={scenes.length === 0 ? first : undefined} onClick={() => pick(END_TARGET)}>
            {m.ending}
          </button>
        </li>
      </ul>
      <button type="button" className="ghost-button" onClick={onClose}>
        {m.cancel}
      </button>
    </div>
  );
}

export function ChoiceMap() {
  return (
    <ReactFlowProvider>
      <ChoiceFlow />
    </ReactFlowProvider>
  );
}
