// Roman interactif, lot 7 : fabrique la page web jouable du projet ouvert. Le compilateur, le moteur recopié
// dans la page et les images ne sont chargés qu'ici, à l'export.

import { getT } from "../i18n";
import { fileName, type ExportedFile } from "../screenplay/export";
import { storage } from "../storage";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { readFactLabels } from "./facts";
import { projectFacts } from "./projectFacts";
import { inkProblems, projectToInk, type InkProblem } from "./ink";
import { interactiveScenes, interactiveSlugs } from "./scenes";
import { storyImageNames, storyPage } from "./webPage";

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
  const { nodes, plan, manuscript, metaKeep } = useCosmos.getState();
  const scenes = interactiveScenes(nodes, plan);
  if (scenes.length === 0) return null;
  const source = projectToInk(scenes, interactiveSlugs(nodes, plan), manuscript, readFactLabels(metaKeep), t.interactive.map.defaultLabel);
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
  const images: Record<string, string> = {};
  if (names.length) {
    const loaded = await (await import("../export/images")).loadImages(names, (n) => storage.mediaUrl(n));
    for (const [name, img] of Object.entries(loaded)) images[name] = `data:image/jpeg;base64,${toBase64(img.data)}`;
  }

  const { lang } = useSettings.getState();
  const facts = projectFacts(useCosmos.getState()).map((f) => ({ name: f.name, label: f.label }));
  const p = t.interactive.play;
  const w = t.interactive.web;
  const html = storyPage({
    title: title.trim() || w.untitled,
    author: author.trim() || undefined,
    lang,
    storyJson,
    runtime,
    runtimeLicense: license,
    images,
    facts,
    texts: {
      restart: p.restart,
      back: p.back,
      end: p.end,
      known: t.interactive.facts.known,
      value: t.interactive.facts.value,
      noScript: w.noScript,
      failed: w.failed,
      madeWith: w.madeWith,
    },
  });
  return { name: `${fileName(title, "mondowrite")}.html`, extension: "html", mime: "text/html", data: new TextEncoder().encode(html) };
}
