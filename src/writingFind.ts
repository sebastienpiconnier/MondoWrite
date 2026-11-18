// Recherche des vues d'écriture (#85) : ce que l'on cherche dans le Manuscrit et le Scénario, le dernier passage
// choisi, et « Occurrence suivante / précédente » (F3 et Maj + F3, Cmd + Alt + G et Maj + Cmd + Alt + G sur Mac),
// qui avancent sans rouvrir la recherche. La liste de Search.tsx et ces touches lisent les mêmes passages.

import { useCosmos, SCENE_AT, type CosmosState } from "./store";
import { bookOrder } from "./book";
import { htmlParagraphs } from "./cardText";
import { chapterNumbers, chapterOf } from "./plan";
import { isEditableType } from "./screenplay/editor/nodes";
import { findPassages, type Passage, type TextUnit } from "./search";
import { fmt, getT } from "./i18n";
import { sendCommand } from "./commands";

/** Assez pour un mot qui revient souvent dans tout un livre ; la liste affichée en montre autant. */
export const PASSAGE_LIMIT = 500;

/**
 * Les scènes où chercher, dans l'ordre du livre : paragraphes du manuscrit (ou éléments écrits d'une scène du
 * scénario, cible `SCENE_AT` + rang), comme l'éditeur les montre. Roman : le titre de chaque chapitre, juste avant
 * sa première scène, et le chapitre de chaque scène en contexte.
 */
export function writingUnits(st: Pick<CosmosState, "kind" | "screenplay" | "nodes" | "plan" | "manuscript">): TextUnit[] {
  const t = getT();
  const untitled = t.semantic.untitledScene;
  if (st.kind === "scenario") {
    const elements = st.screenplay?.elements ?? [];
    const out: TextUnit[] = [];
    let unit: TextUnit | null = null;
    elements.forEach((el, i) => {
      // Une scène va de son en-tête au suivant ; le texte d'avant la première scène a sa propre entrée.
      if (el.type === "sceneHeading" || !unit) {
        unit = { target: `${SCENE_AT}${i}`, title: el.type === "sceneHeading" ? el.text.trim() || untitled : "", texts: [] };
        out.push(unit);
      }
      if (isEditableType(el.type) && el.text.trim()) unit.texts.push(el.text);
    });
    return out;
  }
  const order = bookOrder(st.nodes, st.plan);
  const numbers = chapterNumbers(st.plan, order);
  const titles = new Map(st.nodes.map((n) => [n.id, n.data.title.trim()]));
  const seen = new Set<string>();
  const out: TextUnit[] = [];
  for (const id of order) {
    const chapter = chapterOf(st.plan, id);
    const n = chapter ? numbers.get(chapter.id) : undefined;
    const label = chapter && n ? (chapter.title.trim() ? fmt(t.chapters.numberedTitle, { n, title: chapter.title.trim() }) : fmt(t.chapters.numbered, { n })) : undefined;
    // Le titre du chapitre, une fois, à sa première scène.
    if (chapter && n && !seen.has(chapter.id)) {
      seen.add(chapter.id);
      if (chapter.title.trim()) out.push({ target: id, title: fmt(t.chapters.numbered, { n }), texts: [chapter.title], kind: "chapter" });
    }
    if (st.manuscript[id]) out.push({ target: id, title: titles.get(id) || untitled, texts: htmlParagraphs(st.manuscript[id]), ...(label ? { context: label } : {}) });
  }
  return out;
}

/** Dernier passage choisi (saisie, scène, rang) : la recherche rouverte part du suivant, F3 aussi. */
let last: { query: string; target: string; nth: number; kind?: "chapter" } | null = null;

const same = (p: Passage, l: NonNullable<typeof last>) => p.target === l.target && p.nth === l.nth && p.kind === l.kind;

/** Rang, dans `passages`, du passage qui suit (ou précède) le dernier choisi pour cette saisie ; 0 sinon. */
export function nextIndex(passages: Passage[], query: string, dir: 1 | -1 = 1): number {
  if (!last || passages.length === 0 || last.query !== query.trim()) return 0;
  const at = passages.findIndex((p) => same(p, last!));
  if (at < 0) return dir > 0 ? 0 : passages.length - 1;
  return (at + dir + passages.length) % passages.length;
}

/** Va au passage dans la vue d'écriture et le retient. Un titre de chapitre : sa première scène. */
export function goToPassage(p: Passage, query: string) {
  const q = query.trim();
  last = { query: q, target: p.target, nth: p.nth, ...(p.kind ? { kind: p.kind } : {}) };
  const st = useCosmos.getState();
  if (p.kind === "chapter") st.openInManuscript(p.target);
  else st.openInManuscript(p.target, q, undefined, p.nth);
}

/**
 * Occurrence suivante (1) ou précédente (-1) de la dernière recherche, dans le Manuscrit ou le Scénario ; on
 * repart au début (ou à la fin) du livre au bout. Faux s'il n'y a pas de recherche à continuer (la recherche
 * s'ouvre alors).
 */
export function findNext(dir: 1 | -1): boolean {
  const st = useCosmos.getState();
  if (!last || st.screen !== "project" || st.view !== "manuscrit") return false;
  const passages = findPassages(writingUnits(st), last.query, PASSAGE_LIMIT);
  if (passages.length === 0) return false;
  goToPassage(passages[nextIndex(passages, last.query, dir)], last.query);
  return true;
}

/** F3, Cmd + Alt + G, menu Édition, palette : l'occurrence suivante, ou la recherche s'il n'y a rien à continuer. */
export function findOrSearch(dir: 1 | -1) {
  if (!findNext(dir)) sendCommand("search");
}

/** Pour les tests : oublie le dernier passage. */
export function forgetFind() {
  last = null;
}
