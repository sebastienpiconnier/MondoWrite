// La frise (#173) : le récit sur une ligne de montage. Chaque carte est une scène, sa largeur suit sa longueur
// (pages d'un scénario, mots d'un roman ramenés en pages) ; dessous, une piste par intrigue, thème, personnage et lieu
// ou décor (le ruban agrandi a aussi la courbe du récit ; au Plan, elle est dans Statistiques › Courbes). Deux places :
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
  FRISE_ZOOMS,
  ribbonLevels,
  zoomLine,
  friseTotal,
  layoutScenes,
  laneCurve,
  moveSceneBefore,
  moveSceneToRowEnd,
  novelRows,
  pageToX,
  spacedOut,
  spreadCurves,
  rowStarts,
  rulerMarks,
  sceneAtX,
  screenplayRows,
  stepScene,
  timecode,
  type FriseRow,
  type FriseScene,
  type LineFit,
  type Slot,
} from "../frise";
import { BOARD_MIN, useBoard } from "../boardState";
import { characterColors, plotColors } from "../plotColors";
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
  /** Ruban : scène en cours (carte, ou `@<rang>` d'une scène de scénario sans carte). */
  currentId?: string | null;
  /** Ruban : part de la scène en cours déjà passée dans le texte qui défile (0 à 1), pour la tête de lecture. */
  progress?: number;
  /** Ruban : aller à la scène dans le texte. */
  onGo?: (id: string) => void;
  /** Scénario : envoyer au store ce que l'éditeur n'a pas encore rendu, avant de déplacer une scène. */
  beforeMove?: () => void;
}

const LANE_TYPES: CardType[] = ["intrigue", "theme", "personnage", "lieu"];
/** Écart minimal entre deux valeurs écrites de la règle. */
const LABEL_ROOM = 110;

export function FriseBoard({ mode, currentId = null, progress = 0, onGo, beforeMove }: BoardProps) {
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

  const ribbon = mode === "ribbon";
  // Zoom. Plan : rang dans FRISE_ZOOMS. Ruban agrandi : écart au cran « Toute la largeur » dans `ribbonLevels`
  // (gardé sur l'appareil), toujours du plus serré au plus large.
  const boardZoom = useBoard((s) => s.zoom);
  const setBoardZoom = useBoard((s) => s.setZoom);
  const [planScale, setPlanScale] = useState(DEFAULT_SCALE);
  const [room, setRoom] = useState(0);
  const [peek, setPeek] = useState<string | null>(null);
  const peekTimer = useRef<number>(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragRef = useRef<string | null>(null);
  const refocus = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sur la ligne : les scènes, et une place pour chaque partie encore vide.
  const lineRows = useMemo(() => rows.map((r, i) => (r.scenes.length > 0 || r.key === null ? r : { ...r, scenes: [{ id: `${PART}${i}`, title: "", size: 0 }] })), [rows]);
  const placed = useMemo(() => lineRows.flatMap((r) => r.scenes), [lineRows]);
  const ribbonZoom = useMemo(() => (ribbon ? ribbonLevels(placed, room) : null), [ribbon, placed, room]);
  // Cran en cours : borné aux crans du moment (la place disponible change avec la fenêtre).
  const level = ribbonZoom ? Math.min(ribbonZoom.levels.length - 1, Math.max(0, ribbonZoom.fit + boardZoom)) : planScale;
  const maxLevel = ribbonZoom ? ribbonZoom.levels.length - 1 : FRISE_ZOOMS.length - 1;
  const setLevel = (next: number) => (ribbonZoom ? setBoardZoom(next - ribbonZoom.fit) : setPlanScale(next));
  // Toute la largeur ou plus serré : la ligne tient sans défiler de côté.
  const fitting = !!ribbonZoom && level <= ribbonZoom.fit;
  const planLine = zoomLine(planScale);
  const current = ribbonZoom?.levels[level];
  const line: LineFit = current ? { min: current.min, gap: current.gap } : { min: planLine.min };
  const px = current ? current.px : planLine.px;
  const { slots, width } = useMemo(() => layoutScenes(placed, px, line), [placed, px, line.min, line.gap]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => (rows.length > 1 ? rowStarts(lineRows, slots) : []), [rows.length, lineRows, slots]);
  // Règle : pages d'un roman, minutage d'un scénario. Repères placés sur la vraie ligne (les cartes ont une largeur
  // minimale), puis espacés : quelques valeurs lisibles, de petits traits entre elles.
  const marks = useMemo(() => {
    const all2 = rulerMarks(total, total > 0 ? Math.max(1, width / total) : 16, LABEL_ROOM).map((m) => ({ ...m, x: pageToX(all, slots, m.page) }));
    const labels = spacedOut(all2.filter((m) => m.major), LABEL_ROOM);
    const keep = new Set(labels.map((m) => m.page));
    const ticks = spacedOut(all2.filter((m) => !keep.has(m.page)), 10);
    return [...ticks.map((m) => ({ ...m, major: false })), ...labels];
  }, [total, width, all, slots]);
  const index = useMemo(() => new Map(all.map((s, i) => [s.id, i])), [all]);
  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const order = useMemo(() => all.map((s) => s.id).filter((id) => !id.startsWith(SCENE_AT)), [all]);
  const texts = useMemo(() => (kind === "scenario" && screenplay ? screenplaySceneTexts(screenplay.elements) : manuscript), [kind, screenplay, manuscript]);
  const groups = useMemo(() => timeline(cards, edges, texts, order, lang).filter((g) => (ribbon ? g.type === "intrigue" || g.type === "personnage" : LANE_TYPES.includes(g.type)) && g.rows.length > 0), [cards, edges, texts, order, lang, ribbon]);
  // Courbe du récit : seulement dans le ruban agrandi (au Plan et au séquencier, elle est dans Statistiques › Courbes).
  const storyCurve = useMemo(() => (ribbon ? laneCurve(all, slots, heroIssues(cards)) : null), [ribbon, all, slots, cards]);
  // Ruban agrandi : une couleur par intrigue et par personnage (choisie dans sa fiche, sinon attribuée).
  const plotHues = useMemo(() => plotColors(nodes, edges).plots, [nodes, edges]);
  const charHues = useMemo(() => characterColors(nodes), [nodes]);
  // Ruban agrandi : la courbe du récit seule. Celles des personnages sont dans Statistiques › Courbes, en score cumulé.
  const curveSet = useMemo(() => (ribbon && storyCurve ? [{ id: "", label: f.lanes.story, color: "var(--accent)", points: storyCurve }] : []), [ribbon, storyCurve, f.lanes.story]);
  // Ruban agrandi : intrigues, puis personnages (les principaux d'abord, ceux qui ont au moins une scène).
  const ribbonPlots = useMemo(() => groups.find((g) => g.type === "intrigue")?.rows ?? [], [groups]);
  const ribbonChars = useMemo(() => {
    const rows = (groups.find((g) => g.type === "personnage")?.rows ?? []).filter((r) => r.count > 0 || r.card.fiche?.principal === "oui");
    return [...rows.filter((r) => r.card.fiche?.principal === "oui"), ...rows.filter((r) => r.card.fiche?.principal !== "oui")];
  }, [groups]);

  // Largeur disponible pour la ligne (zoom « toute la largeur »).
  useEffect(() => {
    const box = scrollRef.current;
    if (!ribbon || !box) return;
    const measure = () => {
      const head = box.querySelector<HTMLElement>(".frise-lane-head")?.offsetWidth ?? 0;
      setRoom(Math.max(0, box.clientWidth - head - 24));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [ribbon, all.length]);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);
  const showPeek = (name: string, touch = false) => {
    setPeek(name);
    window.clearTimeout(peekTimer.current);
    if (touch) peekTimer.current = window.setTimeout(() => setPeek(null), 4000);
  };

  const active = mode === "ribbon" ? currentId : selected && index.has(selected) ? selected : null;
  const activeSlot = active ? slots.get(active) : undefined;
  // Tête de lecture : au début de la scène choisie (Plan), à la place du texte qui défile (ruban agrandi).
  const playX = activeSlot ? activeSlot.x + (ribbon ? Math.min(1, Math.max(0, progress)) * activeSlot.w : 0) : null;

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

  // Ruban : la ligne défile avec le texte, la tête de lecture reste au milieu (comme sur un banc de montage). Le
  // ruban qu'on fait défiler à la main reste où on l'a mis, jusqu'à ce que le texte bouge.
  useEffect(() => {
    if (!ribbon || playX === null) return;
    const box = scrollRef.current;
    if (!box) return;
    const head = box.querySelector<HTMLElement>(".frise-lane-head")?.offsetWidth ?? 0;
    const view = box.clientWidth - head;
    // La piste commence après la tête de piste et sa marge de 10 px.
    box.scrollLeft = Math.max(0, 10 + playX - view / 2);
  }, [ribbon, playX]);

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
        className={`frise-card${active === s.id ? " is-selected" : ""}${over === s.id ? " is-over" : ""}${slot.w < 72 ? " is-narrow" : ""}${slot.w < 26 ? " is-tiny" : ""}${look.className}`}
        style={{ left: slot.x, width: slot.w, ...look.style }}
        aria-current={mode === "ribbon" && active === s.id ? "true" : undefined}
        aria-pressed={mode === "plan" ? active === s.id : undefined}
        aria-label={fmt(f.sceneAria, { n, title, length }) + (look.label ? `. ${look.label}` : "")}
        title={slot.w < 72 ? [title, look.label].filter(Boolean).join(" · ") : look.label}
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
  const gap = line.gap ?? CARD_GAP;
  const decor = (
    <>
      {bounds.map((b, i) => (
        <span key={`b${i}`} className="frise-bound" style={{ left: b.x - gap / 2 }} aria-hidden="true" />
      ))}
      {playX !== null && <span className="frise-playhead" style={{ left: playX }} aria-hidden="true" />}
    </>
  );
  const pagesTotal = Math.round(total);
  const totalLabel =
    kind === "scenario"
      ? `${fmt(t.screenplay.minutes, { n: pagesTotal })} · ${fmt(pagesTotal === 1 ? t.screenplay.pagesOne : t.screenplay.pagesMany, { n: pagesTotal })}`
      : `${fmt(p.summaryMany, { n: all.length })} · ${fmt(f.words, { n: all.reduce((a, s) => a + (s.words ?? 0), 0).toLocaleString(lang) })} · ${fmt(f.pages, { n: pagesTotal })}`;
  // Une seule unité par règle : les pages d'un roman, le minutage d'un scénario.
  const markLabel = (page: number) => (kind === "scenario" ? timecode(clock(page)) : fmt(f.page, { n: Math.round(page) + 1 }));
  const zoomOutLabel = ribbonZoom && level - 1 === ribbonZoom.fit ? f.zoomFit : f.zoomOut;

  // Ruban agrandi : titre repliable d'un groupe de pistes (courbe, intrigues, personnages), gardé sur l'appareil.
  const groupHead = (key: string, name: string, count?: number) => {
    const closed = folded.includes(key);
    return (
      <h3 key={`h${key}`} className="frise-lane-group-title is-ribbon">
        <button type="button" aria-expanded={!closed} onClick={() => toggleFold(key)}>
          <span className={`disclosure${closed ? "" : " is-open"}`} aria-hidden="true" />
          {name}
          {count !== undefined && <span className="frise-group-count">{count}</span>}
        </button>
      </h3>
    );
  };
  // Une intrigue ou un personnage : une ligne fine, un trait de sa couleur sous chaque scène reliée (plus pâle si
  // elle le nomme seulement ; plein pour une scène qu'il raconte). Toucher un trait tire ou retire le fil.
  const markLane = (row: { card: CardData; cells: string[] }, hue: number | undefined, fallback: string) => {
    const label = row.card.title.trim() || p.untitled;
    return (
      <div key={row.card.id} className="frise-lane is-plot" style={{ "--lane": hue ? `var(--plot-${hue})` : fallback } as CSSProperties}>
        <div className="frise-lane-head">
          <button type="button" className="frise-plot-name" title={fmt(t.thread.readOf, { title: label })} onClick={() => readThread(row.card.id)}>
            {label}
          </button>
        </div>
        <div className="frise-lane-track" style={trackStyle}>
          {playX !== null && <span className="frise-playhead" style={{ left: playX }} aria-hidden="true" />}
          {row.cells.map((cell, i) => {
            const slot = slots.get(order[i]);
            if (!slot) return null;
            const names = { card: label, scene: byId.get(order[i])?.title.trim() || p.untitled };
            if (cell === "pov")
              return (
                <span key={order[i]} className="frise-plot-cell is-linked" style={{ left: slot.x, width: slot.w + gap }} role="img" aria-label={fmt(p.timelinePovCell, names)} title={fmt(p.timelinePovCell, names)}>
                  <span className="frise-plot-mark" style={{ width: slot.w }} aria-hidden="true" />
                </span>
              );
            return (
              <button
                key={order[i]}
                type="button"
                className={`frise-plot-cell is-${cell}`}
                style={{ left: slot.x, width: slot.w + gap }}
                aria-pressed={cell === "linked"}
                aria-label={fmt(cell === "linked" ? p.timelineOn : cell === "cited" ? p.timelineCitedCell : p.timelineOff, names)}
                onClick={() => toggleLink(order[i], row.card.id)}
              >
                <span className="frise-plot-mark" style={{ width: slot.w }} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`frise-board is-${mode}${fitting ? " is-fit" : ""}`} ref={rootRef}>
      <div className="frise-tools">
        {ribbon && <span className="frise-tools-title">{f.ribbonTitle}</span>}
        <div className="frise-zoom" role="group" aria-label={f.zoomAria}>
          <button type="button" className="icon-button" aria-label={zoomOutLabel} title={zoomOutLabel} disabled={level <= 0} onClick={() => setLevel(Math.max(0, level - 1))}>
            −
          </button>
          <button type="button" className="icon-button" aria-label={f.zoomIn} title={f.zoomIn} disabled={level >= maxLevel} onClick={() => setLevel(Math.min(maxLevel, level + 1))}>
            +
          </button>
        </div>
        {all.length > 0 && (
          <span className={`frise-total${peek ? " is-peek" : ""}`} aria-live={ribbon ? "polite" : undefined}>
            {peek ?? totalLabel}
          </span>
        )}
        {ribbon && (
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
              {/* Règle et scènes restent en haut : les pistes qui défilent verticalement passent dessous. */}
              <div className="frise-pin">
              <div className="frise-lane is-ruler">
                <div className="frise-lane-head">{kind === "scenario" ? f.rulerScript : f.rulerNovel}</div>
                <div
                  className="frise-lane-track frise-ruler"
                  style={trackStyle}
                  title={f.rulerHint}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest(".frise-bound-label, .frise-jalon")) return;
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
                    const drop = row ? dropHandlers(`row:${i}`, (id) => moves.toEnd(id, row)) : {};
                    // Ruban agrandi : un jalon coiffé d'un triangle, son nom au survol ou au toucher (comme le petit ruban).
                    if (ribbon)
                      return (
                        <button
                          key={`l${i}`}
                          type="button"
                          className={`frise-jalon${over === `row:${i}` ? " is-over" : ""}${peek === name ? " is-peeked" : ""}`}
                          style={{ left: b.x - gap / 2 }}
                          aria-label={name}
                          onMouseEnter={() => showPeek(name)}
                          onMouseLeave={() => setPeek(null)}
                          onFocus={() => showPeek(name)}
                          onBlur={() => setPeek(null)}
                          onClick={() => showPeek(name, true)}
                          {...drop}
                        />
                      );
                    const next = bounds[i + 1]?.x ?? width + 400;
                    return (
                      <span key={`l${i}`} className={`frise-bound-label${over === `row:${i}` ? " is-over" : ""}`} style={{ left: b.x, maxWidth: Math.max(24, next - b.x - 8) }} title={name} {...drop}>
                        {name}
                      </span>
                    );
                  })}
                  {marks.map((m) =>
                    m.major ? (
                      <span key={`M${m.page}`} className="frise-tick is-major" style={{ left: m.x }} aria-hidden="true">
                        {markLabel(m.page)}
                      </span>
                    ) : (
                      <span key={`m${m.page}`} className="frise-tick" style={{ left: m.x }} aria-hidden="true" />
                    ),
                  )}
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
              </div>
              {ribbon ? (
                <>
                  {curveSet.length > 0 && (
                    <>
                      {groupHead("r:curve", f.lanes.showCurve)}
                      {!folded.includes("r:curve") && (
                        <div className="frise-lane is-curve">
                          <div className="frise-lane-head frise-curve-key">
                            {curveSet.map((c) => (
                              <span key={c.id || "story"} className="frise-curve-name" style={{ "--curve": c.color } as CSSProperties}>
                                {c.label}
                              </span>
                            ))}
                          </div>
                          <div className="frise-lane-track" style={trackStyle}>
                            {decor}
                            <CurveSet curves={curveSet} width={width} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {ribbonPlots.length > 0 && groupHead("r:plots", f.lanes.plots, ribbonPlots.length)}
                  {!folded.includes("r:plots") && ribbonPlots.map((row) => markLane(row, plotHues.get(row.card.id), "var(--type-intrigue)"))}
                  {ribbonChars.length > 0 && groupHead("r:chars", f.lanes.characters, ribbonChars.length)}
                  {!folded.includes("r:chars") && ribbonChars.map((row) => markLane(row, charHues.get(row.card.id), "var(--type-personnage)"))}
                </>
              ) : null}
              {groups.length === 0 && !ribbon && <p className="sp-empty frise-hint">{f.lanes.noCards}</p>}
              {!ribbon &&
                groups.map((g) => {
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
                          const label = row.card.title.trim() || p.untitled;
                          return (
                            <div key={row.card.id} className="frise-lane">
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

/** Ruban agrandi : la courbe du récit, étalée à l'étendue qu'elle atteint vraiment (la progression se voit même si le
 * récit ne descend jamais sous zéro). */
function CurveSet({ curves, width }: { curves: { id: string; label: string; color: string; points: CurvePoint[] }[]; width: number }) {
  const h = 64;
  const { scale, zero } = spreadCurves(curves.map((c) => c.points));
  const y = (v: number) => h - 6 - scale(v) * (h - 12);
  return (
    <svg className="frise-curve is-set" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={curves.map((c) => c.label).join(", ")}>
      {zero !== null && <line x1={0} x2={width} y1={h - 6 - zero * (h - 12)} y2={h - 6 - zero * (h - 12)} className="frise-curve-zero" />}
      {curves.map((c, i) => (
        <g key={c.id || "story"} style={{ "--curve": c.color } as CSSProperties} className="is-story">
          <path d={c.points.map((pt, k) => `${k === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${y(pt.y).toFixed(1)}`).join(" ")} className="frise-curve-line" />
          {c.points
            .filter((pt) => pt.set)
            .map((pt) => (
              <circle key={pt.id} cx={pt.x} cy={y(pt.y)} r={i === 0 && !c.id ? 3 : 2.5} className="frise-curve-dot" />
            ))}
        </g>
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
export function RibbonBoard({ currentId, progress, onGo, beforeMove }: { currentId: string | null; progress?: number; onGo: (id: string) => void; beforeMove?: () => void }) {
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
      <div className="frise-ribbon-box" style={{ maxHeight: h }}>
        <FriseBoard mode="ribbon" currentId={currentId} progress={progress} onGo={onGo} beforeMove={beforeMove} />
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
