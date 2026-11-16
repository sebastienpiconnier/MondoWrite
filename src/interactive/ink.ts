// Roman interactif → Ink (lot 3, docs/plan-roman-interactif.md) : fonctions pures, testées.
//
// Le projet devient un seul texte Ink : une section (knot) par scène, du nom de la scène (`sceneSlugs`), son texte en
// lignes, ses images en étiquettes `# image: nom`, puis ses choix tels qu'écrits dans le bloc ```choix. Une scène
// sans choix finit l'histoire (`-> END`). La compilation (inkjs) se fait ailleurs, chargée à la demande ; ce fichier
// ne fait que composer le texte, et garde pour chaque ligne la scène d'où elle vient, pour dire où est une erreur.

import { htmlToBlocks, type Block } from "../export/doc";
import { END_TARGET, choicesIn, type SceneRef } from "./choices";
import { inkDeclarations, storyFacts } from "./facts";

/** Étiquette Ink d'une image du texte : `# image: nom.jpg` (nom d'un fichier de medias/). */
export const IMAGE_TAG = "image:";

/**
 * Texte de l'auteur rendu inerte pour Ink : barre oblique inverse devant tout ce qu'Ink lirait comme une
 * instruction (accolades, crochets, barre verticale, dièse, flèches, colle, commentaires, et en début de ligne
 * les marques de choix, de rassemblement, de logique et de section).
 */
export function escapeInk(text: string): string {
  let out = text
    .replace(/\\/g, "\\\\")
    .replace(/[{}[\]|#]/g, (c) => `\\${c}`)
    .replace(/->/g, "-\\>")
    .replace(/<-/g, "<\\-")
    .replace(/<>/g, "<\\>")
    .replace(/\/(?=[/*])/g, "/\\");
  if (/^\s*[*+\-~=(]/.test(out)) out = out.replace(/^(\s*)/, "$1\\");
  return out;
}

const blockText = (b: Block): string =>
  b.kind === "image"
    ? ""
    : b.runs
        .map((r) => r.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();

export interface InkLine {
  /** Scène d'où vient la ligne (rien pour la ligne de départ). */
  scene?: string;
}

export interface InkSource {
  /** Le texte Ink, une ligne par élément de `lines`. */
  ink: string;
  lines: InkLine[];
  /** Nom de chaque scène dans le texte Ink. */
  knots: ReadonlyMap<string, string>;
}

/**
 * Compose le texte Ink du projet. `scenes` dans l'ordre du livre (la première est le départ), `slugs` leurs noms,
 * `manuscript` le HTML de chaque scène.
 */
export function projectToInk(
  scenes: readonly SceneRef[],
  slugs: ReadonlyMap<string, string>,
  manuscript: Readonly<Record<string, string>>,
  factLabels: Readonly<Record<string, string>> = {},
  /** Texte d'un choix laissé vide : Ink cacherait un choix sans texte (choix de repli). */
  emptyLabel = "…",
): InkSource {
  const out: string[] = [];
  const lines: InkLine[] = [];
  const push = (text: string, scene?: string) => {
    out.push(text);
    lines.push(scene ? { scene } : {});
  };
  // Faits et compteurs (lot 4) : déclarés en tête, faux ou à zéro au départ.
  const facts = storyFacts(manuscript, scenes.map((s) => s.id), new Set(slugs.values()), factLabels);
  for (const decl of inkDeclarations(facts)) push(decl);
  const first = scenes[0];
  push(first ? `-> ${slugs.get(first.id)}` : `-> ${END_TARGET}`);
  for (const s of scenes) {
    const knot = slugs.get(s.id);
    if (!knot) continue;
    push("", s.id);
    push(`=== ${knot} ===`, s.id);
    for (const b of htmlToBlocks(manuscript[s.id])) {
      if (b.kind === "image") push(`# ${IMAGE_TAG} ${b.name}`, s.id);
      else {
        const text = blockText(b);
        if (text) push(escapeInk(text), s.id);
      }
    }
    const choices = choicesIn(manuscript[s.id]);
    for (const line of choices) {
      if (line.kind === "raw") push(line.text, s.id);
      else {
        const head = `* ${line.cond?.trim() ? `{ ${line.cond.trim()} } ` : ""}[${escapeInk(line.label.trim() || emptyLabel).trimStart()}]`;
        if (!line.effects?.length) push(`${head} -> ${line.target}`, s.id);
        else {
          push(head, s.id);
          for (const e of line.effects) push(`  ~ ${e}`, s.id);
          push(`  -> ${line.target}`, s.id);
        }
      }
    }
    // Sans choix ni renvoi écrit par l'auteur, la scène finit l'histoire.
    if (!choices.some((l) => l.kind === "choice" || /^\s*->/.test(l.text))) push(`-> ${END_TARGET}`, s.id);
  }
  return { ink: `${out.join("\n")}\n`, lines, knots: slugs };
}

export interface InkProblem {
  message: string;
  /** Scène où se trouve la ligne fautive, si on la connaît. */
  scene?: string;
}

/** Erreurs et avertissements du compilateur (« ERROR: line 12: … ») rapportés à leur scène. */
export function inkProblems(messages: readonly string[], source: InkSource): InkProblem[] {
  return messages.map((raw) => {
    const m = /line (\d+):\s*(.*)$/s.exec(raw);
    const line = m ? source.lines[Number(m[1]) - 1] : undefined;
    const message = (m ? m[2] : raw.replace(/^(ERROR|WARNING|TODO):\s*/, "")).trim();
    return line?.scene ? { message, scene: line.scene } : { message };
  });
}

/** Scène d'un chemin Ink (« la_cour.0.c-1 » → identifiant de la scène), ou null. */
export function sceneOfPath(path: string | null | undefined, knots: ReadonlyMap<string, string>): string | null {
  const knot = path?.split(".")[0];
  if (!knot) return null;
  for (const [id, slug] of knots) if (slug === knot) return id;
  return null;
}

/** Images d'une ligne lue (étiquettes `image: nom`). */
export const imagesOfTags = (tags: readonly string[] | null | undefined): string[] =>
  (tags ?? []).flatMap((t) => {
    const m = /^\s*image:\s*(\S+)\s*$/.exec(t);
    return m ? [m[1]] : [];
  });
