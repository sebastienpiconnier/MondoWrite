// Roman interactif, lot 15 (#95) : le parcours de lecture annoté. Le mode Lecture garde le chemin suivi (numéros des
// sections du livre-jeu, choix faits) et une note par étape ; rien n'est enregistré dans le projet, sauf les notes
// que l'auteur garde en commentaires de leurs scènes. Fonctions pures, testées.

/** Une étape du parcours : la scène où l'on arrive, le choix qui y mène, la note de l'auteur. */
export interface PathStep {
  scene: string | null;
  chose?: string;
  note?: string;
}

export interface PathTexts {
  title: string;
  choice: string;
  note: string;
  untitled: string;
}

/** Le chemin en numéros : « 1 → 34 → 112 » (une étape sans numéro connu est sautée). */
export function pathLine(steps: readonly PathStep[], numbers: Readonly<Record<string, number>>): string {
  const out: number[] = [];
  for (const s of steps) {
    const n = s.scene ? numbers[s.scene] : undefined;
    if (n !== undefined && out[out.length - 1] !== n) out.push(n);
  }
  return out.join(" → ");
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
/** Une ligne de Markdown sans ses retours (une note tient sur sa ligne de liste). */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

/** Le parcours en Markdown, lisible tel quel : titre, chemin, puis chaque étape avec son choix et sa note. */
export function pathMarkdown(
  steps: readonly PathStep[],
  numbers: Readonly<Record<string, number>>,
  titles: ReadonlyMap<string, string>,
  texts: PathTexts,
): string {
  const lines = [`# ${oneLine(texts.title)}`, "", pathLine(steps, numbers), ""];
  steps.forEach((s, i) => {
    const n = s.scene ? numbers[s.scene] : undefined;
    const title = (s.scene && titles.get(s.scene)?.trim()) || texts.untitled;
    lines.push(`${i + 1}. **${n !== undefined ? `${n}. ` : ""}${oneLine(title)}**`);
    if (s.chose !== undefined) lines.push(`   - ${fill(texts.choice, { choice: oneLine(s.chose) })}`);
    if (s.note?.trim()) lines.push(`   - ${fill(texts.note, { note: oneLine(s.note) })}`);
  });
  return `${lines.join("\n")}\n`;
}

/** Notes à garder en commentaires : une par étape notée, dans l'ordre, avec sa scène. */
export const pathNotes = (steps: readonly PathStep[]) =>
  steps.flatMap((s) => (s.scene && s.note?.trim() ? [{ scene: s.scene, note: s.note.trim() }] : []));

/**
 * Début du texte d'une scène, pour y ancrer un commentaire : les premiers mots du premier nœud de texte (un passage
 * d'un seul tenant, comme le veut une marque de commentaire). null si la scène n'a pas de texte.
 */
export function openingWords(html: string | undefined, max = 8): string | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("pre[data-choices]").forEach((el) => el.remove());
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    // Les premiers mots, recopiés tels qu'écrits (espaces insécables compris) : la marque cherche ce passage exact.
    const m = new RegExp(`^\\s*((?:\\S+\\s+){0,${max - 1}}\\S+)`).exec(text);
    if (m) return m[1];
  }
  return null;
}
