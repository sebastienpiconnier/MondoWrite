// Un projet Scrivener lu (classeur et textes) → un projet roman MondoWrite (docs/plan-import-scrivener.md).
// Lot 1, le manuscrit : le dossier Manuscrit donne chapitres et scènes dans l'ordre du classeur, avec titre,
// synopsis et statut. Lot 2, le reste : dossiers Personnages et Lieux (fiches « Sketch » remplies), autres dossiers
// en cadres et cartes Idée, PDF, images et pages web, mots-clés en cartes reliées, étiquette renommée (point de vue
// ou intrigue), signets et liens internes en fils, commentaires et notes de bas de page, intertitres, images du
// texte, notes des documents. Rien de Scrivener n'est gardé dans les fichiers (pas d'UUID). Pur.

import type { CardData, CardType, Frame, Link, Project } from "../../types";
import type { Comments, SceneComment } from "../../comments";
import { cleanQuote } from "../../comments";
import { cleanNote } from "../../footnotes";
import { SYNOPSIS_MAX } from "../../cardText";
import { bookToProject, EPILOGUE, isSceneBreak, PROLOGUE, sceneTitle, type ImportedChapter, type ImportedPara } from "../manuscript";
import { statusOf, type Binder, type BinderItem } from "./binder";
import type { InspectorNote } from "./comments";
import { INLINE_MARK, type RtfImage, type RtfInline } from "./rtf";
import { readCharacterList, readSketch, type SketchKind } from "./sketch";
import { countWords } from "../../manuscript";
import { htmlToMarkdown } from "../../storage/markdown";
import { versionFile } from "../../versions";
import type { Progress } from "../../stats";
import type { PageKind } from "../../book";

/** Ce qu'on sait lire d'un document du classeur. */
export interface ScrivenerDoc {
  /** Paragraphes du texte (content.rtf), ou rien. */
  paras: ImportedPara[];
  synopsis: string;
  /** Notes du document (notes.rtf). */
  notes?: ImportedPara[];
  /** Images trouvées dans le texte. */
  images?: RtfImage[];
  /** Notes et annotations en ligne, au rang de leur repère dans le texte. */
  inline?: RtfInline[];
  /** Commentaires et notes de l'inspecteur (content.comments). */
  comments?: Map<string, InspectorNote>;
  /** Fichier d'un PDF ou d'une image de la Recherche. */
  media?: { ext: string; data: Uint8Array } | null;
}

/** Un instantané d'un document (Snapshots/) : titre donné dans Scrivener, date ISO avec fuseau, texte. */
export interface ScrivenerSnapshot {
  title: string;
  date: string;
  paras: ImportedPara[];
  inline?: RtfInline[];
}

export interface ScrivenerSource {
  /** Nom du projet (nom du .scriv, sans extension). */
  name: string;
  binder: Binder;
  doc: (uuid: string) => ScrivenerDoc;
  /** Instantanés d'un document, du plus ancien au plus récent (lot 3). */
  snapshots?: (uuid: string) => ScrivenerSnapshot[];
  /** Historique d'écriture (Files/writing.history), tel quel. */
  history?: string;
}

/** Textes que l'import écrit dans le projet (titres de cadres) : dans la langue de l'interface. */
export interface ScrivenerLabels {
  keywords: string;
  sceneNotes: string;
  textImages: string;
  notesOf: string;
  other: string;
  /** Cadre des pages du livre (dédicace, remerciements…). */
  pages: string;
  /** Titre d'une version tirée d'un instantané (« Instantané Scrivener »), suivi du titre de l'instantané s'il en a un. */
  snapshot: string;
}

const DEFAULT_LABELS: ScrivenerLabels = {
  keywords: "Mots-clés",
  sceneNotes: "Notes des scènes",
  textImages: "Images du texte",
  notesOf: "Notes : {title}",
  other: "Divers",
  pages: "Pages du livre",
  snapshot: "Instantané Scrivener",
};

export interface ScrivenerOptions {
  newId: () => string;
  labels?: ScrivenerLabels;
  /** Dossiers de premier niveau que l'auteur a décochés (identifiants du classeur). */
  exclude?: ReadonlySet<string>;
  /** Date des commentaires importés (ISO). */
  now?: string;
}

/** Ce que l'import a repris et ce qu'il a laissé : dit à l'auteur après l'import. */
export interface ScrivenerReport {
  chapters: number;
  scenes: number;
  characters: number;
  places: number;
  ideas: number;
  documents: number;
  images: number;
  links: number;
  keywords: number;
  comments: number;
  footnotes: number;
  wires: number;
  /** Titres des documents exclus de la compilation dans Scrivener, importés quand même. */
  excluded: string[];
  /** Statuts que MondoWrite n'a pas (statut inventé), avec le nombre de documents. */
  statuses: { label: string; count: number }[];
  /** Étiquettes de couleur (aux noms par défaut), avec le nombre de documents : non reprises. */
  labels: { label: string; count: number }[];
  /** Fiches de modèle jamais remplies, laissées de côté. */
  emptySketches: number;
  /** Documents d'un format que MondoWrite ne garde pas (son, vidéo, autre). */
  unsupported: string[];
  /** Documents de la corbeille de Scrivener, non repris. */
  trash: number;
  /** Dossiers décochés par l'auteur. */
  skippedFolders: string[];
  /** Instantanés repris en versions des scènes (lot 3). */
  versions: number;
  /** Pages du livre reconnues (dédicace, épigraphe, remerciements…). */
  pages: number;
  /** Jours de l'historique d'écriture repris dans les statistiques. */
  days: number;
}

/** Titres de documents qui sont des pages du livre, repliés (lot 3). Le prologue et l'épilogue restent des chapitres. */
const PAGE_TITLES: [RegExp, PageKind][] = [
  [/^(dedicace|dedication)s?$/, "dedicace"],
  [/^(epigraphe|epigraph|exergue)s?$/, "epigraphe"],
  [/^(remerciements?|acknowledge?ments?)$/, "remerciements"],
  [/^(copyright|mentions legales|droits)$/, "copyright"],
  [/^(a propos de l auteur|de l auteur|l auteur|about the author|author bio|biographie de l auteur)$/, "auteur"],
];
export const pageKindOf = (title: string): PageKind | null => {
  const t = fold(title);
  return PAGE_TITLES.find(([re]) => re.test(t))?.[1] ?? null;
};

/** Titres que Scrivener donne d'office à un instantané sans nom : il prend alors seulement le titre de l'import. */
const UNTITLED_SNAPSHOT = /^(untitled snapshot|instantane sans titre|sans titre|untitled)$/;

/**
 * Historique d'écriture de Scrivener (`<Day dwc="…">AAAA-MM-JJ</Day>`, `dwc` : mots du manuscrit gagnés ce jour-là)
 * → `progress` de MondoWrite (total au début et à la fin de chaque jour), reconstitué en remontant depuis le total
 * importé : la série de jours d'écriture et les statistiques ne repartent pas de zéro. Jamais sous zéro.
 */
export function historyProgress(xml: string, total: number): Progress {
  const days: [string, number][] = [];
  for (const m of xml.matchAll(/<Day\b([^>]*)>\s*(\d{4}-\d{2}-\d{2})\s*<\/Day>/g)) {
    const dwc = Number(m[1].match(/\bdwc="(-?\d+)"/)?.[1] ?? NaN);
    if (Number.isFinite(dwc) && dwc !== 0) days.push([m[2], dwc]);
  }
  days.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const progress: Progress = {};
  let end = Math.max(0, total);
  for (let i = days.length - 1; i >= 0; i--) {
    const [day, dwc] = days[i];
    const start = Math.max(0, end - dwc);
    if (start !== end) progress[day] = { start, end };
    end = start;
  }
  return progress;
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

/** Articles et titres ignorés pour reconnaître un nom (« La Sœur d'Ethan », « Monsieur Dubois »). */
const NAME_ARTICLES = new Set(["la", "le", "les", "the", "un", "une", "an", "monsieur", "madame", "mademoiselle", "mr", "mrs", "ms", "miss"]);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Nature d'un dossier hors Manuscrit, d'après son titre (ou son type pour la Recherche). */
export function folderKind(item: BinderItem): SketchKind | "research" | "other" {
  const t = fold(item.title);
  if (/^(characters?|personnages?|persos?|cast|protagonistes?|dramatis personae)\b/.test(t)) return "personnage";
  if (/^(locations?|lieux?|places?|settings?|decors?|world|monde|univers)\b/.test(t)) return "lieu";
  if (item.type === "ResearchFolder" || /^(research|recherches?|documentation|sources)\b/.test(t)) return "research";
  return "other";
}

/** Dossiers de premier niveau proposés au choix avant l'import (tout sauf le Manuscrit, la Corbeille et les modèles). */
export function scrivenerFolders(binder: Binder): { uuid: string; title: string; count: number }[] {
  const count = (items: BinderItem[]): number => items.reduce((n, i) => n + (i.type === "Folder" || i.type === "DraftFolder" ? 0 : 1) + count(i.children), 0);
  return binder.items
    .filter((i) => i.type !== "DraftFolder" && i.type !== "TrashFolder" && i.uuid !== binder.templateFolder?.toUpperCase())
    .map((i) => ({ uuid: i.uuid, title: i.title, count: (i.children.length || i.type === "Folder" || i.type === "ResearchFolder" ? 0 : 1) + count(i.children) }));
}

/** Les paragraphes d'un texte coupés en scènes aux séparateurs (***, #…) ; lignes vides retirées. */
function splitScenes(paras: ImportedPara[]): ImportedPara[][] {
  const scenes: ImportedPara[][] = [[]];
  for (const p of paras) {
    if (!p.text) continue;
    if (isSceneBreak(p.text)) {
      if (scenes[scenes.length - 1].length > 0) scenes.push([]);
      continue;
    }
    scenes[scenes.length - 1].push(p);
  }
  return scenes.filter((s, i) => s.length > 0 || i === 0);
}

const isFolder = (item: BinderItem) => item.type === "Folder" || item.type === "DraftFolder" || item.type === "ResearchFolder" || item.children.length > 0;

/** Documents d'un dossier, à toute profondeur, dans l'ordre du classeur (dossiers compris : leur texte compte). */
function flatten(items: BinderItem[]): BinderItem[] {
  const out: BinderItem[] = [];
  for (const item of items) {
    out.push(item);
    out.push(...flatten(item.children));
  }
  return out;
}

const STEP_X = 280;
const STEP_Y = 240;
const FRAME_COLS = 4;
const FRAME_TOP = 90;
const FRAME_PAD = 40;
const FRAME_GAP = 120;

export function scrivenerToProject(source: ScrivenerSource, options: ScrivenerOptions | (() => string)): { project: Project; medias: [string, Uint8Array][]; report: ScrivenerReport; versions: [string, string, string][] } | null {
  const opts: ScrivenerOptions = typeof options === "function" ? { newId: options } : options;
  const { newId } = opts;
  const labels = opts.labels ?? DEFAULT_LABELS;
  const now = opts.now ?? new Date().toISOString();
  const { binder } = source;
  const draft = binder.items.find((i) => i.type === "DraftFolder");
  if (!draft) return null;

  const report: ScrivenerReport = {
    chapters: 0, scenes: 0, characters: 0, places: 0, ideas: 0, documents: 0, images: 0, links: 0, keywords: 0, comments: 0, footnotes: 0, wires: 0,
    excluded: [], statuses: [], labels: [], emptySketches: 0, unsupported: [], trash: 0, skippedFolders: [],
    versions: 0, pages: 0, days: 0,
  };
  /** Scènes de chaque document du Manuscrit, dans l'ordre (pour ses instantanés). */
  const scenesOfDoc = new Map<string, { ids: string[]; title: string }>();
  /** Versions des scènes : carte, nom du fichier, contenu. */
  const versions: [string, string, string][] = [];
  const docs = new Map<string, ScrivenerDoc>();
  const docOf = (uuid: string) => {
    let d = docs.get(uuid);
    if (!d) docs.set(uuid, (d = source.doc(uuid)));
    return d;
  };
  /** Carte de chaque document importé (pour un document du Manuscrit : sa première scène). */
  const cardOf = new Map<string, string>();
  /** Cartes de chaque document (toutes ses scènes), pour les mots-clés et l'étiquette. */
  const cardsOf = new Map<string, string[]>();
  const extraCards: CardData[] = [];
  const links: Link[] = [];
  const medias: [string, Uint8Array][] = [];
  const comments: Comments = {};
  const manuscript: Record<string, string> = {};
  /** Liens internes vus dans les textes : carte → document cible. */
  const internal: [string, string][] = [];
  /** Cadres à poser à droite du récit : titre et cartes. */
  const groups: { title: string; ids: string[] }[] = [];
  const groupFor = (title: string) => {
    let g = groups.find((x) => x.title === title);
    if (!g) groups.push((g = { title, ids: [] }));
    return g;
  };
  const statusMiss = new Map<string, number>();
  const labelMiss = new Map<string, number>();

  const linked = new Set<string>();
  const link = (a: string, b: string, label = "") => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (linked.has(key)) return;
    linked.add(key);
    links.push({ id: newId(), source: a, target: b, label });
  };

  /**
   * HTML d'un paragraphe lu : commentaires et notes de l'inspecteur, notes et annotations en ligne, liens internes.
   * `scene` : la carte Scène qui reçoit les commentaires (absent hors du manuscrit : ils sont alors laissés).
   */
  const convert = (p: ImportedPara, doc: ScrivenerDoc, owner: string, scene: string | null): string => {
    let html = p.html;
    const annotations: SceneComment[] = [];
    html = html.replace(/<span data-scrivcmt="([^"]*)">([\s\S]*?)<\/span>/g, (_, id: string, inner: string) => {
      const note = doc.comments?.get(id);
      if (!note || !note.text) return inner;
      if (note.footnote) {
        if (!scene) return inner;
        report.footnotes += 1;
        return `${inner}<sup data-footnote="${attr(cleanNote(note.text))}"></sup>`;
      }
      if (!scene) return inner;
      const cid = newId();
      (comments[scene] ??= []).push({ id: cid, date: now, text: note.text, quote: cleanQuote(plain(inner)) } satisfies SceneComment);
      report.comments += 1;
      return `<span data-comment="${cid}">${inner}</span>`;
    });
    html = html.replace(/<span data-scrivlnk="([^"]*)">([\s\S]*?)<\/span>/g, (_, uuid: string, inner: string) => {
      internal.push([owner, uuid.toUpperCase()]);
      return inner;
    });
    html = html.replace(INLINE_MARK, (_, n: string) => {
      const item = doc.inline?.[Number(n)];
      if (!item?.text || !scene) return "";
      if (item.kind === "footnote") {
        report.footnotes += 1;
        return `<sup data-footnote="${attr(cleanNote(item.text))}"></sup>`;
      }
      // Une annotation n'entoure aucun passage : le commentaire porte sur son paragraphe.
      const comment: SceneComment = { id: newId(), date: now, text: item.text, quote: "" };
      (comments[scene] ??= []).push(comment);
      annotations.push(comment);
      report.comments += 1;
      return "";
    });
    for (const comment of annotations) {
      comment.quote = cleanQuote(plain(html));
      html = `<span data-comment="${comment.id}">${html}</span>`;
    }
    return p.heading ? `<h3>${html}</h3>` : `<p>${html}</p>`;
  };

  /** Notes d'un document (notes.rtf) en paragraphes HTML. */
  const notesHtml = (doc: ScrivenerDoc) => (doc.notes ?? []).filter((p) => p.text).map((p) => `<p>${p.html.replace(/<span data-scriv(?:cmt|lnk)="[^"]*">([\s\S]*?)<\/span>/g, "$1").replace(INLINE_MARK, "")}</p>`);

  /** Images du texte d'un document : une carte Image chacune, reliée à la carte du document. */
  const textImages = (doc: ScrivenerDoc, owner: string, title: string) => {
    (doc.images ?? []).forEach((img, k) => {
      const id = newId();
      const name = `${id}.${img.ext}`;
      medias.push([name, img.data]);
      extraCards.push({ id, type: "image", title: (doc.images!.length > 1 ? `${title} (${k + 1})` : title).trim(), html: "", image: name });
      groupFor(labels.textImages).ids.push(id);
      link(owner, id);
      report.images += 1;
    });
  };

  // ---- Le Manuscrit : chapitres et scènes ---------------------------------------------------------------------
  const chapters: ImportedChapter[] = [];
  /** Paragraphes et document de chaque scène, convertis une fois les identifiants connus. */
  const scenePieces: { id: string; paras: ImportedPara[]; doc: ScrivenerDoc; uuid: string; headTitle: string }[] = [];
  /** Notes de document du Manuscrit, à poser après la création des scènes. */
  const sceneNotes: { scene: string; title: string; doc: ScrivenerDoc }[] = [];

  /** Page du livre (dédicace, épigraphe…) : une carte Scène hors récit, avec son texte. */
  const addPage = (item: BinderItem, kind: PageKind) => {
    const doc = docOf(item.uuid);
    const id = newId();
    extraCards.push({ id, type: "scene", title: item.title.trim(), html: "", page: kind });
    manuscript[id] = doc.paras.filter((p) => p.text).map((p) => convert(p, doc, id, id)).join("");
    groupFor(labels.pages).ids.push(id);
    cardOf.set(item.uuid, id);
    cardsOf.set(item.uuid, [id]);
    report.pages += 1;
  };

  for (const top of draft.children) {
    const title = chapterTitle(top.title);
    // Une dédicace, une épigraphe… rangées dans le Manuscrit sont des pages du livre, pas des chapitres.
    const pageKind = top.type === "Text" ? pageKindOf(top.title) : null;
    if (pageKind && docOf(top.uuid).paras.some((p) => p.text)) {
      addPage(top, pageKind);
      continue;
    }
    const role: ImportedChapter["role"] = PROLOGUE.test(top.title.trim()) ? "prologue" : EPILOGUE.test(top.title.trim()) ? "epilogue" : null;
    const scenes: string[][] = [];
    const sceneMeta: NonNullable<ImportedChapter["sceneMeta"]> = [];
    const addDoc = (item: BinderItem, first: boolean, ownTitle: boolean) => {
      const doc = docOf(item.uuid);
      const parts = splitScenes(doc.paras);
      // Un dossier sans texte ne fait pas de scène ; un document sans texte en fait une (plan en cours d'écriture).
      if (item.type === "Folder" && parts.length === 1 && parts[0].length === 0) return;
      if (!item.includeInCompile) report.excluded.push(item.title || title);
      const ids: string[] = [];
      parts.forEach((paras, k) => {
        const id = newId();
        ids.push(id);
        scenes.push(paras.map((p) => p.html));
        const fiche: Record<string, string> = {};
        // Le statut vaut pour tout le document, donc pour chacune de ses scènes ; le synopsis, pour la première.
        const label = item.statusId ? binder.statuses[item.statusId] ?? "" : "";
        const status = statusOf(label);
        if (status) fiche.statut = status;
        if (k === 0) {
          const synopsis = doc.synopsis.trim();
          if (synopsis) fiche.synopsis = synopsis;
          if (!status && label) statusMiss.set(label, (statusMiss.get(label) ?? 0) + 1);
        }
        const sceneTitleText = k === 0 && ownTitle ? (first ? chapterTitle(item.title) : item.title.trim()) : "";
        sceneMeta.push({ id, ...(sceneTitleText ? { title: sceneTitleText } : {}), ...(Object.keys(fiche).length ? { fiche } : {}) });
        scenePieces.push({ id, paras, doc, uuid: item.uuid, headTitle: k === 0 ? fold(item.title) : "" });
      });
      cardOf.set(item.uuid, ids[0]);
      cardsOf.set(item.uuid, ids);
      scenesOfDoc.set(item.uuid, { ids, title: item.title });
      sceneNotes.push({ scene: ids[0], title: item.title || title, doc });
    };
    if (isFolder(top)) {
      // Dossier de premier niveau : un chapitre ; son propre texte d'abord, puis ses documents.
      addDoc(top, true, false);
      for (const item of flatten(top.children)) if (item.type === "Text" || item.type === "Folder") addDoc(item, false, item.type === "Text");
      // Mots-clés et étiquette d'un dossier de chapitre : sur toutes ses scènes.
      const all = sceneMeta.map((m) => m?.id ?? "").filter(Boolean);
      if (!cardsOf.has(top.uuid) && all.length) cardsOf.set(top.uuid, all);
      else if (all.length) cardsOf.set(top.uuid, [...new Set([...(cardsOf.get(top.uuid) ?? []), ...all])]);
      if (!cardOf.has(top.uuid) && all.length) cardOf.set(top.uuid, all[0]);
    } else if (top.type === "Text") {
      addDoc(top, true, true);
    } else continue;
    if (scenes.length === 0) continue;
    chapters.push({ title, role, scenes, sceneMeta });
  }
  if (chapters.length === 0) return null;

  const project = bookToProject({ title: source.name, author: null, chapters }, { fileName: source.name, newId });
  report.chapters = chapters.length;
  report.scenes = project.cards.filter((c) => c.type === "scene").length;

  // Texte des scènes : intertitres, commentaires, notes, liens internes.
  for (const piece of scenePieces) {
    const paras = [...piece.paras];
    // Un intertitre en tête qui répète le titre du document (ou du chapitre) n'est pas du texte.
    if (paras[0]?.heading && piece.headTitle && fold(paras[0].text) && (piece.headTitle.includes(fold(paras[0].text)) || fold(chapterTitle(paras[0].text)) === fold(chapterTitle(piece.headTitle)))) paras.shift();
    manuscript[piece.id] = paras.map((p) => convert(p, piece.doc, piece.id, piece.id)).join("");
  }
  project.manuscript = manuscript;
  const byId = new Map(project.cards.map((c) => [c.id, c]));

  // Notes des documents du Manuscrit : une ligne va dans le synopsis s'il est vide, sinon une carte Idée reliée.
  for (const { scene, title, doc } of sceneNotes) {
    const notes = (doc.notes ?? []).filter((p) => p.text);
    textImages(doc, scene, chapterTitle(title) || title);
    if (notes.length === 0) continue;
    const card = byId.get(scene);
    if (!card) continue;
    const one = notes.length === 1 ? notes[0].text.trim() : "";
    if (one && one.length <= SYNOPSIS_MAX && !card.fiche?.synopsis) {
      card.fiche = { ...(card.fiche ?? {}), synopsis: one };
      continue;
    }
    const id = newId();
    extraCards.push({ id, type: "idee", title: labels.notesOf.replace("{title}", chapterTitle(title) || card.title), html: notesHtml(doc).join("") });
    groupFor(labels.sceneNotes).ids.push(id);
    link(scene, id);
    report.ideas += 1;
  }

  // ---- Hors du Manuscrit : Bible, Recherche, autres dossiers ----------------------------------------------------
  const templateFolder = binder.templateFolder?.toUpperCase() ?? "";
  for (const top of binder.items) {
    if (top === draft) continue;
    if (top.type === "TrashFolder") {
      report.trash = flatten(top.children).length;
      continue;
    }
    if (top.uuid === templateFolder) continue;
    if (opts.exclude?.has(top.uuid)) {
      report.skippedFolders.push(top.title);
      continue;
    }
    const kind = isFolder(top) ? folderKind(top) : "other";
    const frameTitle = isFolder(top) ? top.title || labels.other : labels.other;
    const items = isFolder(top) ? flatten(top.children) : [top];
    // Le texte d'un dossier (rare) compte comme un document.
    if (isFolder(top) && docOf(top.uuid).paras.some((p) => p.text)) items.unshift({ ...top, type: "Text", children: [] });
    for (const item of items) {
      if (item.type === "Folder" && !docOf(item.uuid).paras.some((p) => p.text)) continue;
      const doc = docOf(item.uuid);
      const id = newId();
      let card: CardData | null = null;
      const fallbackTitle = () => sceneTitle(doc.paras.filter((p) => p.text).map((p) => `<p>${p.html}</p>`).join("")) || item.title;
      if (item.type === "PDF" || item.type === "Image") {
        const ext = doc.media?.ext.toLowerCase() ?? "";
        if (!doc.media) {
          report.unsupported.push(item.title);
          continue;
        }
        const name = `${id}.${ext === "jpeg" ? "jpg" : ext}`;
        medias.push([name, doc.media.data]);
        card = item.type === "PDF" ? { id, type: "document", title: item.title || name, html: "", fichier: name } : { id, type: "image", title: item.title, html: "", image: name };
        if (item.type === "PDF") report.documents += 1;
        else report.images += 1;
      } else if (item.type === "WebArchive") {
        card = { id, type: "lien", title: item.title, html: "", ...(item.url ? { fiche: { url: item.url } } : {}) };
        report.links += 1;
      } else if (item.type === "Text" && pageKindOf(item.title) && doc.paras.some((p) => p.text)) {
        // Pages liminaires et de fin (dossier « Front Matter », « Pages liminaires »…) : pages du livre.
        addPage(item, pageKindOf(item.title)!);
        continue;
      } else if (item.type === "Text" || item.type === "Folder") {
        const synopsis = doc.synopsis.trim();
        const list = kind === "personnage" ? readCharacterList(doc.paras) : null;
        if (list) {
          // Une liste de personnages : une carte par personnage, toutes dans le cadre du dossier.
          const ids = list.map((one) => {
            const own = newId();
            const fiche: Record<string, string> = { ...one.fiche };
            if (one.accroche && one.accroche.length <= 120) fiche.accroche = one.accroche;
            if (one.principal) fiche.principal = "oui";
            extraCards.push({ id: own, type: "personnage", title: one.title, html: one.body.join(""), ...(Object.keys(fiche).length ? { fiche } : {}) });
            groupFor(frameTitle).ids.push(own);
            report.characters += 1;
            return own;
          });
          cardOf.set(item.uuid, ids[0]);
          cardsOf.set(item.uuid, ids);
          continue;
        }
        if (kind === "personnage" || kind === "lieu") {
          const sketch = readSketch(doc.paras, kind);
          const notes = notesHtml(doc);
          if (sketch.empty && notes.length === 0 && !synopsis) {
            report.emptySketches += 1;
            continue;
          }
          const fiche = { ...sketch.fiche };
          const body = [...sketch.body];
          if (synopsis) {
            if (kind === "personnage" && !synopsis.includes("\n") && synopsis.length <= 120) fiche.accroche = synopsis;
            else body.unshift(`<p><em>${escapeHtml(synopsis)}</em></p>`);
          }
          const title = item.title.trim() || sketch.title || fallbackTitle();
          card = { id, type: kind, title, html: [...body, ...notes].join(""), ...(Object.keys(fiche).length ? { fiche } : {}) };
          if (kind === "personnage") report.characters += 1;
          else report.places += 1;
        } else {
          const html = doc.paras.filter((p) => p.text).map((p) => convert(p, doc, id, null));
          if (synopsis) html.unshift(`<p><em>${escapeHtml(synopsis)}</em></p>`);
          html.push(...notesHtml(doc));
          if (html.length === 0 && !item.title.trim()) continue;
          card = { id, type: "idee", title: item.title.trim() || fallbackTitle(), html: html.join("") };
          report.ideas += 1;
        }
      } else {
        report.unsupported.push(item.title);
        continue;
      }
      extraCards.push(card);
      groupFor(frameTitle).ids.push(id);
      cardOf.set(item.uuid, id);
      cardsOf.set(item.uuid, [id]);
      textImages(doc, id, card.title);
    }
  }

  const allCards = () => [...project.cards, ...extraCards];
  /** Carte existante d'un nom donné (Bible), pour ne pas créer deux fois le même personnage. */
  const findByName = (title: string, types: CardType[]) => allCards().find((c) => types.includes(c.type) && fold(c.title) === fold(title));
  const ensureCard = (title: string, type: CardType): string => {
    const found = findByName(title, type === "idee" ? ["personnage", "lieu", "theme", "intrigue", "idee"] : [type]);
    if (found) return found.id;
    const id = newId();
    extraCards.push({ id, type, title: title.trim(), html: "" });
    groupFor(labels.keywords).ids.push(id);
    report.keywords += 1;
    return id;
  };

  // ---- Mots-clés : une carte chacun, reliée aux documents qui le portent ----------------------------------------
  const keywordType = (id: string): CardType => {
    let parent = binder.keywords[id]?.parentId ?? null;
    while (parent) {
      const t = fold(binder.keywords[parent]?.title ?? "");
      if (/^(characters?|personnages?|cast)$/.test(t)) return "personnage";
      if (/^(locations?|lieux?|places?|settings?|decors?)$/.test(t)) return "lieu";
      if (/^(themes?)$/.test(t)) return "theme";
      if (/^(plots?|intrigues?|subplots?|threads?|fils?)$/.test(t)) return "intrigue";
      parent = binder.keywords[parent]?.parentId ?? null;
    }
    return "idee";
  };
  /** Mot-clé qui nomme un seul personnage ou lieu de la Bible (« Ethan » pour « Ethan Moreau »,
   *  « Dubois » pour « Monsieur Dubois ») : le fil va à sa carte, pas à une Idée de plus. */
  const byFirstName = (title: string, type: CardType): string | null => {
    if (type !== "idee") return null;
    const words = (s: string) =>
      s
        .replace(/œ/gi, "oe")
        .replace(/æ/gi, "ae")
        .split(/[\s'’-]+/)
        .map(fold)
        .filter((w) => w.length > 1 && !NAME_ARTICLES.has(w));
    const kw = words(title);
    if (kw.length === 0) return null;
    const people = allCards().filter((c) => c.type === "personnage" || c.type === "lieu").map((c) => ({ id: c.id, words: words(c.title) }));
    const only = (found: { id: string }[]) => (found.length === 1 ? found[0].id : null);
    return (
      only(people.filter((p) => p.words.join(" ") === kw.join(" "))) ??
      (kw.length === 1 ? only(people.filter((p) => p.words[0] === kw[0])) : null) ??
      only(people.filter((p) => kw.every((w) => p.words.includes(w))))
    );
  };
  const keywordCard = new Map<string, string>();
  for (const item of flatten(binder.items)) {
    const targets = cardsOf.get(item.uuid);
    if (!targets || item.keywordIds.length === 0) continue;
    for (const kw of item.keywordIds) {
      const keyword = binder.keywords[kw];
      if (!keyword?.title.trim()) continue;
      let card = keywordCard.get(kw);
      if (!card) keywordCard.set(kw, (card = byFirstName(keyword.title, keywordType(kw)) ?? ensureCard(keyword.title, keywordType(kw))));
      for (const target of targets) link(target, card);
    }
  }

  // ---- Étiquette : point de vue, intrigues, ou simple couleur -------------------------------------------------
  const labelTitle = fold(binder.labelTitle);
  const pov = /\b(pov|point de vue|narrat|viewpoint|perspective|voix)\b/.test(labelTitle);
  const plainLabel = !labelTitle || /^(label|labels|etiquette|etiquettes|couleur|couleurs|color|colour)$/.test(labelTitle);
  for (const item of flatten(binder.items)) {
    if (!item.labelId) continue;
    const value = binder.labels[item.labelId]?.trim();
    const targets = cardsOf.get(item.uuid);
    if (!value || !targets) continue;
    if (plainLabel) {
      labelMiss.set(value, (labelMiss.get(value) ?? 0) + 1);
      continue;
    }
    if (pov) {
      const person = ensureCard(value, "personnage");
      for (const target of targets) {
        const card = byId.get(target);
        if (card?.type === "scene") card.fiche = { ...(card.fiche ?? {}), pov: person };
      }
    } else {
      const plot = ensureCard(value, "intrigue");
      for (const target of targets) link(target, plot);
    }
  }

  // ---- Signets et liens internes : des fils ---------------------------------------------------------------------
  for (const item of flatten(binder.items)) {
    const from = cardOf.get(item.uuid);
    if (!from) continue;
    for (const target of item.bookmarks) {
      const to = cardOf.get(target);
      if (to) link(from, to);
    }
  }
  for (const [from, target] of internal) {
    const to = cardOf.get(target);
    if (to) link(from, to);
  }

  // ---- Instantanés : des versions des scènes (lot 3) -------------------------------------------------------------
  // Un instantané couvre tout le document : coupé aux mêmes séparateurs, chaque morceau va à sa scène ; si le
  // découpage a changé depuis, tout le texte va à la première scène du document.
  const snapHtml = (p: ImportedPara) => {
    const inner = p.html.replace(/<span data-scriv(?:cmt|lnk)="[^"]*">([\s\S]*?)<\/span>/g, "$1").replace(INLINE_MARK, "");
    return p.heading ? `<h3>${inner}</h3>` : `<p>${inner}</p>`;
  };
  if (source.snapshots) {
    for (const [uuid, { ids, title: docTitle }] of scenesOfDoc) {
      for (const snap of source.snapshots(uuid)) {
        const parts = splitScenes(snap.paras);
        // Comme pour le texte de la scène : l'intertitre en tête qui répète le titre du document n'est pas du texte.
        const head = parts[0]?.[0];
        if (head?.heading && fold(chapterTitle(head.text)) === fold(chapterTitle(docTitle))) parts[0] = parts[0].slice(1);
        const pieces = parts.length === ids.length ? parts : [parts.flat()];
        const own = fold(snap.title);
        const title = own && !UNTITLED_SNAPSHOT.test(own) ? `${labels.snapshot} : ${snap.title.trim()}` : labels.snapshot;
        // Nom du fichier : la date de l'instantané, telle qu'écrite par Scrivener (heure locale de l'auteur).
        const name = `${snap.date.slice(0, 10)}-${snap.date.slice(11, 19).replace(/:/g, "")}.md`;
        pieces.forEach((paras, k) => {
          const html = paras.filter((p) => p.text).map(snapHtml).join("");
          if (!html) return;
          versions.push([ids[k], name, versionFile({ title, date: snap.date, words: countWords(html), kind: "roman", text: htmlToMarkdown(html) })]);
          report.versions += 1;
        });
      }
    }
  }

  // ---- Historique d'écriture : les statistiques ne repartent pas de zéro ---------------------------------------
  const progress = source.history ? historyProgress(source.history, Object.values(manuscript).reduce((n, html) => n + countWords(html), 0)) : {};
  report.days = Object.keys(progress).length;

  // ---- Disposition : les cadres à droite du récit, l'un sous l'autre ---------------------------------------------
  const layout = [...project.meta.layout];
  const frames: Frame[] = [];
  const right = layout.reduce((m, l) => Math.max(m, l.x), 0) + STEP_X + 200;
  let y = 80;
  for (const group of groups) {
    if (group.ids.length === 0) continue;
    const cols = Math.min(FRAME_COLS, group.ids.length);
    const rows = Math.ceil(group.ids.length / cols);
    group.ids.forEach((id, k) => layout.push({ id, x: right + FRAME_PAD + (k % cols) * STEP_X, y: y + FRAME_TOP + Math.floor(k / cols) * STEP_Y }));
    const height = FRAME_TOP + rows * STEP_Y + FRAME_PAD - 40;
    frames.push({ id: newId(), title: group.title, x: right, y, width: cols * STEP_X + FRAME_PAD * 2 - 40, height });
    y += height + FRAME_GAP;
  }

  report.wires = links.length;
  report.statuses = [...statusMiss].map(([label, count]) => ({ label, count }));
  report.labels = [...labelMiss].map(([label, count]) => ({ label, count }));
  project.cards = allCards();
  project.meta = { ...project.meta, layout, links, ...(frames.length ? { frames } : {}), ...(binder.draftTarget ? { goals: { total: binder.draftTarget } } : {}), ...(report.days ? { progress } : {}) };
  if (Object.keys(comments).length > 0) project.comments = comments;
  return { project, medias, report, versions };
}
