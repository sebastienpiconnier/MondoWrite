// Roman interactif, lot 8 : le livre-jeu. Chaque scène devient une section numérotée ; la première scène est
// la section 1, les autres sont mélangées (toujours de la même façon tant que les scènes ne changent pas), et
// chaque choix se lit « … : rendez-vous au 12 ». Les faits deviennent des mots à noter. Le document obtenu
// passe par les exports ordinaires (EPUB, PDF). Fonctions pures.

import { htmlToBlocks, type Block, type Chapter, type ExportDoc, type Run } from "../export/doc";
import { quote } from "../typoRules";
import { choicesIn, divertEnding, END_TARGET, resolveTarget, type EndingKind, type SceneRef } from "./choices";
import { factLabel } from "./facts";
import { condPhrase, effectPhrase } from "./conditions";
import type { BookDoc, BookSection } from "../export/paperback";
import { sectionList } from "./sections";

/** Textes du livre, dans la langue de l'interface (gabarits à variables `{…}`). */
export interface GamebookTexts {
  /** Titre de la section d'ouverture. */
  howTitle: string;
  /** « Commencez au 1. … » */
  how: string;
  /** Phrase sur les mots à noter (seulement s'il y en a). */
  howFacts: string;
  /** « {label} : rendez-vous au {n}. » (le numéro est ajouté à part, `{n}` marque sa place) */
  choice: string;
  /** « {label} : {effects}, puis rendez-vous au {n}. » */
  choiceEffects: string;
  /** « {label} : fin de l'histoire. » */
  choiceEnd: string;
  /** Choix qui mène à une mauvaise fin (lot 14). */
  choiceEndBad: string;
  /** Renvoi sans libellé : « Rendez-vous au {n}. » */
  goTo: string;
  /** Section sans choix. */
  end: string;
  /** Fin d'une section qui est une mauvaise fin (lot 14). */
  endBad: string;
  /** Conditions : « Si {conds}, » et ses morceaux (conditions.ts). */
  cond: string;
  has: string;
  hasNot: string;
  visited: string;
  notVisited: string;
  atLeast: string;
  atMost: string;
  exactly: string;
  notExactly: string;
  and: string;
  or: string;
  /** Effets : « notez {fact} », « rayez {fact} », « inscrivez {n} pour {fact} », « ajoutez {n} à {fact} », « retirez {n} à {fact} » */
  note: string;
  unnote: string;
  set: string;
  add: string;
  remove: string;
}

export interface GamebookInput {
  title: string;
  author: string;
  lang: string;
  scenes: readonly SceneRef[];
  slugs: ReadonlyMap<string, string>;
  manuscript: Readonly<Record<string, string>>;
  factLabels: Readonly<Record<string, string>>;
  texts: GamebookTexts;
  /** Numéros figés (lot 12, projectSections) ; sans eux, le mélange de `numberSections`. */
  numbers?: Readonly<Record<string, number>>;
}

/** Une section du livre : sa scène et le numéro imprimé. */
export interface Section {
  id: string;
  n: number;
}

/** Graine stable tirée des scènes : même projet, même ordre ; une scène ajoutée ou retirée le change. */
export function seedOf(ids: readonly string[]): number {
  let h = 2166136261;
  for (const id of [...ids].sort()) for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Générateur pseudo-aléatoire (mulberry32), pour un mélange reproductible. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Destinations de chaque scène (choix et renvois écrits à la main), sans la fin. */
function targetsOf(input: Pick<GamebookInput, "scenes" | "slugs" | "manuscript">): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of input.scenes) {
    const to: string[] = [];
    for (const line of choicesIn(input.manuscript[s.id])) {
      const target = line.kind === "choice" ? line.target : /^\s*->\s*([\p{L}\p{N}_]+)\s*$/u.exec(line.text)?.[1];
      const id = target ? resolveTarget(target, input.slugs) : null;
      if (id && id !== END_TARGET) to.push(id);
    }
    out.set(s.id, to);
  }
  return out;
}

/** Choix qui mènent à la section suivante : un livre-jeu évite qu'on lise la réponse juste en dessous. */
const adjacent = (order: readonly string[], targets: ReadonlyMap<string, string[]>) =>
  order.reduce((n, id, i) => n + (targets.get(id) ?? []).filter((to) => order[i + 1] === to).length, 0);

/**
 * Numéros des sections : la première scène est le 1, les autres mélangées. Parmi quelques mélanges tirés de la
 * graine, celui où le moins de choix mènent à la section qui suit.
 */
export function numberSections(input: Pick<GamebookInput, "scenes" | "slugs" | "manuscript">, tries = 24): Section[] {
  const [first, ...rest] = input.scenes.map((s) => s.id);
  if (!first) return [];
  const targets = targetsOf(input);
  const rand = random(seedOf([first, ...rest]));
  let best: string[] = [first, ...rest];
  let bestScore = Infinity;
  for (let k = 0; k < Math.max(1, tries) && bestScore > 0; k++) {
    const mixed = [...rest];
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    const order = [first, ...mixed];
    const score = adjacent(order, targets);
    if (score < bestScore) {
      best = order;
      bestScore = score;
    }
  }
  return best.map((id, i) => ({ id, n: i + 1 }));
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);

/** Coupe un gabarit à la place de `{n}` : ce qui précède et ce qui suit le numéro. */
const around = (template: string, vars: Record<string, string>): [string, string] => {
  const text = fill(template, vars);
  const i = text.indexOf("{n}");
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + 3)];
};

/** Lettre capitale en tête (« Si vous… » après une condition, sinon le libellé tel quel). */
const capital = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/** Effet lu pour le lecteur : fait noté ou rayé, compteur posé, augmenté ou diminué ; null s'il ne se dit pas. */
function effectText(effect: string, input: GamebookInput): string | null {
  return effectPhrase(effect, input.texts, (name) => quote(factLabel(name, input.factLabels), input.lang));
}

/**
 * Le livre-jeu en document d'export : une section d'ouverture, puis une section par scène, dans l'ordre des
 * numéros. Le numéro d'un renvoi est un `Run` avec `chapter` (lien dans l'EPUB).
 */
export function gamebookDoc(input: GamebookInput): { doc: ExportDoc; sections: Section[] } {
  const { texts, lang } = input;
  const present = new Set(input.scenes.map((s) => s.id));
  const sections = input.numbers ? sectionList(input.numbers).filter((s) => present.has(s.id)) : numberSections(input);
  const numberOf = new Map(sections.map((s) => [s.id, s.n]));
  // Section d'ouverture en tête : la k-ième section est le chapitre k du document (un numéro libéré laisse un trou).
  const chapterOf = new Map(sections.map((s, i) => [s.id, i + 1]));
  const link = (id: string): Run => ({ text: String(numberOf.get(id)), chapter: chapterOf.get(id)! });
  const usesFacts = sections.some((s) => choicesIn(input.manuscript[s.id]).some((l) => l.kind === "choice" && (l.cond?.trim() || l.effects?.length)));

  const names = {
    section: (name: string) => {
      const scene = resolveTarget(name, input.slugs);
      return scene && scene !== END_TARGET ? (numberOf.get(scene) ?? null) : null;
    },
    fact: (name: string) => quote(factLabel(name, input.factLabels), lang),
  };
  // Une condition que le livre ne sait pas dire : le choix s'imprime sans elle (le vérificateur le signale).
  const condText = (cond: string | undefined): string => condPhrase(cond, texts, names) ?? "";
  // Phrase de fin selon son type (lot 14) : une bonne fin laisse le texte de l'auteur conclure.
  const endText = (kind: EndingKind | null) => (kind === "good" ? "" : kind === "bad" ? texts.endBad : texts.end);

  const chapters: Chapter[] = [
    {
      title: texts.howTitle,
      blocks: [{ kind: "paragraph", runs: [{ text: texts.how }] }, ...(usesFacts ? [{ kind: "paragraph" as const, runs: [{ text: texts.howFacts }] }] : [])],
    },
  ];
  for (const s of sections) {
    const blocks: Block[] = htmlToBlocks(input.manuscript[s.id]);
    const lines: Run[][] = [];
    let ends = true;
    for (const line of choicesIn(input.manuscript[s.id])) {
      if (line.kind === "raw") {
        const target = /^\s*->\s*([\p{L}\p{N}_]+)(?:\s+#(?:good|bad))?\s*$/u.exec(line.text)?.[1];
        const id = target ? resolveTarget(target, input.slugs) : null;
        if (!id) continue;
        ends = false;
        if (id === END_TARGET) {
          const close = endText(divertEnding(line.text) ?? null);
          if (close) lines.push([{ text: close }]);
        }
        else {
          const [before, after] = around(texts.goTo, {});
          lines.push([{ text: before }, link(id), { text: after }]);
        }
        continue;
      }
      ends = false;
      // Renvoi caché (lot 12) : jamais imprimé, le texte de la section dit comment trouver la suite.
      if (line.hidden) continue;
      const id = resolveTarget(line.target, input.slugs);
      const cond = condText(line.cond);
      const label = line.label.trim();
      // Un choix sans texte (« Continuer ») : « Rendez-vous au 6. », sans libellé devant.
      if (!label && !cond && id && id !== END_TARGET && !line.effects?.length) {
        const [before, after] = around(texts.goTo, {});
        lines.push([{ text: before }, link(id), { text: after }]);
        continue;
      }
      const shown = label || "…";
      const lead = cond ? `${cond} ${shown.charAt(0).toLocaleLowerCase()}${shown.slice(1)}` : shown;
      if (!id || id === END_TARGET) {
        // Destination introuvable : on écrit le choix comme une fin, le vérificateur l'a déjà signalé.
        lines.push([{ text: capital(fill(line.ending === "bad" ? texts.choiceEndBad : texts.choiceEnd, { label: lead })) }]);
        continue;
      }
      const effects = (line.effects ?? []).map((e) => effectText(e, input)).filter((e): e is string => !!e);
      const [before, after] = around(effects.length ? texts.choiceEffects : texts.choice, { label: lead, effects: effects.join(", ") });
      lines.push([{ text: capital(before) }, link(id), { text: after }]);
    }
    // Une scène sans aucun choix finit l'histoire, sans type (un type s'écrit en `-> END #bad`, lu plus haut).
    if (ends) lines.push([{ text: texts.end }]);
    for (const runs of lines) blocks.push({ kind: "paragraph", runs: runs.filter((r) => r.text) });
    chapters.push({ title: String(s.n), blocks });
  }
  return { doc: { title: input.title, author: input.author, lang, chapters }, sections };
}

/**
 * Le livre broché d'un livre-jeu (lot B, novembre 2026) : les pages du livre de l'auteur (titre, copyright,
 * dédicace, épigraphe, prologue, remerciements, l'auteur), puis « Avant de commencer » et les sections numérotées,
 * que la mise en page fait se suivre (`section`). Un épilogue n'a pas de place dans un livre qui finit à plusieurs
 * endroits : il n'y est pas.
 */
export function gamebookBook(base: BookDoc, doc: ExportDoc): BookDoc {
  const pages = base.sections.filter((s) => s.kind === "page" && s.page !== "epilogue");
  const [intro, ...rest] = doc.chapters;
  const story: BookSection[] = [
    ...(intro ? [{ kind: "chapter" as const, label: "", title: intro.title, toc: intro.title, blocks: intro.blocks }] : []),
    ...rest.map((c) => ({ kind: "chapter" as const, label: "", title: c.title, toc: c.title, blocks: c.blocks, section: Number(c.title) })),
  ];
  return { ...base, sections: [...pages, ...story] };
}
