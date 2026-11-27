// La frise (#173) : le récit sur une ligne de montage. Chaque carte est une scène, sa largeur suit sa longueur
// (pages d'un scénario, mots d'un roman ramenés en pages) ; dessous, la courbe du récit, puis une piste par intrigue,
// thème, personnage (avec sa courbe) et lieu ou décor. Deux places :
// - le ruban agrandi du Manuscrit et du Scénario (`mode="ribbon"`), au-dessus du texte, hauteur réglée par un
//   séparateur : toucher une carte ou la règle mène à la scène dans le texte ;
// - la troisième présentation du Plan et du séquencier (`mode="plan"`), avec le volet de la scène choisie.
// Rien n'est enregistré : déplacer une carte déplace la scène dans le récit (Plan ou Fountain), toucher une case
// d'une piste tire ou retire le fil du canevas. Trois chemins : glisser à la souris, Alt + ← → au clavier,
// « Plus tôt » / « Plus tard » dans le volet au doigt.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { currentScript, planScenes, SCENE_AT, useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { typeColor, type CardData, type CardType } from "../types";
import { chapterNumbers, hasSubBeats, templateBeats } from "../plan";
import { countWords } from "../manuscript";
import { WORDS_PER_MINUTE, WORDS_PER_PAGE } from "../stats";
import { paginate, pagesBetween } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { blocks } from "../screenplay/sequence";
import { screenplayPlan } from "../screenplay/template";
import { allEpisodes, isSeries } from "../screenplay/series";
import { sceneSynopsis } from "../screenplay/scenes";
import { eighthsOf, formatEighths } from "../screenplay/eighths";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import { heroIssues, type CurvePoint } from "../ribbon";
import { screenplaySceneTexts, timeline } from "../timeline";
import { useInteractive } from "../interactive/useInteractive";
import {
  CARD_GAP,
  DEFAULT_SCALE,
  FRISE_SCALES,
  cardWidth,
  characterIssues,
  friseTotal,
  layoutScenes,
  laneCurve,
  moveSceneBefore,
  moveSceneToRowEnd,
  novelRows,
  pageToX,
  rowStarts,
  rulerMarks,
  sceneAtX,
  screenplayRows,
  stepScene,
  timecode,
  type FriseRow,
  type FriseScene,
  type Slot,
} from "../frise";
import { BOARD_MIN, useBoard } from "../boardState";
import { useBeatText } from "./useBeatText";
import { usePlotColor } from "./usePlotColor";
import { StatusDot, SceneStatusPicker } from "./SceneStatusPicker";
import { PovPicker } from "./PovPicker";
import { SceneIssue } from "./SceneIssue";
import { SceneLinks } from "./LinkedCards";
import { SynopsisField } from "./SynopsisField";

// ---------- État de l'appareil (boardState.ts) ----------

export { BOARD_MIN, useBoard } from "../boardState";

// ---------- Données ----------

/** Rangées (parties du récit), scènes à la suite, longueur totale, rang de l'en-tête de chaque scène d'un scénario. */
export function useFriseData(scope: "whole" | "current" = "whole") {
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => (scope === "current" ? currentScript(s) : s.screenplay));
  const paper = useCosmos((s) => s.paper);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const sceneKey = useMemo(() => planScenes(nodes).join(" "), [nodes]);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.data.title.trim()])), [nodes]);
  return useMemo(() => {
    let rows: FriseRow[];
    let starts = new Map<string, number>();
    if (kind === "scenario") {
      const els = screenplay?.elements ?? [];
      const pagination = paginate(els, LAYOUTS[paper]);
      const pages = (a: number, b: number) => pagesBetween(pagination, a, b);
      if (screenplay && isSeries(screenplay)) rows = screenplayRows(els, pages, "episodes");
      else {
        const { template, custom } = screenplayPlan(els);
        rows = template === "libre" ? screenplayRows(els, pages, "none") : screenplayRows(els, pages, "beats", new Set(templateBeats(template, custom)), (key) => !hasSubBeats(custom, key));
      }
      starts = new Map(blocks(els).filter((b) => b.kind === "scene").map((b) => [b.cardId ?? `@${b.start}`, b.start]));
    } else {
      const ids = sceneKey ? sceneKey.split(" ") : [];
      rows = novelRows(plan, ids, (id) => titles.get(id) ?? "", (id) => countWords(manuscript[id]), WORDS_PER_PAGE);
    }
    const all = rows.flatMap((r) => r.scenes);
    return { rows, all, total: friseTotal(rows), starts, screenplay };
  }, [kind, screenplay, paper, plan, manuscript, sceneKey, titles]);
}

/** Une partie vide garde une place sur la ligne (on y dépose une scène) : une pseudo-scène `part:<rang>`. */
const PART = "part:";
const isPart = (id: string) => id.startsWith(PART);

/** Nom de chaque partie : étape de la structure, chapitre numéroté, épisode, ou ce qui est hors de tout cela. */
function useRowLabel(rows: FriseRow[], all: FriseScene[], screenplay: Screenplay | null) {
  const t = useT();
  const f = t.frise;
  const kind = useCosmos((s) => s.kind);
  const plan = useCosmos((s) => s.plan);
  const beatText = useBeatText();
  const chapterNo = useMemo(() => (kind === "scenario" ? new Map<string, number>() : chapterNumbers(plan, all.map((s) => s.id))), [kind, plan, all]);
  const episodes = useMemo(() => new Map((screenplay ? allEpisodes(screenplay.elements) : []).map((e) => [e.id, e])), [screenplay]);
  return (row: FriseRow): string => {
    if (row.kind === "beat" && row.key) return beatText(row.key).label;
    if (row.kind === "chapter" && row.key) {
      const chapter = plan.chapters?.find((c) => c.id === row.key);
      const n = chapterNo.get(row.key) ?? 0;
      return chapter?.title.trim() ? fmt(t.chapters.numberedTitle, { n, title: chapter.title.trim() }) : fmt(t.chapters.numbered, { n });
    }
    if (row.kind === "episode" && row.key) {
      const ep = episodes.get(row.key);
      if (!ep) return t.season.untitled;
      return ep.title.trim() ? fmt(t.season.episodeTitled, { n: ep.number, title: ep.title.trim() }) : fmt(t.season.episodeNumber, { n: ep.number });
    }
    if (rows.length === 1) return f.whole;
    if (kind === "scenario") return screenplay && isSeries(screenplay) ? t.season.outside : f.beforeFirst;
    return plan.template === "libre" ? f.noChapter : t.plan.unplaced;
  };
}

/** Minutes d'un point de la règle : 1 page ≈ 1 minute d'écran ; pour un roman, le temps de lecture. */
function useClock() {
  const kind = useCosmos((s) => s.kind);
  return (pages: number) => (kind === "scenario" ? pages : (pages * WORDS_PER_PAGE) / WORDS_PER_MINUTE);
}

// ---------- Déplacements ----------

function useMoves(scope: "whole" | "current", beforeMove?: () => void, onMoved?: (id: string) => void) {
  const kind = useCosmos((s) => s.kind);
  const template = useCosmos((s) => s.plan.template);
  const writeScript = (change: (els: ScreenplayElement[]) => ScreenplayElement[]) => {
    beforeMove?.();
    const st = useCosmos.getState();
    const script = scope === "current" ? currentScript(st) : st.screenplay;
    if (!script) return false;
    const next = change(script.elements);
    if (next === script.elements) return false;
    if (scope === "current") st.setScript({ ...script, elements: next }, true);
    else st.setScreenplay({ ...script, elements: next }, true);
    return true;
  };
  const done = (id: string, moved: boolean) => {
    if (moved && !id.startsWith(SCENE_AT)) onMoved?.(id);
  };
  return {
    before: (id: string, target: string) => {
      if (id === target) return;
      const st = useCosmos.getState();
      done(id, kind === "scenario" ? writeScript((els) => moveSceneBefore(els, id, target)) : st.moveBookScene(id, target, "before"));
    },
    toEnd: (id: string, row: FriseRow) => {
      const st = useCosmos.getState();
      let moved = false;
      if (kind === "scenario") moved = writeScript((els) => moveSceneToRowEnd(els, id, { ...row, scenes: row.scenes.filter((s) => !isPart(s.id)) }));
      else if (row.kind === "beat" && row.key) {
        st.placeInPlan(id, row.key);
        moved = true;
      } else if (row.kind === "none" && template !== "libre") {
        st.placeInPlan(id, null);
        moved = true;
      } else {
        const last = row.scenes.filter((s) => s.id !== id && !isPart(s.id)).at(-1);
        if (last) moved = st.moveBookScene(id, last.id, "after");
      }
      done(id, moved);
    },
    step: (id: string, way: -1 | 1) => {
      const st = useCosmos.getState();
      done(id, kind === "scenario" ? writeScript((els) => stepScene(els, id, way < 0 ? "earlier" : "later")) : st.stepBookScene(id, way < 0 ? "up" : "down"));
    },
  };
}

// ---------- La frise ----------

interface BoardProps {
  mode: "plan" | "ribbon";
  /** Ruban : scène du curseur (carte, ou `@<rang>` d'une scène de scénario sans carte). */
  currentId?: string | null;
  /** Ruban : aller à la scène dans le texte. */
  onGo?: (id: string) => void;
  /** Scénario : envoyer au store ce que l'éditeur n'a pas encore rendu, avant de déplacer une scène. */
  beforeMove?: () => void;
}

const LANE_TYPES: CardType[] = ["intrigue", "theme", "personnage", "lieu"];

export function FriseBoard({ mode, currentId = null, onGo, beforeMove }: BoardProps) {
  const t = useT();
  const f = t.frise;
  const p = t.plan;
  const { types, views } = useVocab();
  const lang = useSettings((s) => s.lang);
  const kind = useCosmos((s) => s.kind);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const manuscript = useCosmos((s) => s.manuscript);
  const toggleLink = useCosmos((s) => s.toggleLink);
  const revealCard = useCosmos((s) => s.revealCard);
  const readThread = useCosmos((s) => s.readThread);
  const plotColor = usePlotColor();
  const clock = useClock();
  const scope = mode === "ribbon" ? "current" : "whole";
  const { rows, all, total, starts, screenplay } = useFriseData(scope);
  const rowLabel = useRowLabel(rows, all, screenplay);
  const folded = useBoard((s) => s.folded);
  const toggleFold = useBoard((s) => s.toggleFold);
  const setOpen = useBoard((s) => s.setOpen);

  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragRef = useRef<string | null>(null);
  const refocus = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const px = FRISE_SCALES[scale];

  // Sur la ligne : les scènes, et une place pour chaque partie encore vide.
  const lineRows = useMemo(() => rows.map((r, i) => (r.scenes.length > 0 || r.key === null ? r : { ...r, scenes: [{ id: `${PART}${i}`, title: "", size: 0 }] })), [rows]);
  const placed = useMemo(() => lineRows.flatMap((r) => r.scenes), [lineRows]);
  const { slots, width } = useMemo(() => layoutScenes(placed, px), [placed, px]);
  const bounds = useMemo(() => (rows.length > 1 ? rowStarts(lineRows, slots) : []), [rows.length, lineRows, slots]);
  // Repères au pas que la ligne donne vraiment (les cartes ont une largeur minimale) : px par page en moyenne.
  const marks = useMemo(() => rulerMarks(total, total > 0 ? width / total : px), [total, width, px]);
  const index = useMemo(() => new Map(all.map((s, i) => [s.id, i])), [all]);
  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const order = useMemo(() => all.map((s) => s.id).filter((id) => !id.startsWith(SCENE_AT)), [all]);
  const texts = useMemo(() => (kind === "scenario" && screenplay ? screenplaySceneTexts(screenplay.elements) : manuscript), [kind, screenplay, manuscript]);
  const groups = useMemo(() => timeline(cards, edges, texts, order, lang).filter((g) => LANE_TYPES.includes(g.type) && g.rows.length > 0), [cards, edges, texts, order, lang]);
  const storyCurve = useMemo(() => laneCurve(all, slots, heroIssues(cards)), [all, slots, cards]);

  const active = mode === "ribbon" ? currentId : selected && index.has(selected) ? selected : null;
  const playX = active && slots.get(active) ? slots.get(active)!.x : null;

  const moves = useMoves(scope, beforeMove, (id) => {
    refocus.current = id;
    setTimeout(() => {
      const ids = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-scene-id]") ?? [])].map((el) => el.dataset.sceneId);
      const title = useCosmos.getState().nodes.find((n) => n.id === id)?.data.title.trim() || p.untitled;
      const n = ids.indexOf(id) + 1;
      if (n > 0) setAnnounce(fmt(f.moved, { title, n, total: ids.length }));
    }, 0);
  });
  // Ruban d'un épisode : une scène sans carte n'a pas de rang sûr dans tout le texte, elle ne bouge pas d'ici.
  const movable = (id: string) => !(mode === "ribbon" && id.startsWith(SCENE_AT));

  // Après un déplacement, le focus suit la carte.
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    rootRef.current?.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(id)}"]`)?.focus();
  });

  // Ruban : la scène du curseur reste en vue.
  useEffect(() => {
    if (mode !== "ribbon" || !currentId) return;
    const box = scrollRef.current;
    const card = rootRef.current?.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(currentId)}"]`);
    if (!box || !card) return;
    const head = box.querySelector<HTMLElement>(".frise-lane-head")?.offsetWidth ?? 0;
    const b = box.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    if (c.left < b.left + head || c.right > b.right) box.scrollBy({ left: c.left - b.left - head - 24 });
  }, [mode, currentId, px]);

  const titleOf = (s: FriseScene) => s.title || (byId.get(s.id)?.title.trim() ?? "") || p.untitled;
  const lengthOf = (s: FriseScene) => (kind === "scenario" ? fmt(f.pages, { n: formatEighths(eighthsOf(s.size)) || "0" }) : fmt(f.words, { n: (s.words ?? 0).toLocaleString(lang) }));
  const pick = (id: string) => {
    if (mode === "ribbon") onGo?.(id);
    else setSelected((v) => (v === id ? null : id));
  };
  const focusScene = (id: string | undefined) => {
    if (id) rootRef.current?.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(id)}"]`)?.focus();
  };
  const onCardKey = (e: KeyboardEvent, s: FriseScene) => {
    const i = index.get(s.id) ?? 0;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const way = e.key === "ArrowRight" ? 1 : -1;
      if (e.altKey) {
        if (movable(s.id)) moves.step(s.id, way);
      } else focusScene(all[i + way]?.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusScene(all[0]?.id);
    } else if (e.key === "End") {
      e.preventDefault();
      focusScene(all.at(-1)?.id);
    } else if (e.key === "Escape" && mode === "plan" && selected) {
      setSelected(null);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
    setOver(null);
  };
  const dropHandlers = (key: string, run: (id: string) => void) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      if (over !== key) setOver(key);
    },
    onDragLeave: () => {
      if (over === key) setOver(null);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = dragRef.current;
      endDrag();
      if (id) run(id);
    },
  });
  const rowOfPart = (id: string) => lineRows[Number(id.slice(PART.length))];

  // Règle : un clic ou un glisser va à la scène sous le pointeur, comme la tête de lecture d'un banc de montage.
  const scrubbing = useRef<string | null>(null);
  const scrubAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const id = sceneAtX(all, slots, e.clientX - box.left);
    if (id && id !== scrubbing.current) {
      scrubbing.current = id;
      if (mode === "ribbon") onGo?.(id);
      else setSelected(id);
    }
  };

  const sceneCard = (s: FriseScene) => {
    const slot = slots.get(s.id) as Slot;
    if (isPart(s.id)) {
      const row = rowOfPart(s.id);
      const name = row ? rowLabel(row) : "";
      return (
        <div key={s.id} className={`frise-end${over === s.id ? " is-over" : ""}`} style={{ left: slot.x, width: slot.w }} aria-label={fmt(f.dropEnd, { name })} {...dropHandlers(s.id, (id) => row && moves.toEnd(id, row))}>
          {dragging ? f.dropHere : ""}
        </div>
      );
    }
    const card = byId.get(s.id);
    const look = plotColor(card ? s.id : undefined);
    const n = (index.get(s.id) ?? 0) + 1;
    const title = titleOf(s);
    const length = lengthOf(s);
    const can = movable(s.id);
    return (
      <button
        key={s.id}
        type="button"
        data-scene-id={s.id}
        className={`frise-card${active === s.id ? " is-selected" : ""}${over === s.id ? " is-over" : ""}${look.className}`}
        style={{ left: slot.x, width: cardWidth(s.size, px), ...look.style }}
        aria-current={mode === "ribbon" && active === s.id ? "true" : undefined}
        aria-pressed={mode === "plan" ? active === s.id : undefined}
        aria-label={fmt(f.sceneAria, { n, title, length }) + (look.label ? `. ${look.label}` : "")}
        title={look.label}
        draggable={can}
        onDragStart={(e) => {
          dragRef.current = s.id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", title);
          setDragging(true);
        }}
        onDragEnd={endDrag}
        {...dropHandlers(s.id, (id) => moves.before(id, s.id))}
        onClick={() => pick(s.id)}
        onKeyDown={(e) => onCardKey(e, s)}
      >
        <span className="frise-card-top" aria-hidden="true">
          <span className="frise-num">{n}</span>
          {card && <StatusDot card={card} />}
        </span>
        <span className="frise-card-title" aria-hidden="true">
          {title}
        </span>
        <span className="frise-card-len" aria-hidden="true">
          {length}
        </span>
      </button>
    );
  };

  const trackStyle = { width } as CSSProperties;
  const decor = (
    <>
      {bounds.map((b, i) => (
        <span key={`b${i}`} className="frise-bound" style={{ left: b.x - CARD_GAP / 2 }} aria-hidden="true" />
      ))}
      {playX !== null && <span className="frise-playhead" style={{ left: playX }} aria-hidden="true" />}
    </>
  );
  const totalLabel =
    kind === "scenario"
      ? `${fmt(t.screenplay.minutes, { n: Math.round(total) })} · ${fmt(Math.round(total) === 1 ? t.screenplay.pagesOne : t.screenplay.pagesMany, { n: Math.round(total) })}`
      : `${fmt(p.summaryMany, { n: all.length })} · ${fmt(f.words, { n: all.reduce((a, s) => a + (s.words ?? 0), 0).toLocaleString(lang) })} · ${fmt(f.reading, { time: timecode(clock(total)) })}`;

  return (
    <div className={`frise-board is-${mode}`} ref={rootRef}>
      <div className="frise-tools">
        {mode === "ribbon" && <span className="frise-tools-title">{f.ribbonTitle}</span>}
        <div className="frise-zoom" role="group" aria-label={f.zoomAria}>
          <button type="button" className="icon-button" aria-label={f.zoomOut} title={f.zoomOut} disabled={scale === 0} onClick={() => setScale((v) => Math.max(0, v - 1))}>
            −
          </button>
          <button type="button" className="icon-button" aria-label={f.zoomIn} title={f.zoomIn} disabled={scale === FRISE_SCALES.length - 1} onClick={() => setScale((v) => Math.min(FRISE_SCALES.length - 1, v + 1))}>
            +
          </button>
        </div>
        {all.length > 0 && <span className="frise-total">{totalLabel}</span>}
        {mode === "ribbon" && (
          <button type="button" className="ghost-button frise-shrink" onClick={() => setOpen(false)}>
            {f.shrink}
          </button>
        )}
      </div>
      {all.length === 0 ? (
        <p className="sp-empty">{f.empty}</p>
      ) : (
        <div className="frise-body">
          <div className="frise-scroll" ref={scrollRef}>
            <div className="frise-lanes">
              <div className="frise-lane is-ruler">
                <div className="frise-lane-head">{kind === "scenario" ? f.rulerScript : f.rulerNovel}</div>
                <div
                  className="frise-lane-track frise-ruler"
                  style={trackStyle}
                  title={f.rulerHint}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest(".frise-bound-label")) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    scrubbing.current = null;
                    scrubAt(e);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId)) scrubAt(e);
                  }}
                  onPointerUp={() => {
                    scrubbing.current = null;
                  }}
                >
                  {bounds.map((b, i) => {
                    const row = lineRows.find((r) => r.key === b.key && r.kind === b.kind);
                    const name = row ? rowLabel(row) : "";
                    const next = bounds[i + 1]?.x ?? width + 400;
                    return (
                      <span key={`l${i}`} className={`frise-bound-label${over === `row:${i}` ? " is-over" : ""}`} style={{ left: b.x, maxWidth: Math.max(24, next - b.x - 8) }} title={name} {...(row ? dropHandlers(`row:${i}`, (id) => moves.toEnd(id, row)) : {})}>
                        {name}
                      </span>
                    );
                  })}
                  {marks.map((m) => {
                    const x = pageToX(all, slots, m.page);
                    return m.major ? (
                      <span key={m.page} className="frise-tick is-major" style={{ left: x }} aria-hidden="true">
                        <span className="frise-tick-page">{fmt(f.page, { n: Math.round(m.page) + 1 })}</span>
                        <span className="frise-tick-time">{timecode(clock(m.page))}</span>
                      </span>
                    ) : (
                      <span key={m.page} className="frise-tick" style={{ left: x }} aria-hidden="true" />
                    );
                  })}
                  {playX !== null && <span className="frise-playhead is-head" style={{ left: playX }} aria-hidden="true" />}
                </div>
              </div>
              <div className="frise-lane is-scenes">
                <div className="frise-lane-head">{f.lanes.scenes}</div>
                <div className="frise-lane-track" style={trackStyle}>
                  {decor}
                  {placed.map(sceneCard)}
                </div>
              </div>
              {storyCurve && (
                <div className="frise-lane is-curve">
                  <div className="frise-lane-head">{f.lanes.story}</div>
                  <div className="frise-lane-track" style={trackStyle}>
                    {decor}
                    <Curve points={storyCurve} width={width} label={f.lanes.story} />
                  </div>
                </div>
              )}
              {groups.length === 0 && <p className="sp-empty frise-hint">{f.lanes.noCards}</p>}
              {groups.map((g) => {
                const closed = folded.includes(g.type);
                const name = types[g.type].section;
                return (
                  <section key={g.type} className="frise-lane-group" aria-label={name}>
                    <h3 className="frise-lane-group-title">
                      <button type="button" aria-expanded={!closed} onClick={() => toggleFold(g.type)}>
                        <span className={`disclosure${closed ? "" : " is-open"}`} aria-hidden="true" />
                        {name}
                        <span className="frise-group-count">{g.rows.length}</span>
                      </button>
                    </h3>
                    {!closed &&
                      g.rows.map((row) => {
                        const curve = g.type === "personnage" ? laneCurve(all, slots, characterIssues(cards, row.card.id, row.card.fiche?.principal === "oui")) : null;
                        const label = row.card.title.trim() || p.untitled;
                        return (
                          <div key={row.card.id} className={`frise-lane${curve ? " has-curve" : ""}`}>
                            <div className="frise-lane-head">
                              <button type="button" className="tl-card" title={fmt(p.show, { title: label })} onClick={() => revealCard(row.card.id)}>
                                <span className="card-dot" style={{ background: typeColor(g.type) }} />
                                {label}
                              </button>
                              <span className="tl-count">{row.count}</span>
                              {row.count > 0 && (
                                <button type="button" className="icon-button tl-read" aria-label={fmt(t.thread.readOf, { title: label })} title={fmt(t.thread.readOf, { title: label })} onClick={() => readThread(row.card.id)}>
                                  <ReadIcon />
                                </button>
                              )}
                            </div>
                            <div className="frise-lane-track" style={trackStyle}>
                              {decor}
                              {curve && <Curve points={curve} width={width} label={fmt(f.lanes.curveOf, { name: label })} />}
                              {row.cells.map((cell, i) => {
                                const slot = slots.get(order[i]);
                                if (!slot) return null;
                                const names = { card: label, scene: byId.get(order[i])?.title.trim() || p.untitled };
                                const style = { left: slot.x, width: slot.w };
                                if (cell === "pov")
                                  return (
                                    <span key={order[i]} className="tl-cell frise-cell is-pov" style={style} role="img" aria-label={fmt(p.timelinePovCell, names)} title={fmt(p.timelinePovCell, names)}>
                                      <span className="tl-mark is-pov" aria-hidden="true" />
                                    </span>
                                  );
                                return (
                                  <button
                                    key={order[i]}
                                    type="button"
                                    className={`tl-cell frise-cell is-${cell}`}
                                    style={style}
                                    aria-pressed={cell === "linked"}
                                    aria-label={fmt(cell === "linked" ? p.timelineOn : cell === "cited" ? p.timelineCitedCell : p.timelineOff, names)}
                                    onClick={() => toggleLink(order[i], row.card.id)}
                                  >
                                    <span className={`tl-mark is-${cell}`} aria-hidden="true" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </section>
                );
              })}
            </div>
          </div>
          {mode === "plan" && active && (
            <FrisePanel
              key={active}
              id={active}
              start={starts.get(active)}
              writeView={views.manuscrit}
              onStep={(way) => {
                if (movable(active)) moves.step(active, way);
              }}
              onClose={() => {
                setSelected(null);
                focusScene(active);
              }}
            />
          )}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

/** Courbe « mieux / pire » posée dans une piste : milieu de chaque scène, de −1 (en bas) à 1 (en haut). */
function Curve({ points, width, label }: { points: CurvePoint[]; width: number; label: string }) {
  const h = 40;
  const y = (v: number) => h / 2 - v * (h / 2 - 5);
  const d = points.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${y(pt.y).toFixed(1)}`).join(" ");
  return (
    <svg className="frise-curve" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={label}>
      <line x1={0} x2={width} y1={h / 2} y2={h / 2} className="frise-curve-zero" />
      <path d={d} className="frise-curve-line" />
      {points
        .filter((pt) => pt.set)
        .map((pt) => (
          <circle key={pt.id} cx={pt.x} cy={y(pt.y)} r={3} className="frise-curve-dot" />
        ))}
    </svg>
  );
}

// ---------- La scène : fiche commune au volet de gauche (ruban agrandi) et au volet de la frise du Plan ----------

/** Rang, longueur, page et part du récit d'une scène, lus dans la frise. */
function useScenePlace(id: string, scope: "whole" | "current") {
  const { all, total, starts } = useFriseData(scope);
  const kind = useCosmos((s) => s.kind);
  const lang = useSettings((s) => s.lang);
  const f = useT().frise;
  return useMemo(() => {
    const i = all.findIndex((s) => s.id === id);
    if (i < 0) return null;
    const before = all.slice(0, i).reduce((a, s) => a + s.size, 0);
    const s = all[i];
    return {
      n: i + 1,
      total: all.length,
      page: Math.floor(before) + 1,
      share: total > 0 ? Math.round((before / total) * 100) : 0,
      length: kind === "scenario" ? fmt(f.pages, { n: formatEighths(eighthsOf(s.size)) || "0" }) : fmt(f.words, { n: (s.words ?? 0).toLocaleString(lang) }),
      start: starts.get(id),
      title: s.title,
    };
  }, [all, total, starts, id, kind, lang, f]);
}

/** Fiche de la scène : rang et place, statut, point de vue, synopsis, fin de scène, ce qui lui est relié. */
export function SceneSheet({ id, scope = "whole", children }: { id: string; scope?: "whole" | "current"; children?: ReactNode }) {
  const t = useT();
  const f = t.frise;
  const kind = useCosmos((s) => s.kind);
  const card = useCosmos((s) => s.nodes.find((x) => x.id === id)?.data) as CardData | undefined;
  const screenplay = useCosmos((s) => (scope === "current" ? currentScript(s) : s.screenplay));
  const place = useScenePlace(id, scope);
  const title = card?.title.trim() || place?.title || t.plan.untitled;
  const start = place?.start;
  const synopsis = kind === "scenario" ? (start !== undefined && screenplay ? sceneSynopsis(screenplay.elements, start) : "") : card?.fiche?.synopsis ?? "";
  return (
    <div className="frise-sheet">
      {place && (
        <p className="frise-panel-kicker">
          {fmt(f.panel.kicker, { n: place.n, total: place.total })} · {place.length} · {fmt(f.panel.position, { page: place.page, pct: place.share })}
        </p>
      )}
      <h2 className="frise-panel-title">{title}</h2>
      {card ? (
        <>
          <div className="scene-pills">
            <SceneStatusPicker card={card} />
            <PovPicker card={card} />
          </div>
          <div className="frise-panel-field">
            <span className="frise-panel-label">{f.panel.synopsis}</span>
            <SynopsisField value={synopsis} scene={title} onSave={(v) => (kind === "scenario" ? useCosmos.getState().setCardSceneSynopsis(id, v) : useCosmos.getState().setFiche(id, "synopsis", v))} />
          </div>
          <SceneIssue card={card} />
          <SceneLinks id={id} />
        </>
      ) : (
        <p className="sp-empty">{f.panel.noCard}</p>
      )}
      {children}
    </div>
  );
}

/** Volet de la frise du Plan et du séquencier : la fiche, puis « Plus tôt », « Plus tard » et les chemins vers les autres vues. */
function FrisePanel({ id, start, writeView, onStep, onClose }: { id: string; start?: number; writeView: string; onStep: (way: -1 | 1) => void; onClose: () => void }) {
  const t = useT();
  const f = t.frise;
  const card = useCosmos((s) => s.nodes.some((x) => x.id === id));
  const place = useScenePlace(id, "whole");
  const target = card ? id : start !== undefined ? `${SCENE_AT}${start}` : null;
  return (
    <aside className="frise-panel" aria-label={f.panel.aria} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" className="icon-button frise-panel-close" aria-label={f.panel.close} title={f.panel.close} onClick={onClose}>
        ×
      </button>
      <SceneSheet id={id}>
        <div className="frise-panel-actions">
          <button type="button" className="ghost-button" disabled={!place || place.n <= 1} onClick={() => onStep(-1)}>
            ← {f.panel.earlier}
          </button>
          <button type="button" className="ghost-button" disabled={!place || place.n >= place.total} onClick={() => onStep(1)}>
            {f.panel.later} →
          </button>
        </div>
        <div className="frise-panel-actions">
          {card && (
            <button type="button" className="ghost-button" onClick={() => useCosmos.getState().revealCard(id)}>
              {f.panel.showCanvas}
            </button>
          )}
          {target && (
            <button type="button" className="ghost-button" onClick={() => useCosmos.getState().openInManuscript(target)}>
              {fmt(f.panel.open, { view: writeView })}
            </button>
          )}
        </div>
      </SceneSheet>
    </aside>
  );
}

// ---------- Ruban agrandi : la frise au-dessus du texte, et le séparateur qui règle sa hauteur ----------

/** Le ruban agrandi d'une vue d'écriture : la frise, puis un séparateur à tirer (souris, doigt, flèches du clavier). */
export function RibbonBoard({ currentId, onGo, beforeMove }: { currentId: string | null; onGo: (id: string) => void; beforeMove?: () => void }) {
  const f = useT().frise;
  const height = useBoard((s) => s.height);
  const setHeight = useBoard((s) => s.setHeight);
  const interactive = useInteractive();
  const start = useRef<{ y: number; h: number } | null>(null);
  if (interactive) return null;
  const max = typeof window === "undefined" ? 800 : Math.max(BOARD_MIN, Math.round(window.innerHeight * 0.75));
  const h = Math.min(height, max);
  return (
    <div className="frise-ribbon">
      <div className="frise-ribbon-box" style={{ height: h }}>
        <FriseBoard mode="ribbon" currentId={currentId} onGo={onGo} beforeMove={beforeMove} />
      </div>
      <div
        className="frise-splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-label={f.splitter}
        aria-valuemin={BOARD_MIN}
        aria-valuemax={max}
        aria-valuenow={h}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, h };
        }}
        onPointerMove={(e) => {
          if (start.current) setHeight(Math.min(max, start.current.h + e.clientY - start.current.y));
        }}
        onPointerUp={() => {
          start.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setHeight(Math.min(max, h + (e.key === "ArrowDown" ? 40 : -40)));
          }
        }}
      >
        <span className="frise-splitter-grip" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Icône « lire » : un livre ouvert (comme l'ancienne chronologie). */
function ReadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5V19.5" />
    </svg>
  );
}
