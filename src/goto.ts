// « Aller à » (Cmd/Ctrl + G) : les endroits où l'on peut sauter dans le Manuscrit ou le Scénario, et ceux qui
// répondent à ce que l'auteur tape. Fonctions pures : la fenêtre (GoToPanel) affiche, `openInManuscript` emmène.
// Une cible est ce que `openInManuscript` comprend : l'identifiant d'une carte Scène, ou `SCENE_AT` + rang d'un
// élément du scénario (scène sans carte, note).

import type { ScreenplayElement } from "./screenplay/model";
import { chapterNumbers, chapterOf, type Plan } from "./plan";
import { countWords, type Manuscript } from "./manuscript";
import { firstPageOf } from "./stats";
import { revisitsIn } from "./todos";

export type GoKind = "page" | "scene" | "chapter" | "revisit" | "note";

export interface GoTarget {
  key: string;
  kind: GoKind;
  label: string;
  /** Texte en plus, plus discret : page, synopsis, scène d'une note. */
  detail: string;
  /** Pour `openInManuscript`. */
  target: string;
  /** Page où l'on arrive (estimée). */
  page: number;
}

export interface GoLabels {
  page: string; // « Page {n} »
  untitledScene: string;
  chapter: (n: number, title: string) => string;
}

const AT = "@";
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
const fill = (template: string, n: number) => template.replace("{n}", String(n));
const isLinkNote = (text: string) => /^\s*cosmos:/.test(text);

export interface GoPlaces {
  targets: GoTarget[];
  /** Nombre de pages (estimé) et l'endroit où commence chacune. */
  pages: number;
  pageAt: (n: number) => string | null;
}

/** Scénario : les scènes (numérotées comme à l'impression), les notes [[…]] de l'auteur, les pages. */
export function screenplayPlaces(elements: ScreenplayElement[], startPage: number[], pages: number, labels: GoLabels): GoPlaces {
  const targets: GoTarget[] = [];
  let scene = 0;
  let sceneLabel = "";
  elements.forEach((el, i) => {
    const page = startPage[i] ?? 1;
    if (el.type === "sceneHeading") {
      scene++;
      const number = el.sceneNumber ?? String(scene);
      sceneLabel = `${number}. ${el.text.trim() || labels.untitledScene}`;
      const synopsis = elements[i + 1]?.type === "synopsis" ? elements[i + 1].text.trim() : "";
      targets.push({ key: `s${i}`, kind: "scene", label: sceneLabel, detail: synopsis, target: el.cardId ?? `${AT}${i}`, page });
    } else if (el.type === "note" && el.text.trim() && !isLinkNote(el.text)) {
      targets.push({ key: `n${i}`, kind: "note", label: el.text.trim(), detail: sceneLabel, target: `${AT}${i}`, page });
    }
  });
  const pageAt = (n: number) => {
    if (n < 1 || n > pages) return null;
    const i = startPage.findIndex((p) => p >= n);
    return i >= 0 ? `${AT}${i}` : null;
  };
  return { targets, pages, pageAt };
}

/** Roman : les scènes dans l'ordre du livre, les chapitres, les passages « à reprendre », les pages (250 mots). */
export function novelPlaces(order: string[], titles: Map<string, string>, plan: Plan, manuscript: Manuscript, labels: GoLabels): GoPlaces {
  const targets: GoTarget[] = [];
  const numbers = chapterNumbers(plan, order);
  const firstPages: number[] = [];
  const seenChapters = new Set<string>();
  let before = 0;
  order.forEach((id) => {
    const page = firstPageOf(before);
    firstPages.push(page);
    const chapter = chapterOf(plan, id);
    if (chapter && !seenChapters.has(chapter.id)) {
      seenChapters.add(chapter.id);
      const n = numbers.get(chapter.id) ?? 0;
      targets.push({ key: `c${chapter.id}`, kind: "chapter", label: labels.chapter(n, chapter.title.trim()), detail: "", target: id, page });
    }
    const title = titles.get(id)?.trim() || labels.untitledScene;
    targets.push({ key: `s${id}`, kind: "scene", label: title, detail: "", target: id, page });
    revisitsIn(manuscript[id]).forEach((text, k) => targets.push({ key: `r${id}-${k}`, kind: "revisit", label: text, detail: title, target: id, page }));
    before += countWords(manuscript[id]);
  });
  const pages = Math.max(1, firstPageOf(Math.max(0, before - 1)));
  const pageAt = (n: number) => {
    if (n < 1 || n > pages || order.length === 0) return null;
    // La première scène qui commence sur cette page ; sinon celle, plus longue, qui la traverse.
    const starts = firstPages.indexOf(n);
    if (starts >= 0) return order[starts];
    let at = 0;
    firstPages.forEach((p, i) => {
      if (p < n) at = i;
    });
    return order[at];
  };
  return { targets, pages, pageAt };
}

/**
 * Ce qui répond à la saisie. Un nombre : la page de ce numéro, puis la scène qui porte ce numéro. Un texte :
 * scènes, chapitres, notes et passages dont le libellé ou le détail le contient (sans casse ni accents).
 * Saisie vide : les scènes et les chapitres. `limit` borne la liste.
 */
export function findPlaces(query: string, places: GoPlaces, labels: GoLabels, limit = 60): GoTarget[] {
  const q = fold(query);
  if (q === "") return places.targets.filter((t) => t.kind === "scene" || t.kind === "chapter").slice(0, limit);
  const out: GoTarget[] = [];
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const at = places.pageAt(n);
    if (at) out.push({ key: `p${n}`, kind: "page", label: fill(labels.page, n), detail: "", target: at, page: n });
    // Scène numérotée (scénario : « 12. INT. … ») ou chapitre de ce numéro (roman).
    const chapter = fold(labels.chapter(n, ""));
    for (const t of places.targets) {
      if ((t.kind === "scene" && t.label.startsWith(`${q}.`)) || (t.kind === "chapter" && (fold(t.label) === chapter || fold(t.label).startsWith(`${chapter} `)))) out.push(t);
    }
  }
  for (const t of places.targets) {
    if (out.includes(t)) continue;
    if (fold(`${t.label} ${t.detail}`).includes(q)) out.push(t);
  }
  return out.slice(0, limit);
}
