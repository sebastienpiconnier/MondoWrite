// Pages et numéros de scène verrouillés (#18, lot 2 de docs/plan-revisions-scenario.md). Fonctions pures, partagées
// par le PDF (export/typeset.ts), la feuille à l'écran (editor/pages.ts) et le store.
//
// Au verrouillage, on garde pour chaque page l'élément qui l'ouvre (son rang et un extrait de son texte). Ensuite :
//  - chaque page verrouillée commence toujours à son élément ;
//  - ce qui déborde d'une page prend la lettre suivante (12 → 12A → 12B) ;
//  - une page dont l'élément a disparu s'efface : la page précédente porte les deux numéros (« 13-14 »).
// Jamais écrit dans le Fountain : seuls les numéros de scène le sont (#12A#), comme tout numéro de scène.

import type { ScreenplayElement } from "./model";
import type { LockedPage } from "./revisions";

type Spoken = { type: string; text: string };

/** Début du texte d'un élément, espaces repliées : de quoi le retrouver. */
export const excerpt = (el: Pick<ScreenplayElement, "text">): string => el.text.replace(/\s+/g, " ").trim().slice(0, 60);

/** Libellé suivant : 12 → 12A, 12A → 12B, 12Z → 12AA ; « 13-14 » → « 13-14A ». */
export function nextLabel(label: string): string {
  const m = /^(.*?)([A-Z]*)$/.exec(label);
  const head = m?.[1] ?? label;
  const letters = m?.[2] ?? "";
  if (letters === "") return `${head}A`;
  // Comme les colonnes d'un tableur : Z → AA, AZ → BA.
  const chars = letters.split("");
  let i = chars.length - 1;
  for (; i >= 0; i--) {
    if (chars[i] === "Z") chars[i] = "A";
    else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      break;
    }
  }
  return head + (i < 0 ? "A" : "") + chars.join("");
}

/** Une page de la pagination du moment : élément qui l'ouvre, et `cont` si elle reprend un élément coupé. */
export interface PageStart {
  start: number;
  cont?: boolean;
}

/** Pages verrouillées à partir de la pagination du moment, dans l'ordre. */
export function buildLock(pages: PageStart[], elements: Spoken[]): LockedPage[] {
  const out: LockedPage[] = [];
  pages.forEach((page, i) => {
    const label = String(i + 1);
    const last = out[out.length - 1];
    // Une réplique ou un paragraphe coupé par la page : la suite rejoint la page verrouillée précédente.
    if (last && (page.cont || page.start <= (out.length > 0 ? last.at : 0))) last.more = [...(last.more ?? []), label];
    else out.push({ label, at: i === 0 ? 0 : page.start, text: excerpt(elements[i === 0 ? 0 : page.start] ?? { text: "" }) });
  });
  return out;
}

export interface LockPlan {
  /** Rang de l'élément qui ouvre chaque page verrouillée restante, croissant ; le premier est toujours 0. */
  starts: number[];
  /** Libellé de chaque page verrouillée restante (« 13-14 » quand une page a disparu juste après). */
  labels: string[];
  /** Libellés des pages qui continuaient la page verrouillée (réplique coupée au verrouillage). */
  more: string[][];
}

/**
 * Retrouve les pages verrouillées dans le texte d'aujourd'hui. Un élément est reconnu à son extrait, à son rang
 * d'origine ou le plus près possible de lui (en gardant l'ordre). Rend null si plus aucune page ne se retrouve.
 */
export function resolveLock(locked: LockedPage[] | null | undefined, elements: Spoken[]): LockPlan | null {
  if (!locked || locked.length === 0 || elements.length === 0) return null;
  const texts = elements.map(excerpt);
  const found: { start: number; page: LockedPage }[] = [];
  const gone: { page: LockedPage; after: number }[] = [];
  let previous = -1;
  for (const page of locked) {
    let at = -1;
    if (page.text === "") {
      // Élément sans texte (saut de page…) : on ne peut compter que sur son rang.
      if (page.at > previous && page.at < elements.length) at = page.at;
    } else {
      for (let d = 0; at < 0 && d < elements.length; d++) {
        for (const i of d === 0 ? [page.at] : [page.at - d, page.at + d]) {
          if (i > previous && i >= 0 && i < elements.length && texts[i] === page.text) {
            at = i;
            break;
          }
        }
      }
    }
    if (at >= 0) {
      found.push({ start: at, page });
      previous = at;
    } else gone.push({ page, after: found.length });
  }
  if (found.length === 0) return null;

  const labels = found.map((f) => f.page.label);
  // Pages disparues : la page restante qui les précède porte leurs numéros (« 13-14 »). Avant la première : la première.
  for (let k = 0; k < found.length; k++) {
    const removed = gone.filter((g) => g.after === k + 1);
    if (removed.length > 0) labels[k] = `${labels[k]}-${removed[removed.length - 1].page.label}`;
  }
  const before = gone.filter((g) => g.after === 0);
  if (before.length > 0) labels[0] = `${before[0].page.label}-${labels[0]}`;
  return { starts: found.map((f, k) => (k === 0 ? 0 : f.start)), labels, more: found.map((f) => f.page.more ?? []) };
}

/**
 * Libellé de chaque page de la pagination du moment. Une page qui ouvre une page verrouillée prend son libellé ;
 * celles qui la prolongent (élément coupé, ou trop de texte) prennent la lettre suivante.
 */
export function pageLabels(plan: LockPlan, pages: PageStart[]): string[] {
  const out: string[] = [];
  let lock = 0;
  let within = 0;
  pages.forEach((page, i) => {
    let k = lock;
    if (!page.cont) while (k + 1 < plan.starts.length && plan.starts[k + 1] <= page.start) k++;
    if (i === 0 || k !== lock) {
      lock = k;
      within = 0;
    } else within++;
    const known = [plan.labels[lock] ?? "", ...(plan.more[lock] ?? [])];
    let label = known[Math.min(within, known.length - 1)];
    for (let j = known.length; j <= within; j++) label = nextLabel(label);
    out.push(label);
  });
  return out;
}

/**
 * Numéros de scène d'un texte verrouillé : une scène sans numéro prend celui de la précédente suivi d'une lettre
 * (12 → 12A → 12B), jamais un numéro déjà pris ; avant la première scène numérotée, « A1 ». `renumber` : au
 * verrouillage, les scènes sans numéro sont numérotées de 1 à n, dans l'ordre. Même tableau si rien n'est à numéroter.
 */
export function assignSceneNumbers<T extends { type: string; sceneNumber?: string }>(elements: T[], renumber = false): T[] {
  const taken = new Set(elements.flatMap((e) => (e.type === "sceneHeading" && e.sceneNumber ? [e.sceneNumber] : [])));
  let count = 0;
  let previous: string | undefined;
  let changed = false;
  const out = elements.map((el) => {
    if (el.type !== "sceneHeading") return el;
    count++;
    if (el.sceneNumber) {
      previous = el.sceneNumber;
      return el;
    }
    let number = renumber ? String(count) : previous === undefined ? "A1" : nextLabel(previous);
    while (taken.has(number)) number = nextLabel(number);
    taken.add(number);
    previous = number;
    changed = true;
    return { ...el, sceneNumber: number };
  });
  return changed ? out : elements;
}
