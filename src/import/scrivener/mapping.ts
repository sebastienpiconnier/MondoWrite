// Un projet Scrivener lu (classeur et textes) → un projet roman MondoWrite. Lot 1 : le manuscrit. Le dossier
// Manuscrit donne les chapitres et les scènes, dans l'ordre du classeur ; chaque document garde son titre, son
// synopsis et son statut. Rien de Scrivener n'est gardé dans les fichiers (pas d'UUID). Pur.

import type { Project } from "../../types";
import { bookToProject, EPILOGUE, isSceneBreak, PROLOGUE, type ImportedChapter, type ImportedPara } from "../manuscript";
import { statusOf, type Binder, type BinderItem } from "./binder";

/** Ce qu'on sait lire d'un document du classeur. */
export interface ScrivenerDoc {
  /** Paragraphes du texte (content.rtf), ou rien. */
  paras: ImportedPara[];
  synopsis: string;
}

export interface ScrivenerSource {
  /** Nom du projet (nom du .scrivx, sans extension). */
  name: string;
  binder: Binder;
  doc: (uuid: string) => ScrivenerDoc;
}

/** Ce que l'import n'a pas repris tel quel : dit à l'auteur après l'import. */
export interface ScrivenerReport {
  chapters: number;
  scenes: number;
  /** Titres des documents exclus de la compilation dans Scrivener, importés quand même. */
  excluded: string[];
}

/** Nom d'un projet écrit dans un zip fait sur Mac : « Sacr#U00e9 Bonhomme » → « Sacré Bonhomme ». */
export const decodeScrivenerName = (name: string) => name.replace(/#U([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

const NUMBER = "(?:\\d{1,3}|[IVXLCivxlc]{1,7}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|one|two|three|four|five|six|seven|eight|nine|ten)";
const NUMBERED = new RegExp(`^(?:(?:chapitre|chapter|chap\\.?|partie|part)\\s+${NUMBER}|\\d{1,3})\\s*(?:[.:—–-]\\s*|$)`, "iu");

/**
 * Titre d'un chapitre sans sa numérotation : MondoWrite numérote ses chapitres lui-même. « Chapitre 1 - Le monde
 * ordinaire » → « Le monde ordinaire », « Chapter 3 » → « », « 12. La fuite » → « La fuite ».
 */
export function chapterTitle(title: string): string {
  const t = title.trim();
  const m = t.match(NUMBERED);
  return m ? t.slice(m[0].length).trim() : t;
}

/** Les paragraphes d'un texte coupés en scènes aux séparateurs (***, #…) ; lignes vides retirées. */
function splitScenes(paras: ImportedPara[]): string[][] {
  const scenes: string[][] = [[]];
  for (const p of paras) {
    if (!p.text) continue;
    if (isSceneBreak(p.text)) {
      if (scenes[scenes.length - 1].length > 0) scenes.push([]);
      continue;
    }
    scenes[scenes.length - 1].push(p.html);
  }
  return scenes.filter((s, i) => s.length > 0 || i === 0);
}

const isFolder = (item: BinderItem) => item.type === "Folder" || item.type === "DraftFolder" || item.children.length > 0;

/** Documents texte d'un dossier, à toute profondeur, dans l'ordre du classeur (dossiers compris : leur texte compte). */
function textDocs(items: BinderItem[]): BinderItem[] {
  const out: BinderItem[] = [];
  for (const item of items) {
    if (item.type === "Text" || item.type === "Folder") out.push(item);
    out.push(...textDocs(item.children));
  }
  return out;
}

export function scrivenerToProject(source: ScrivenerSource, newId: () => string): { project: Project; report: ScrivenerReport } | null {
  const { binder } = source;
  const draft = binder.items.find((i) => i.type === "DraftFolder");
  if (!draft) return null;
  const excluded: string[] = [];
  const chapters: ImportedChapter[] = [];

  /** Fiche d'une scène tirée d'un document : synopsis et statut. */
  const ficheOf = (item: BinderItem, doc: ScrivenerDoc): Record<string, string> => {
    const fiche: Record<string, string> = {};
    if (doc.synopsis.trim()) fiche.synopsis = doc.synopsis.trim();
    const status = item.statusId ? statusOf(binder.statuses[item.statusId] ?? "") : null;
    if (status) fiche.statut = status;
    return fiche;
  };

  for (const top of draft.children) {
    const title = chapterTitle(top.title);
    const role: ImportedChapter["role"] = PROLOGUE.test(top.title.trim()) ? "prologue" : EPILOGUE.test(top.title.trim()) ? "epilogue" : null;
    const scenes: string[][] = [];
    const sceneMeta: ImportedChapter["sceneMeta"] = [];
    const addDoc = (item: BinderItem, first: boolean, ownTitle: boolean) => {
      const doc = source.doc(item.uuid);
      if (!item.includeInCompile) excluded.push(item.title || title);
      const parts = splitScenes(doc.paras);
      // Un dossier sans texte ne fait pas de scène ; un document sans texte en fait une (plan en cours d'écriture).
      if (item.type === "Folder" && parts.length === 1 && parts[0].length === 0) return;
      parts.forEach((paras, k) => {
        scenes.push(paras);
        const fiche = k === 0 ? ficheOf(item, doc) : {};
        const sceneTitle = k === 0 && ownTitle ? (first ? chapterTitle(item.title) : item.title.trim()) : "";
        sceneMeta.push({ ...(sceneTitle ? { title: sceneTitle } : {}), ...(Object.keys(fiche).length ? { fiche } : {}) });
      });
    };
    if (isFolder(top)) {
      // Dossier de premier niveau : un chapitre ; son propre texte d'abord, puis ses documents.
      addDoc(top, true, false);
      for (const item of textDocs(top.children)) addDoc(item, false, item.type === "Text");
    } else if (top.type === "Text") {
      // Document de premier niveau : un chapitre, coupé en scènes à ses séparateurs.
      addDoc(top, true, true);
    } else continue;
    if (scenes.length === 0) continue;
    chapters.push({ title, role, scenes, sceneMeta });
  }

  if (chapters.length === 0) return null;
  const project = bookToProject({ title: source.name, author: null, chapters }, { fileName: source.name, newId });
  return { project, report: { chapters: chapters.length, scenes: project.cards.filter((c) => c.type === "scene").length, excluded } };
}
