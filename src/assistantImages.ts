// Images demandées par l'assistant externe (MCP) : `generate_image`, `generate_images`, `image_status`.
//
// L'assistant ne génère rien lui-même : il décrit l'image et sa place, MondoWrite la génère avec le service d'images
// de l'appareil (ai/imageGen.ts), dont la clé ne quitte jamais l'app. Rien ne part sans l'accord de l'auteur
// (`AssistantImages.tsx`), une fois par demande, pour toutes ses images. Une génération dure de 10 à 60 s : la
// demande rend tout de suite des identifiants de tâche, suivis par `image_status`.
//
// Ce module : demandes relues (pures, testées) et tâches de la séance (état d'affichage, jamais enregistré).
// La génération et la pose sont dans assistantImagesRun.ts, chargé à la demande.

import { create } from "zustand";
import { REFERENCE_MAX, type ImageModelChoice } from "./ai/imageGen";
import { cleanAlt } from "./sceneImages";

/** Outils d'image de l'assistant (écriture : les deux premiers ; lecture : le dernier). */
export const IMAGE_TOOLS = ["generate_image", "generate_images", "image_status"] as const;
export const isImageTool = (tool: unknown): tool is (typeof IMAGE_TOOLS)[number] => typeof tool === "string" && (IMAGE_TOOLS as readonly string[]).includes(tool);

/** Images d'une seule demande au plus (une seule demande d'accord pour toutes). */
export const IMAGES_PER_REQUEST = 12;
/** Consigne bornée (le service en accepte plus, l'auteur doit pouvoir la lire dans la demande d'accord). */
export const IMAGE_PROMPT_MAX = 1500;
/** Tâches gardées pour la séance. */
export const JOBS_KEPT = 60;

/** Où va l'image : couverture du projet, carte de la Bible (image principale ou galerie), texte d'une scène de roman. */
export type ImageTarget =
  | { kind: "cover" }
  | { kind: "card"; id: string; title: string; slot: "portrait" | "gallery" }
  | { kind: "scene"; id: string; title: string; position: "top" | "end" };

export type JobStatus = "confirm" | "queued" | "running" | "done" | "refused" | "error";

export interface ImageJob {
  id: string;
  /** Demande d'où vient la tâche : une seule demande d'accord pour toutes ses images. */
  batch: string;
  /** Projet de la demande (identifiant du stockage) : l'image n'est posée que dans celui-là. */
  project: string;
  client: string;
  target: ImageTarget;
  prompt: string;
  alt: string;
  /** Cartes dont l'image part comme référence (identifiants). */
  refs: string[];
  quality: ImageModelChoice | null;
  replace: boolean;
  status: JobStatus;
  /** Erreur, ou ce qui a été posé (nom du fichier de medias/). */
  message?: string;
  media?: string;
  at: number;
}

/** Une carte vue par la relecture des demandes. */
export interface ImageCardRef {
  id: string;
  title: string;
  type: string;
  image?: string;
}

/** Ce que la relecture des demandes sait du projet ouvert. */
export interface ImageContext {
  kind: "roman" | "scenario";
  findCard: (wanted: string) => ImageCardRef | null;
  findScene: (wanted: string) => { id: string; title: string } | null;
  /** La couverture a-t-elle déjà une image ? */
  hasCover: boolean;
}

export type ImageSpec = Omit<ImageJob, "id" | "batch" | "project" | "client" | "status" | "at" | "message" | "media">;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim();

/**
 * Une image demandée → sa description relue, ou la raison du refus (bilingue, comme les autres réponses MCP).
 * Rien n'est deviné : une cible introuvable ou ambiguë est refusée avant que quoi que ce soit parte.
 */
export function readImageSpec(raw: unknown, ctx: ImageContext): ImageSpec | { error: string } {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const prompt = str(a.prompt).slice(0, IMAGE_PROMPT_MAX);
  if (!prompt) return { error: "Il faut une consigne (`prompt`). / A prompt is needed." };
  const alt = cleanAlt(str(a.alt)) || cleanAlt(prompt.split(/[.\n]/)[0]);
  const quality = a.quality === "flare" || a.quality === "sunburst" ? a.quality : null;
  const replace = a.replace === true;
  const refsWanted = Array.isArray(a.references) ? a.references.map(str).filter(Boolean) : [];
  const refs: string[] = [];
  const missing: string[] = [];
  for (const w of refsWanted) {
    const card = ctx.findCard(w);
    if (!card) missing.push(w);
    else if (card.image && !refs.includes(card.id) && refs.length < REFERENCE_MAX) refs.push(card.id);
  }
  if (missing.length) return { error: `Références introuvables : ${missing.join(", ")}. / References not found.` };

  let target: ImageTarget;
  switch (str(a.target)) {
    case "cover":
      if (ctx.hasCover && !replace) return { error: "La couverture a déjà une image : redemande avec `replace: true` pour la remplacer (l'ancienne reste dans le projet). / The cover already has an image." };
      target = { kind: "cover" };
      break;
    case "card": {
      const card = ctx.findCard(str(a.card));
      if (!card) return { error: `Carte introuvable : « ${str(a.card)} ». / Card not found.` };
      if (card.type === "scene") return { error: "Pour une scène, target = scene. / Use target scene for scenes." };
      const slot = a.slot === "gallery" ? "gallery" : "portrait";
      target = { kind: "card", id: card.id, title: card.title, slot };
      break;
    }
    case "scene": {
      if (ctx.kind === "scenario") return { error: "Les images dans le texte d'une scène sont réservées aux romans. Illustre plutôt une carte (target = card). / Scene images are for novels only." };
      const scene = ctx.findScene(str(a.scene));
      if (!scene) return { error: `Scène introuvable : « ${str(a.scene)} ». / Scene not found.` };
      target = { kind: "scene", id: scene.id, title: scene.title, position: a.position === "end" ? "end" : "top" };
      break;
    }
    default:
      return { error: "`target` : cover, card ou scene. / target must be cover, card or scene." };
  }
  return { target, prompt, alt, refs, quality, replace };
}

/** Les images d'un appel (`generate_image` : les arguments eux-mêmes ; `generate_images` : la liste `images`). */
export function readImageSpecs(tool: string, args: unknown, ctx: ImageContext): { specs: ImageSpec[] } | { error: string } {
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const list = tool === "generate_images" ? (Array.isArray(a.images) ? a.images : []) : [a];
  if (list.length === 0) return { error: "Aucune image demandée (`images`). / No image requested." };
  if (list.length > IMAGES_PER_REQUEST) return { error: `Au plus ${IMAGES_PER_REQUEST} images par demande. / At most ${IMAGES_PER_REQUEST} images per request.` };
  const specs: ImageSpec[] = [];
  for (const [i, raw] of list.entries()) {
    const spec = readImageSpec(raw, ctx);
    if ("error" in spec) return { error: list.length > 1 ? `Image ${i + 1} : ${spec.error}` : spec.error };
    specs.push(spec);
  }
  // Deux couvertures dans la même demande : la seconde écraserait la première en silence.
  if (specs.filter((s) => s.target.kind === "cover").length > 1) return { error: "Une seule couverture par demande. / Only one cover per request." };
  return { specs };
}

/** Identifiant court d'une tâche ou d'une demande. */
export const newJobId = (prefix: string, rand: () => number = Math.random) => `${prefix}-${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0")}`;

/** Où va une image, en clair pour l'assistant. */
export function targetText(target: ImageTarget): string {
  switch (target.kind) {
    case "cover":
      return "couverture / cover";
    case "card":
      return `carte « ${target.title} » (${target.slot === "portrait" ? "image principale / portrait" : "galerie / gallery"})`;
    case "scene":
      return `scène « ${target.title} » (${target.position === "top" ? "en tête / top" : "à la fin / end"})`;
  }
}

const STATUS_TEXT: Record<JobStatus, string> = {
  confirm: "en attente de l'accord de l'auteur / waiting for the author's approval",
  queued: "acceptée, en file / approved, queued",
  running: "en cours de génération / generating",
  done: "posée / placed",
  refused: "refusée par l'auteur : ne la redemande pas sans qu'il le veuille / refused by the author",
  error: "erreur / error",
};

/** Une ligne d'état par tâche (`image_status`). */
export function jobLine(job: ImageJob): string {
  const extra = job.status === "error" && job.message ? ` : ${job.message}` : job.status === "done" && job.media ? ` (medias/${job.media})` : "";
  return `- \`${job.id}\` · ${targetText(job.target)} · ${STATUS_TEXT[job.status]}${extra}`;
}

/** Réponse de `image_status` : une tâche, ou toutes celles du projet pour la séance. */
export function statusAnswer(jobs: readonly ImageJob[], project: string, wanted: string): { ok: boolean; text: string } {
  const mine = jobs.filter((j) => j.project === project);
  if (wanted) {
    const job = mine.find((j) => j.id === wanted || j.batch === wanted);
    if (!job) return { ok: false, text: `Tâche inconnue : ${wanted} (les tâches ne durent que le temps de la séance de MondoWrite). / Unknown job.` };
    const batch = mine.filter((j) => (job.batch === wanted ? j.batch === wanted : j.id === wanted));
    return { ok: true, text: batch.map(jobLine).join("\n") };
  }
  if (mine.length === 0) return { ok: true, text: "Aucune image demandée pendant cette séance. / No image requested in this session." };
  return { ok: true, text: mine.map(jobLine).join("\n") };
}

/** Tâches de la séance (état d'affichage) : la demande d'accord lit celles en `confirm`. */
export const useAssistantImages = create<{
  jobs: ImageJob[];
  add: (jobs: ImageJob[]) => void;
  update: (id: string, patch: Partial<ImageJob>) => void;
}>((set) => ({
  jobs: [],
  add: (jobs) => set((s) => ({ jobs: [...s.jobs, ...jobs].slice(-JOBS_KEPT) })),
  update: (id, patch) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),
}));

/** Demandes en attente d'accord, la plus ancienne d'abord. */
export function pendingBatches(jobs: readonly ImageJob[]): ImageJob[][] {
  const out = new Map<string, ImageJob[]>();
  for (const j of jobs) if (j.status === "confirm") out.set(j.batch, [...(out.get(j.batch) ?? []), j]);
  return [...out.values()];
}

/**
 * Une image posée dans le HTML d'une scène de roman (`sceneImages.ts`) : en tête (« En tête de chapitre », qui la
 * garde au début de sa scène) ou à la fin, toujours avant le bloc de choix d'un roman interactif.
 */
export function withSceneImage(html: string, name: string, alt: string, position: "top" | "end"): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const img = `<img data-media="${esc(name)}" alt="${esc(cleanAlt(alt))}"${position === "top" ? ' data-place="chapter"' : ""}>`;
  if (position === "top") return img + html;
  const choices = html.search(/<pre\b[^>]*\bdata-choices="true"/);
  return choices === -1 ? html + img : html.slice(0, choices) + img + html.slice(choices);
}
