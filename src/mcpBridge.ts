// Assistant externe par MCP, écriture (#62, lot 3) : branche les demandes du serveur sur le store. Chargé à la
// demande par la boucle de `startMcpBridge` (mcp.ts), seulement quand une demande arrive.

import { getT } from "./i18n";
import { publishOpenProject, useCosmos } from "./store";
import { storage } from "./storage";
import { useSettings } from "./settings";
import { mcpAllows, mcpWritable } from "./mcp";
import { answerLive, isLiveTool, type LiveSource } from "./mcpLive";
import { findOccurrences, isAlsoAWord, type ReplaceRequest } from "./replace";
import { canvasCenter } from "./canvasCenter";
import { buildMcpSnapshot } from "./mcpSnapshot";
import { bookOrder } from "./book";
import { chapterNumbers } from "./plan";
import { applyMcpRequest, type McpAnswer, type McpRequest, type McpStore } from "./mcpWrite";

const s = () => useCosmos.getState();

/** Scènes numérotées comme dans l'instantané que lit l'IA. */
function snapshotScenes() {
  const st = s();
  return buildMcpSnapshot({ title: st.title, kind: st.kind, nodes: st.nodes, edges: st.edges, plan: st.plan, manuscript: st.manuscript, screenplay: st.screenplay, pitch: st.pitch }, getT(), new Date(), "").scenes.map(({ n, id, title }) => ({ n, id, title }));
}

/** « Renommer partout » avec les garde-fous de la fenêtre : nom tel qu'écrit, et en tête de phrase laissé si c'est aussi un mot. */
function renameEverywhere(id: string, name: string): { count: number; skipped: number } {
  const card = s().nodes.find((n) => n.id === id)?.data;
  if (!card) return { count: 0, skipped: 0 };
  const base: ReplaceRequest = { find: card.title, replacement: name, nameCase: true, wholeWord: true, cards: true, renameId: id };
  const also = isAlsoAWord(s(), card.title.trim());
  const skip = also ? findOccurrences(s(), base).filter((o) => o.sentenceStart).map((o) => o.key) : [];
  return { count: s().replaceText({ ...base, skip }), skipped: skip.length };
}

/** Cadre posé autour de ces cartes : la sélection de l'auteur est prise le temps de le poser, puis rendue. */
function frameAround(title: string, ids: string[]): string {
  const before = new Set(s().nodes.filter((n) => n.selected).map((n) => n.id));
  const wanted = new Set(ids);
  useCosmos.setState({ nodes: s().nodes.map((n) => (!!n.selected === wanted.has(n.id) ? n : { ...n, selected: wanted.has(n.id) })) });
  const id = s().addFrame(canvasCenter() ?? { x: 0, y: 0 });
  if (title) s().updateFrame(id, { title });
  useCosmos.setState({ nodes: s().nodes.map((n) => (!!n.selected === before.has(n.id) ? n : { ...n, selected: before.has(n.id) })) });
  return id;
}

/** Le store vu par `applyMcpRequest`. */
function mcpStore(): McpStore {
  return {
    kind: s().kind,
    cards: () => s().nodes.map((n) => n.data),
    screenplay: () => s().screenplay,
    manuscript: () => s().manuscript,
    scenes: snapshotScenes,
    batch: (fn) => s().externalEdit(fn),
    addTitledCard: (type, title) => s().addTitledCard(type, title),
    updateCard: (id, patch) => s().updateCard(id, patch),
    linkCards: (a, b, label) => s().linkCards(a, b, label),
    addQuestionAbout: (title, ids) => s().addQuestionAbout(title, ids),
    setManuscriptText: (id, html) => s().setManuscriptText(id, html),
    setScreenplay: (sp, undoable) => s().setScreenplay(sp, undoable),
    keepVersion: (id, title) => s().keepVersion(id, title),
    moveBookScene: (id, target, side) => s().moveBookScene(id, target, side),
    chapters: () => {
      const st = s();
      const numbers = chapterNumbers(st.plan, bookOrder(st.nodes, st.plan));
      return (st.plan.chapters ?? [])
        .map((c) => ({ n: numbers.get(c.id) ?? 0, id: c.id, title: c.title.trim() }))
        .sort((x, y) => x.n - y.n);
    },
    startChapterAt: (id) => s().startChapterAt(id),
    renameChapter: (id, title) => s().renamePlanChapter(id, title),
    deleteChapter: (id) => s().deletePlanChapter(id),
    moveChapter: (id, before) => s().movePlanChapter(id, before),
    edges: () => s().edges,
    plan: () => s().plan,
    pitch: () => s().pitch,
    comments: () => s().comments,
    addComment: (cardId, id, quote, text) => {
      // Le commentaire de l'assistant ne prend pas le focus de l'auteur.
      const focus = s().commentFocus;
      s().addComment(cardId, id, quote);
      s().editComment(cardId, id, text);
      s().setCommentFocus(focus);
    },
    resolveComment: (cardId, id, resolved) => s().resolveComment(cardId, id, resolved),
    addEpisode: (season) => s().addSeriesEpisode(season),
    addSeason: () => s().addSeriesSeason(),
    renameSeriesPart: (id, title) => s().renameSeriesPart(id, title),
    setEpisodeSynopsis: (id, text) => s().setEpisodeSynopsis(id, text),
    moveSeriesPart: (id, way) => s().moveSeriesPart(id, way),
    placeInEpisode: (id, episode) => s().placeInEpisode(id, episode),
    placeInBeat: (id, beat) => s().placeInBeat(id, beat),
    setPlanTemplate: (template) => s().setPlanTemplate(template),
    nextMergeable: (id) => s().nextMergeable(id),
    joinScenes: (from, into) => s().joinScenes(from, into) !== null,
    splitScene: (afterId, html) => s().splitScene(afterId, html),
    trash: (ids) => s().deleteCards(ids),
    removeLink: (id) => s().removeLink(id),
    replace: (req) => s().replaceText(req),
    rename: renameEverywhere,
    setCoverIa: (key, text, client) => s().acceptIaPitch(key, text, { service: "MCP", model: client }),
    frame: frameAround,
    organize: () => {
      // « Organiser » montre le canevas : l'auteur reste dans la vue où il écrit.
      const view = s().view;
      s().organizeCanvas();
      if (s().view !== view) useCosmos.setState({ view });
    },
    log: (target, words, client) => s().logAtelier("external", target, words, { service: "MCP", model: client }),
  };
}

/** Une demande reçue (JSON du fichier de la file) → sa réponse. Jamais d'écriture si l'accès a été retiré entre-temps. */
export async function applyRaw(raw: string, projectId: string): Promise<{ id: string | null; answer: McpAnswer }> {
  let req: McpRequest;
  try {
    req = JSON.parse(raw) as McpRequest;
  } catch {
    return { id: null, answer: { ok: false, text: "Demande illisible." } };
  }
  const id = typeof req.id === "string" ? req.id : null;
  const st = useCosmos.getState();
  if (isLiveTool(req.tool)) {
    // Lecture sur le projet ouvert : un accès en lecture suffit.
    if (st.screen !== "project" || storage.current?.() !== projectId || !mcpAllows(useSettings.getState().mcp, projectId)) {
      return { id, answer: { ok: false, text: "Le projet n'est plus ouvert à l'assistant dans MondoWrite." } };
    }
    try {
      return { id, answer: await answerLive(req, liveSource(), getT()) };
    } catch (err) {
      console.error(err);
      return { id, answer: { ok: false, text: "Erreur dans MondoWrite pendant la lecture." } };
    }
  }
  if (st.screen !== "project" || storage.current?.() !== projectId || !mcpWritable(useSettings.getState().mcp, projectId)) {
    return { id, answer: { ok: false, text: "Le projet n'est plus ouvert en écriture dans MondoWrite : rien n'a été écrit." } };
  }
  try {
    const answer = await applyMcpRequest(req, mcpStore(), getT());
    // L'IA relit aussitôt ce qu'elle vient d'écrire : l'instantané suit sans attendre l'enregistrement.
    if (answer.ok) publishOpenProject(true);
    return { id, answer };
  } catch (err) {
    console.error(err);
    return { id, answer: { ok: false, text: "Erreur dans MondoWrite : rien n'a été écrit, ou seulement en partie." } };
  }
}

/** Le projet ouvert, pour les lectures faites par l'app. */
function liveSource(): LiveSource {
  const st = s();
  return {
    kind: st.kind,
    lang: useSettings.getState().lang,
    cards: st.nodes.map((n) => n.data),
    edges: st.edges,
    manuscript: st.manuscript,
    screenplay: st.screenplay,
    comments: st.comments,
    paper: st.paper,
    pitch: st.pitch,
    journal: st.journal,
    order: bookOrder(st.nodes, st.plan),
    scenes: snapshotScenes(),
    readVersions: (cardId) => storage.readVersions(cardId),
  };
}
