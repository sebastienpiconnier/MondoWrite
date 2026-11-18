// Roman interactif, lot 8 : fabrique le livre-jeu du projet ouvert (EPUB ou PDF), par les exports ordinaires.

import { exportDocument } from "../export";
import { fmt, getT } from "../i18n";
import type { ExportedFile } from "../screenplay/export";
import { storage } from "../storage";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { readFactLabels } from "./facts";
import { gamebookBook, gamebookDoc } from "./gamebook";
import type { BookDoc } from "../export/paperback";
import { interactiveScenes, interactiveSlugs } from "./scenes";
import { projectSections } from "./projectSections";

/** Le livre-jeu du projet ouvert (document commun aux exports), ou null s'il n'y a pas encore de scène. */
function projectGamebook(title: string, author: string) {
  const t = getT();
  const state = useCosmos.getState();
  const { nodes, plan, manuscript, metaKeep } = state;
  const scenes = interactiveScenes(nodes, plan);
  if (scenes.length === 0) return null;
  return gamebookDoc({
    title,
    author,
    lang: useSettings.getState().lang,
    scenes,
    slugs: interactiveSlugs(nodes, plan),
    manuscript,
    factLabels: readFactLabels(metaKeep),
    texts: t.interactive.gamebook,
    numbers: projectSections(state).numbers,
  }).doc;
}

/** Le livre broché d'un roman interactif : les pages du livre (`base`, celles du roman), puis le livre-jeu. */
export function gamebookPaperback(base: BookDoc): BookDoc {
  const doc = projectGamebook(base.title, base.author);
  return doc ? gamebookBook(base, doc) : { ...base, sections: base.sections.filter((s) => s.kind === "page") };
}

/** Le livre-jeu, ou null s'il n'y a pas encore de scène. */
export async function gamebookFile(format: "epub" | "pdf", title: string, author: string): Promise<ExportedFile | null> {
  const doc = projectGamebook(title, author);
  if (!doc) return null;
  const t = getT();
  const full = await (await import("../export/images")).withImages(doc, (n) => storage.mediaUrl(n));
  return exportDocument(full, format, { name: fmt(t.interactive.gamebook.name, { title }), paper: useCosmos.getState().paper, contents: t.exports.contents });
}
