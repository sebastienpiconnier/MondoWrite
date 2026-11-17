// Roman interactif, lot 8 : fabrique le livre-jeu du projet ouvert (EPUB ou PDF), par les exports ordinaires.

import { exportDocument } from "../export";
import { fmt, getT } from "../i18n";
import type { ExportedFile } from "../screenplay/export";
import { storage } from "../storage";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { readFactLabels } from "./facts";
import { gamebookDoc } from "./gamebook";
import { interactiveScenes, interactiveSlugs } from "./scenes";

/** Le livre-jeu, ou null s'il n'y a pas encore de scène. */
export async function gamebookFile(format: "epub" | "pdf", title: string, author: string): Promise<ExportedFile | null> {
  const t = getT();
  const { nodes, plan, manuscript, metaKeep, paper } = useCosmos.getState();
  const scenes = interactiveScenes(nodes, plan);
  if (scenes.length === 0) return null;
  const { lang } = useSettings.getState();
  const { doc } = gamebookDoc({
    title,
    author,
    lang,
    scenes,
    slugs: interactiveSlugs(nodes, plan),
    manuscript,
    factLabels: readFactLabels(metaKeep),
    texts: t.interactive.gamebook,
  });
  const full = await (await import("../export/images")).withImages(doc, (n) => storage.mediaUrl(n));
  return exportDocument(full, format, { name: fmt(t.interactive.gamebook.name, { title }), paper, contents: t.exports.contents });
}
