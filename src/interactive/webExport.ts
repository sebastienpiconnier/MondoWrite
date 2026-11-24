// Roman interactif, lot 7 : fabrique la page web jouable du projet ouvert. Le compilateur, le moteur recopié
// dans la page et les images ne sont chargés qu'ici, à l'export. En deux temps (#125) : `prepareStoryWeb` compile
// l'histoire et encode les images (ce qui prend du temps), `buildStoryWeb` assemble la page seule ou l'archive
// (immédiat) : la fenêtre d'export affiche ainsi le poids avant d'enregistrer.

import { fmt, getT } from "../i18n";
import { zip } from "../export/zip";
import { fileName, type ExportedFile } from "../screenplay/export";
import { storage } from "../storage";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { readFactLabels } from "./facts";
import { projectFacts } from "./projectFacts";
import { choicesIn, isEndingScene, sceneEnding } from "./choices";
import { inkProblems, projectToInk, type InkProblem } from "./ink";
import { interactiveScenes, interactiveSlugs } from "./scenes";
import { bookId, storyImageNames, storyPage, type WebEnding, type WebPageTexts } from "./webPage";
import { readWebPage, type WebFormat, type WebPageOptions, type WebQuality } from "./webThemes";
import { dataUrl, dedupeImages, encodeWebImage, type WebImage } from "./webImages";
import { imageAlts } from "./imageAlts";

/** L'histoire ne se compile pas (les points sont ceux de « Lire l'histoire »). */
export class StoryCompileError extends Error {
  constructor(public problems: InkProblem[]) {
    super("ink");
  }
}

/** Ce qu'il faut pour assembler la page : histoire compilée, moteur, images encodées. */
export interface PreparedWeb {
  title: string;
  author?: string;
  tagline?: string;
  lang: string;
  storyJson: string;
  runtime: string;
  license: string;
  images: Record<string, WebImage>;
  coverName?: string;
  alts: Record<string, string>;
  facts: { name: string; label: string }[];
  endings: WebEnding[];
  book: string;
  quality: WebQuality;
}

/** Compile l'histoire du projet ouvert et encode ses images ; null s'il n'y a pas encore de scène. */
export async function prepareStoryWeb(title: string, author: string, quality: WebQuality): Promise<PreparedWeb | null> {
  const t = getT();
  const { nodes, plan, manuscript, metaKeep, pitch } = useCosmos.getState();
  const scenes = interactiveScenes(nodes, plan);
  if (scenes.length === 0) return null;
  const slugs = interactiveSlugs(nodes, plan);
  // Gras et italique gardés en marques (#122), scène en cours notée pour les fins trouvées (#124).
  const source = projectToInk(scenes, slugs, manuscript, readFactLabels(metaKeep), t.interactive.map.defaultLabel, { marks: true, track: true });
  const [{ Compiler }, runtime, license] = await Promise.all([
    import("inkjs/full"),
    // Fichiers d'inkjs tels que publiés, lus en texte. Chemin relatif et non nom de paquet : le préchargement
    // des dépendances de Vite ferait un module du moteur (le paquet ne déclare pas ces fichiers).
    import("../../node_modules/inkjs/dist/ink.js?raw").then((m) => m.default),
    import("../../node_modules/inkjs/LICENSE.md?raw").then((m) => m.default),
  ]);
  const compiler = new Compiler(source.ink);
  let storyJson: string | undefined;
  try {
    storyJson = compiler.Compile().ToJson() ?? undefined;
  } catch {
    // erreurs lues ci-dessous
  }
  if (!storyJson) throw new StoryCompileError(inkProblems(compiler.errors.length ? compiler.errors : [t.interactive.play.failed], source));

  const names = storyImageNames(source);
  // Couverture du projet (#121) : en tête de l'accueil de la page.
  const cover = pitch.visuel;
  const images: Record<string, WebImage> = {};
  for (const name of new Set([...names, ...(cover ? [cover] : [])])) {
    const url = await storage.mediaUrl(name).catch(() => null);
    if (!url) continue;
    try {
      images[name] = await encodeWebImage(url, quality);
    } catch {
      // image illisible : laissée de côté
    } finally {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
  }
  // Description de chaque image, telle que l'auteur l'a écrite dans le texte (#126).
  const alts = Object.fromEntries(Object.entries(imageAlts(scenes, manuscript)).filter(([name]) => names.includes(name)));
  // Fins de l'histoire (#124) : chaque scène qui peut la finir, avec son type.
  const endings: WebEnding[] = [];
  for (const s of scenes) {
    const lines = choicesIn(manuscript[s.id]);
    const id = slugs.get(s.id);
    if (id && isEndingScene(lines)) endings.push({ id, kind: sceneEnding(lines) });
  }
  return {
    title: title.trim() || t.interactive.web.untitled,
    author: author.trim() || undefined,
    tagline: pitch.tagline?.trim() || undefined,
    lang: useSettings.getState().lang,
    storyJson,
    runtime,
    license,
    images,
    coverName: cover && images[cover] ? cover : undefined,
    alts,
    facts: projectFacts(useCosmos.getState()).map((f) => ({ name: f.name, label: f.label })),
    endings,
    book: bookId(storage.current?.() ?? title),
    quality,
  };
}

/** Textes de la page, dans la langue de l'interface. */
function pageTexts(): WebPageTexts {
  const t = getT();
  const p = t.interactive.play;
  const w = t.interactive.web;
  const map = t.interactive.map;
  return {
    restart: p.restart,
    back: p.back,
    end: p.end,
    known: t.interactive.facts.known,
    value: t.interactive.facts.value,
    noScript: w.noScript,
    failed: w.failed,
    madeWith: w.madeWith,
    start: w.start,
    continue: w.continue,
    home: w.home,
    skip: w.skip,
    choices: w.choices,
    choiceOf: w.choiceOf,
    image: w.image,
    display: w.display,
    theme: w.theme,
    modeAuto: w.modeAuto,
    modeLight: w.modeLight,
    modeDark: w.modeDark,
    textSize: w.textSize,
    sizeSmall: w.sizeSmall,
    sizeMedium: w.sizeMedium,
    sizeLarge: w.sizeLarge,
    endingsFound: w.endingsFound,
    endingsGood: w.endingsGood,
    endingsBad: w.endingsBad,
    endGood: map.endGood,
    endBad: map.endBad,
    exportSave: w.exportSave,
    importSave: w.importSave,
    importDone: w.importDone,
    importOther: w.importOther,
    importVersion: w.importVersion,
    importBad: w.importBad,
    noStorage: w.noStorage,
  };
}

/** La page seule (images en `data:`) ou l'archive pour itch.io (`index.html` et le dossier images/). */
export function buildStoryWeb(prepared: PreparedWeb, options: Pick<WebPageOptions, "theme" | "css" | "back"> & { format: WebFormat }): ExportedFile {
  const w = getT().interactive.web;
  const inline = options.format === "html";
  const { files, byName } = dedupeImages(prepared.images);
  const sources = Object.fromEntries(Object.entries(files).map(([file, img]) => [file, inline ? dataUrl(img) : `images/${file}`]));
  const html = storyPage({
    title: prepared.title,
    author: prepared.author,
    tagline: prepared.tagline,
    cover: prepared.coverName ? { file: byName[prepared.coverName], alt: fmt(w.coverAlt, { title: prepared.title }) } : undefined,
    lang: prepared.lang,
    storyJson: prepared.storyJson,
    runtime: prepared.runtime,
    runtimeLicense: prepared.license,
    sources,
    images: byName,
    alts: prepared.alts,
    facts: prepared.facts,
    book: prepared.book,
    endings: prepared.endings,
    allowBack: options.back,
    saveName: `${fileName(fmt(w.saveName, { title: prepared.title }), "mondowrite")}.json`,
    theme: options.theme,
    customCss: options.css,
    texts: pageTexts(),
  });
  const base = fileName(prepared.title, "mondowrite");
  if (inline) return { name: `${base}.html`, extension: "html", mime: "text/html", data: new TextEncoder().encode(html) };
  const data = zip([{ path: "index.html", data: html }, ...Object.entries(files).map(([file, img]) => ({ path: `images/${file}`, data: img.data }))]);
  return { name: `${base}.zip`, extension: "zip", mime: "application/zip", data };
}

/** La page avec les réglages gardés dans le projet (export direct, sur téléphone), ou null sans scène. */
export async function storyWebFile(title: string, author: string): Promise<ExportedFile | null> {
  const options = readWebPage(useCosmos.getState().metaKeep);
  const prepared = await prepareStoryWeb(title, author, options.quality);
  return prepared ? buildStoryWeb(prepared, options) : null;
}
