// Copies Markdown du projet, dans markdown/ : le manuscrit (roman), la bible et le canevas, lisibles hors de
// MondoWrite (Obsidian, Typora, un éditeur de texte, GitHub). Réécrites après chaque enregistrement quand leur
// texte change, jamais relues : la source reste cartes/, manuscrit/ et cosmos.json.
// Les mentions et les cartes reliées deviennent des liens vers la fiche (bible.md, sinon canevas.md), les
// images pointent vers medias/. Une version par jour dans versions/AAAA-MM-JJ/ : les 30 derniers jours, plus
// la dernière de chaque mois plus ancien.

import { storage, VERSIONS_DIR, type FileMap } from "./storage";
import type { CardType } from "./types";
import type { Messages } from "./i18n";
import { bibleOf, canvasOf, manuscriptOf, type ProjectDocSource } from "./export/projectDocs";
import { markdownAnchors, toMarkdown } from "./export/text";
import type { ExportDoc } from "./export/doc";

export const COPY_NAMES = ["manuscrit.md", "bible.md", "canevas.md"] as const;
export type CopyName = (typeof COPY_NAMES)[number];
/** Versions gardées en entier (jours) ; au-delà, la dernière de chaque mois. */
export const KEEP_DAYS = 30;

/** Jour local au format des dossiers de versions (AAAA-MM-JJ). */
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Les copies du projet : nom de fichier → texte. Un scénario n'a pas de manuscrit.md (scenario.fountain se
 * lit déjà d'un seul tenant) ; un fichier sans contenu n'est pas écrit.
 */
export function buildCopies(s: ProjectDocSource, ctx: { t: Messages; lang: string; author: string }, sections: CardType[]): Partial<Record<CopyName, string>> {
  const bible = bibleOf(s, ctx, sections);
  const canvas = s.nodes.length > 0 ? canvasOf(s, ctx) : null;
  const manuscript = s.kind === "roman" ? manuscriptOf(s, ctx) : null;
  const inBible = markdownAnchors(bible);
  const onCanvas = canvas ? markdownAnchors(canvas) : new Map<string, string>();
  // Une carte citée mène à sa fiche de la bible, sinon à sa place dans le canevas (rubrique masquée).
  const link = (from: CopyName) => (id: string) => {
    const bibleAnchor = inBible.get(id);
    if (bibleAnchor) return `${from === "bible.md" ? "" : "bible.md"}#${bibleAnchor}`;
    const canvasAnchor = onCanvas.get(id);
    return canvasAnchor ? `${from === "canevas.md" ? "" : "canevas.md"}#${canvasAnchor}` : null;
  };
  const write = (doc: ExportDoc, name: CopyName) => toMarkdown(doc, { media: "../medias/", link: link(name), note: ctx.t.copies.note });
  const out: Partial<Record<CopyName, string>> = {};
  if (manuscript && manuscript.chapters.length > 0) out["manuscrit.md"] = write(manuscript, "manuscrit.md");
  if (bible.chapters.length > 0) out["bible.md"] = write(bible, "bible.md");
  if (canvas && canvas.chapters.length > 0) out["canevas.md"] = write(canvas, "canevas.md");
  return out;
}

/** Une copie rangée dans versions/AAAA-MM-JJ/ : ses images sont deux dossiers plus haut. */
export const versionText = (text: string) => text.replace(/\]\(\.\.\/medias\//g, "](../../../medias/");

/**
 * Versions à supprimer : celles de plus de `keep` jours, sauf la dernière de chaque mois. Une date future
 * (horloge de l'appareil reculée) est gardée.
 */
export function versionsToRemove(days: string[], today: string, keep = KEEP_DAYS): string[] {
  const time = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const limit = time(today) - (keep - 1) * 86_400_000;
  const old = days.filter((d) => time(d) < limit).sort();
  const lastOfMonth = new Map<string, string>();
  for (const d of old) lastOfMonth.set(d.slice(0, 7), d);
  const kept = new Set(lastOfMonth.values());
  return old.filter((d) => !kept.has(d));
}

/** Copies déjà sur le disque, par projet : rien n'est réécrit (ni versionné) tant que le texte ne change pas. */
let known: { key: string; files: FileMap } | null = null;
let queue: Promise<void> = Promise.resolve();

/**
 * Met à jour markdown/ après un enregistrement réussi. `enabled` : réglage du projet. Les erreurs ne
 * remontent pas : une copie manquée ne doit jamais faire échouer l'enregistrement du projet.
 */
export function syncCopies(build: () => Partial<Record<CopyName, string>>, enabled: boolean, now = new Date()): Promise<void> {
  queue = queue.then(() => run(build, enabled, now)).catch((err) => console.error("Copies Markdown", err));
  return queue;
}

async function run(build: () => Partial<Record<CopyName, string>>, enabled: boolean, now: Date) {
  const store = storage.copies;
  const key = store?.key();
  if (!store || !key || !enabled) return;
  if (known?.key !== key) known = { key, files: await store.read([...COPY_NAMES]) };
  const files: FileMap = build();
  const changed = Object.entries(files).filter(([name, text]) => known!.files[name] !== text);
  const stale = COPY_NAMES.filter((name) => name in known!.files && !(name in files));
  if (changed.length === 0 && stale.length === 0) return;
  // Copies du jour, puis la version du jour (le dernier état de la journée), complète.
  const today = dayKey(now);
  const writes: FileMap = Object.fromEntries(changed);
  for (const [name, text] of Object.entries(files)) writes[`${VERSIONS_DIR}/${today}/${name}`] = versionText(text);
  await store.write(writes, [...stale, ...stale.map((name) => `${VERSIONS_DIR}/${today}/${name}`)]);
  known = { key, files };
  await store.removeVersions(versionsToRemove(await store.versions(), today));
}

/** Oublie les copies connues (tests, changement de projet sans clé distincte). */
export function forgetCopies() {
  known = null;
}
