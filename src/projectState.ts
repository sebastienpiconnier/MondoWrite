// Modèle des nœuds du canevas et passage projet sur disque <-> état du store (fonctions pures).
// Séparé de store.ts pour garder celui-ci centré sur les actions. Rien ici ne lit ni n'écrit l'état.

import { readWires, wiresToMeta } from "./wires";
import { foldNovelNodes, foldScreenplayNotes } from "./sceneNotes";
import { renamedZone } from "./research";
import { authorName, contactLines } from "./profile";
import type { TrashedCard } from "./trash";
import { type Edge, type Node } from "@xyflow/react";
import { nanoid } from "nanoid";
import { isProjectKind, type CardData, type Frame, type Project, type ProjectKind } from "./types";
import type { Screenplay } from "./screenplay/model";
import { defaultPaper, isPaper, type Paper } from "./screenplay/layout";
import { useSettings } from "./settings";
import { CARD_SIZE, firstFreeCell, type Box } from "./placement";
import { adoptPitchEpisodes } from "./episodes";
import { type Manuscript } from "./manuscript";
import { readGoals, readProgress, type Goals, type Progress } from "./stats";
import { addQuestion, legacyParkedCards } from "./character";
import { isBeat, isEmptyPlan, prunePlan, readPlan, type Plan } from "./plan";
import { storyScenes } from "./book";
import { isEmptyPitch, readPitch, type Pitch } from "./pitch";
import { readChutier, type Passage } from "./chutier";
import { cleanPrint, printToMeta, type PrintOptions } from "./export/printOptions";
import { bibleExportToMeta, cleanBibleExport, type BibleExportState } from "./bibleExport";
import { cleanScriptPrint, scriptPrintToMeta, type ScriptPrint } from "./screenplay/export/scriptPrint";
import { writeTitleField } from "./screenplay/titlePage";
import { headingTitles, initialScreenplay, type SceneCard } from "./screenplay/link";
import { DICTIONARIES, getT } from "./i18n";
import { allQuestionTexts, extractAnswers } from "./assistant";

export type CardNode = Node<CardData, "card">;
/** Cadre de regroupement sur le canevas. Tenu à part des cartes : toutes les vues lisent `nodes` sans s'en soucier. */
export type FrameNode = Node<{ title: string; kind?: "research"; locked?: boolean; beat?: string }, "frame">;

export const FRAME_SIZE = { width: 520, height: 360 };
/** Marge autour des cartes qu'un cadre entoure (plus haute en tête, pour son titre). */
export const FRAME_PADDING = { side: 32, top: 64, bottom: 32 };

export const toFrameNode = (frame: Frame): FrameNode => ({
  id: frame.id,
  type: "frame",
  position: { x: frame.x, y: frame.y },
  data: { title: frame.title, ...(frame.kind === "research" ? { kind: "research" as const } : {}), ...(frame.locked ? { locked: true } : {}), ...(frame.beat ? { beat: frame.beat } : {}) },
  width: frame.width,
  height: frame.height,
  // Derrière les cartes ; l'intérieur laisse passer les clics (voir styles.css).
  zIndex: -1,
  dragHandle: ".frame-handle",
  ...lockProps(frame.locked === true),
});

/** Un cadre verrouillé ne se déplace ni ne se supprime au clavier (React Flow). */
export const lockProps = (locked: boolean) => ({ draggable: !locked, deletable: !locked });

export const frameBox = (f: FrameNode): Box => ({
  x: f.position.x,
  y: f.position.y,
  width: f.width ?? f.measured?.width ?? FRAME_SIZE.width,
  height: f.height ?? f.measured?.height ?? FRAME_SIZE.height,
});
/** « carnet » : le Carnet du téléphone (capture, boîte de réception) ; sur un écran plus large, c'est le canevas. */
export type View = "toile" | "plan" | "bible" | "manuscrit" | "carnet";
export type SaveStatus = "enregistre" | "modifie" | "enregistrement" | "erreur";

export const CARD_WIDTH = 240;

export const newId = () => nanoid(10);

/** Même carte si son texte ne change pas (les mentions ne touchent que les cartes concernées). */
export const withHtml = (node: CardNode, html: string): CardNode => (html === node.data.html ? node : { ...node, data: { ...node.data, html } });

export const toNode = (card: CardData, x: number, y: number, width = CARD_WIDTH): CardNode => ({
  id: card.id,
  type: "card",
  position: { x, y },
  data: card,
  style: { width },
  // L'en-tête et l'image déplacent la carte (le titre et le texte restent des zones d'écriture).
  dragHandle: ".card-handle, .card-image",
});

export function fromProject(p: Project) {
  const pos = new Map(p.meta.layout.map((l) => [l.id, l]));
  const nodes = p.cards.map((c, i) => {
    const l = pos.get(c.id);
    return toNode(c, l?.x ?? 80 + (i % 5) * 280, l?.y ?? 80 + Math.floor(i / 5) * 220, l?.width);
  });
  // Fiches des fils (lot 7), rangées dans le fil lui-même pendant le travail.
  const wires = readWires((p.meta as { wires?: unknown }).wires, new Set(p.meta.links.map((l) => l.id)));
  const edges: Edge[] = p.meta.links.map((l) => ({ id: l.id, source: l.source, target: l.target, label: l.label, type: "floating", ...(wires.has(l.id) ? { data: { fiche: wires.get(l.id) } } : {}) }));
  const kind: ProjectKind = isProjectKind(p.meta.kind) ? p.meta.kind : "roman";
  const paperChosen = isPaper(p.meta.paper);
  const paper: Paper = isPaper(p.meta.paper) ? p.meta.paper : defaultPaper(useSettings.getState().lang);
  const frames = (p.meta.frames ?? [])
    .filter((f) => typeof f?.id === "string" && [f.x, f.y, f.width, f.height].every((n) => typeof n === "number" && Number.isFinite(n)))
    .map((f) => toFrameNode({ ...f, title: String(f.title ?? ""), kind: f.kind === "research" ? "research" : undefined, locked: f.locked === true, beat: typeof f.beat === "string" && isBeat(f.beat) ? f.beat : undefined }));
  return { title: p.meta.title, kind, paper, paperChosen, sceneNumbers: p.meta.sceneNumbers === true, underlineHeadings: p.meta.underlineHeadings === true, hideWires: p.meta.hideWires === true, markdownCopies: p.meta.markdownCopies !== false, nodes, frames, edges, plan: readPlan(p.meta.plan), manuscript: p.manuscript ?? {}, goals: readGoals(p.meta.goals), progress: readProgress(p.meta.progress), pitch: readPitch(p.meta.pitch), chutier: readChutier(p.meta.chutier), print: cleanPrint(p.meta.print), scriptPdf: cleanScriptPrint(p.meta.scriptPdf), bibleExport: cleanBibleExport(p.meta.bibleExport), metaKeep: unknownMeta(p.meta), trash: (p.trash ?? []).filter((c): c is TrashedCard => !!c.trashed) };
}

/** Clés de cosmos.json que cette version lit ou écrit elle-même. */
export const KNOWN_META = new Set(["version", "title", "kind", "paper", "sceneNumbers", "underlineHeadings", "hideWires", "markdownCopies", "layout", "links", "frames", "plan", "goals", "progress", "pitch", "chutier", "print", "scriptPdf", "bibleExport", "wires", "viewport"]);

/** Clés inconnues de cosmos.json (écrites par une version plus récente), gardées pour être réécrites. */
export function unknownMeta(meta: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(meta).filter(([key]) => !KNOWN_META.has(key)));
}

/** Rectangles des cartes sur le canevas (hauteur mesurée par React Flow quand elle est connue). */
export const boxes = (nodes: CardNode[]): Box[] =>
  nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    width: typeof n.style?.width === "number" ? n.style.width : CARD_WIDTH,
    height: n.measured?.height ?? CARD_SIZE.height,
  }));

/** Cartes Scène dans l'ordre de la toile, de haut en bas (en attendant le Séquencier). */
export function sceneCards(nodes: CardNode[]): SceneCard[] {
  return nodes
    .filter((n) => n.data.type === "scene")
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((n) => ({ id: n.id, title: n.data.title, synopsis: n.data.fiche?.synopsis }));
}

/**
 * Cartes Scène du récit dans l'ordre par défaut du plan (celui du canevas), pour les fonctions de plan.ts.
 * Les pages hors récit (dédicace, prologue…) n'y sont pas : voir book.ts.
 */
export const planScenes = (nodes: CardNode[]): string[] => storyScenes(nodes);

/** Premier scénario d'un projet : la page de titre porte aussi l'auteur et les coordonnées du profil de l'appareil. */
export function firstScreenplay(title: string, nodes: CardNode[]): Screenplay {
  const screenplay = initialScreenplay(title, sceneCards(nodes));
  const { profile } = useSettings.getState();
  const author = authorName(profile);
  const contact = contactLines(profile).join("\n");
  if (!author && !contact) return screenplay;
  let titlePage = screenplay.titlePage;
  if (author) {
    titlePage = writeTitleField(titlePage, "credit", getT().screenplay.titlePage.creditDefault);
    titlePage = writeTitleField(titlePage, "author", author);
  }
  if (contact) titlePage = writeTitleField(titlePage, "contact", contact);
  return { ...screenplay, titlePage };
}

/** L'en-tête fait foi : les cartes Scène liées prennent le texte de leur en-tête. */
export function titlesFromHeadings(nodes: CardNode[], screenplay: Screenplay): CardNode[] {
  const titles = headingTitles(screenplay);
  let changed = false;
  const next = nodes.map((n) => {
    const title = titles.get(n.id);
    if (n.data.type !== "scene" || title === undefined || title === n.data.title) return n;
    changed = true;
    return { ...n, data: { ...n.data, title } };
  });
  return changed ? next : nodes;
}

/**
 * Anciennes cartes Question « à creuser » (créées par l'assistant avant que les questions ne vivent dans
 * la carte du personnage) : leur question passe dans le personnage, et elles quittent le canevas.
 */
export function adoptParkedCards(nodes: CardNode[], edges: Edge[]): { nodes: CardNode[]; edges: Edge[] } {
  const labels = Object.values(DICTIONARIES).map((d) => d.assistant.linkLabel);
  const found = legacyParkedCards(
    nodes.map((n) => n.data),
    edges.map((e) => ({ source: e.source, target: e.target, label: String(e.label ?? "") })),
    labels,
  );
  if (found.length === 0) return { nodes, edges };
  const gone = new Set(found.map((f) => f.cardId));
  const byCharacter = new Map<string, string[]>();
  for (const f of found) byCharacter.set(f.characterId, [...(byCharacter.get(f.characterId) ?? []), f.question]);
  return {
    nodes: nodes
      .filter((n) => !gone.has(n.id))
      .map((n) => {
        const added = byCharacter.get(n.id);
        if (!added) return n;
        const questions = added.reduce<string[] | undefined>((list, q) => addQuestion(list, q), n.data.questions);
        return { ...n, data: { ...n.data, questions } };
      }),
    edges: edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
  };
}

/** État à adopter quand on ouvre un projet. `dirty` : l'ouverture a produit des changements à enregistrer. */
/**
 * Projets d'avant : les réponses de l'assistant écrites dans le texte d'un personnage (question en gras,
 * réponse dessous) rejoignent ses réponses rangées. Seulement pour les questions connues, dans une des langues.
 */
export function adoptTextAnswers(nodes: CardNode[]): CardNode[] {
  const byText = new Map<string, string>();
  for (const d of Object.values(DICTIONARIES)) for (const [key, text] of Object.entries(allQuestionTexts(d.assistant))) byText.set(text, key);
  let changed = false;
  const next = nodes.map((n) => {
    if (n.data.type !== "personnage") return n;
    const found = extractAnswers(n.data.html, (text) => byText.get(text));
    if (!found) return n;
    changed = true;
    const reponses = { ...found.reponses, ...(n.data.reponses ?? {}) };
    return { ...n, data: { ...n.data, html: found.html, reponses } };
  });
  return changed ? next : nodes;
}

export function openProject(p: Project) {
  const read = fromProject(p);
  const parked = adoptParkedCards(read.nodes, read.edges);
  const adopted = { ...parked, nodes: adoptTextAnswers(parked.nodes) };
  // La zone Recherche gardait le titre par défaut d'avant (« Sources ») : elle prend celui d'aujourd'hui.
  const r = getT().research;
  let renamed = false;
  const frames = read.frames.map((f) => {
    if (f.data.kind !== "research") return f;
    const title = renamedZone(f.data.title, Object.values(DICTIONARIES).flatMap((d) => d.research.oldTitles), r.frameTitle);
    if (title === f.data.title) return f;
    renamed = true;
    return { ...f, data: { ...f.data, title } };
  });
  // Épisodes écrits dans la couverture (avant le lot 6) : une carte Épisode chacun, posée dans un espace libre.
  const episodes = adoptPitchEpisodes(read.pitch, adopted.nodes.map((n) => n.data), newId);
  if (episodes) {
    const placed = [...adopted.nodes];
    for (const card of episodes.cards) {
      const at = firstFreeCell([...boxes(placed), ...frames.map(frameBox)]);
      placed.push(toNode(card, at.x, at.y));
    }
    adopted.nodes = placed;
  }
  const base = { ...read, ...adopted, frames, pitch: episodes?.pitch ?? read.pitch };
  // Projet scénario sans fichier (créé avant l'éditeur) : on le prépare à partir des cartes Scène.
  const screenplayRead =
    p.screenplay ?? (base.kind === "scenario" ? firstScreenplay(base.title, base.nodes) : null);
  const headed = screenplayRead ? titlesFromHeadings(base.nodes, screenplayRead) : base.nodes;
  // Le corps d'une carte Scène est son texte (manuscrit, ou scène du scénario) : ses anciennes notes
  // passent dans son synopsis (fiche d'un roman, ligne « = … » du Fountain d'un scénario).
  const folded = base.kind === "scenario" ? foldScreenplayNotes(headed, screenplayRead) : { nodes: foldNovelNodes(headed), screenplay: screenplayRead };
  const nodes = folded.nodes;
  const screenplay = folded.screenplay;
  // Un scénario fixe son format de page une fois pour toutes (selon la langue du moment), pour que
  // la pagination ne change pas d'un appareil à l'autre.
  const paperChosen = base.paperChosen || base.kind === "scenario";
  return {
    // Un projet qu'on ouvre repart d'un historique vide.
    state: { ...base, paperChosen, nodes, screenplay, savedScreenplay: p.screenplay, past: [], future: [] },
    dirty: renamed || !!episodes || screenplay !== p.screenplay || nodes !== base.nodes || paperChosen !== base.paperChosen || adopted.nodes !== read.nodes,
  };
}

export function toProject(
  s: ProjectSlice,
): Project {
  // Le plan écrit ne cite que des cartes qui existent encore.
  const plan = prunePlan(s.plan, new Set(s.nodes.map((n) => n.id)));
  return {
    meta: {
      // Ce qu'une version plus récente a écrit et que celle-ci ignore, d'abord : les clés connues l'emportent.
      ...s.metaKeep,
      version: 1,
      title: s.title,
      kind: s.kind,
      ...(s.paperChosen ? { paper: s.paper } : {}),
      ...(s.sceneNumbers ? { sceneNumbers: true } : {}),
      ...(s.underlineHeadings ? { underlineHeadings: true } : {}),
      ...(s.hideWires ? { hideWires: true } : {}),
      ...(s.markdownCopies ? {} : { markdownCopies: false }),
      layout: s.nodes.map((n) => ({
        id: n.id,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        width: typeof n.style?.width === "number" ? n.style.width : undefined,
      })),
      links: s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: String(e.label ?? "") })),
      ...(s.frames.length > 0
        ? {
            frames: s.frames.map((f) => {
              const box = frameBox(f);
              return {
                id: f.id,
                title: f.data.title,
                x: Math.round(box.x),
                y: Math.round(box.y),
                width: Math.round(box.width),
                height: Math.round(box.height),
                ...(f.data.kind === "research" ? { kind: "research" as const } : {}),
                ...(f.data.locked ? { locked: true } : {}),
                ...(f.data.beat ? { beat: f.data.beat } : {}),
              };
            }),
          }
        : {}),
      ...(isEmptyPlan(plan) ? {} : { plan }),
      ...(s.goals.daily || s.goals.total ? { goals: s.goals } : {}),
      ...(Object.keys(s.progress).length > 0 ? { progress: s.progress } : {}),
      ...(isEmptyPitch(s.pitch) ? {} : { pitch: s.pitch }),
      ...(s.chutier.length > 0 ? { chutier: s.chutier } : {}),
      ...(printToMeta(s.print) ? { print: printToMeta(s.print) } : {}),
      ...(scriptPrintToMeta(s.scriptPdf) ? { scriptPdf: scriptPrintToMeta(s.scriptPdf) } : {}),
      ...(bibleExportToMeta(s.bibleExport) ? { bibleExport: bibleExportToMeta(s.bibleExport) } : {}),
      ...(wiresToMeta(s.edges) ? { wires: wiresToMeta(s.edges) } : {}),
    },
    cards: s.nodes.map((n) => n.data),
    screenplay: s.screenplay,
    manuscript: s.manuscript,
    ...(s.trash.length > 0 ? { trash: s.trash } : {}),
  };
}

export const p = (text: string) => `<p>${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</p>`;

/** Ce que l'enregistrement lit dans l'état du store (voir toProject). */
export interface ProjectSlice {
  title: string;
  kind: ProjectKind;
  paper: Paper;
  paperChosen: boolean;
  sceneNumbers: boolean;
  underlineHeadings: boolean;
  /** Fils du canevas masqués (réglage du projet, enregistré). */
  hideWires: boolean;
  markdownCopies: boolean;
  nodes: CardNode[];
  frames: FrameNode[];
  edges: Edge[];
  screenplay: Screenplay | null;
  plan: Plan;
  manuscript: Manuscript;
  goals: Goals;
  progress: Progress;
  pitch: Pitch;
  chutier: Passage[];
  print: PrintOptions;
  scriptPdf: ScriptPrint;
  bibleExport: BibleExportState;
  metaKeep: Record<string, unknown>;
  trash: TrashedCard[];
}
