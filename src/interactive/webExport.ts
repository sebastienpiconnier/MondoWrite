// Roman interactif, lot 7 : fabrique la page web jouable du projet ouvert. Le compilateur, le moteur recopié
// dans la page et les images ne sont chargés qu'ici, à l'export.

import { fmt, getT } from "../i18n";
import { htmlToBlocks } from "../export/doc";
import { fileName, type ExportedFile } from "../screenplay/export";
import { storage } from "../storage";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { readFactLabels } from "./facts";
import { projectFacts } from "./projectFacts";
import { inkProblems, projectToInk, type InkProblem } from "./ink";
import { interactiveScenes, interactiveSlugs } from "./scenes";
import { storyImageNames, storyPage } from "./webPage";
import { readWebPage } from "./webThemes";

/** L'histoire ne se compile pas (les points sont ceux de « Lire l'histoire »). */
export class StoryCompileError extends Error {
  constructor(public problems: InkProblem[]) {
    super("ink");
  }
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** La page web de l'histoire, ou null s'il n'y a pas encore de scène. */
export async function storyWebFile(title: string, author: string): Promise<ExportedFile | null> {
  const t = getT();
  const { nodes, plan, manuscript, metaKeep, pitch } = useCosmos.getState();
  const scenes = interactiveScenes(nodes, plan);
  if (scenes.length === 0) return null;
  // Gras et italique gardés en marques (#122), lues par le lecteur de la page.
  const source = projectToInk(scenes, interactiveSlugs(nodes, plan), manuscript, readFactLabels(metaKeep), t.interactive.map.defaultLabel, { marks: true });
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
  const images: Record<string, string> = {};
  let coverSrc: string | undefined;
  if (names.length || cover) {
    const loaded = await (await import("../export/images")).loadImages([...names, ...(cover ? [cover] : [])], (n) => storage.mediaUrl(n));
    for (const [name, img] of Object.entries(loaded)) {
      const src = `data:image/jpeg;base64,${toBase64(img.data)}`;
      if (names.includes(name)) images[name] = src;
      if (name === cover) coverSrc = src;
    }
  }
  // Description de chaque image, telle que l'auteur l'a écrite dans le texte (#126).
  const alts: Record<string, string> = {};
  for (const s of scenes)
    for (const b of htmlToBlocks(manuscript[s.id]))
      if (b.kind === "image" && b.alt?.trim() && names.includes(b.name) && !alts[b.name]) alts[b.name] = b.alt.trim();

  const { lang } = useSettings.getState();
  const facts = projectFacts(useCosmos.getState()).map((f) => ({ name: f.name, label: f.label }));
  const p = t.interactive.play;
  const w = t.interactive.web;
  const options = readWebPage(metaKeep);
  const shownTitle = title.trim() || w.untitled;
  const html = storyPage({
    title: shownTitle,
    author: author.trim() || undefined,
    tagline: pitch.tagline?.trim() || undefined,
    cover: coverSrc ? { src: coverSrc, alt: fmt(w.coverAlt, { title: shownTitle }) } : undefined,
    lang,
    storyJson,
    runtime,
    runtimeLicense: license,
    images,
    alts,
    facts,
    theme: options.theme,
    customCss: options.css,
    texts: {
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
      display: w.display,
      theme: w.theme,
      modeAuto: w.modeAuto,
      modeLight: w.modeLight,
      modeDark: w.modeDark,
      textSize: w.textSize,
      sizeSmall: w.sizeSmall,
      sizeMedium: w.sizeMedium,
      sizeLarge: w.sizeLarge,
    },
  });
  return { name: `${fileName(title, "mondowrite")}.html`, extension: "html", mime: "text/html", data: new TextEncoder().encode(html) };
}
