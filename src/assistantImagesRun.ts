// Images demandées par l'assistant externe (MCP), côté app : demande reçue → tâches en attente d'accord ; tâches
// acceptées → générées une à une par le service d'images de l'appareil, puis posées (couverture, carte, scène).
// Chargé à la demande (pont MCP, demande d'accord). Voir assistantImages.ts.

import { getT } from "./i18n";
import { aiConfig, useSettings } from "./settings";
import { isReady } from "./ai/providers";
import { storage } from "./storage";
import { publishOpenProject, useCosmos } from "./store";
import { mcpWritable } from "./mcp";
import { noteAssistantWrite } from "./assistantNotice";
import { findCard } from "./mcpWrite";
import { buildMcpSnapshot } from "./mcpSnapshot";
import { newId } from "./projectState";
import {
  IMAGE_EXT,
  IMAGE_MODEL_CHOICES,
  canGenerateImages,
  castDescription,
  generateImages,
  iaImageSource,
  iaImagesOf,
  imageModelOf,
  imagePrompt,
  properNames,
  stripNames,
  subjectOf,
  type ReferenceImage,
} from "./ai/imageGen";
import { newJobId, readImageSpecs, statusAnswer, useAssistantImages, withSceneImage, type ImageJob } from "./assistantImages";

const s = () => useCosmos.getState();

/** Service d'images de l'appareil, s'il y en a un de prêt. */
function imageService() {
  const ai = useSettings.getState().ai;
  const config = aiConfig(ai);
  if (!isReady(config) || !canGenerateImages(config.provider)) return null;
  return { config, provider: config.provider, chosen: ai.imageModels?.[config.provider] };
}

/** `generate_image` ou `generate_images` : tâches créées en attente de l'accord de l'auteur. Rien ne part avant. */
export function requestImages(tool: string, args: unknown, project: string, client: string): { ok: boolean; text: string } {
  if (!useSettings.getState().mcp.images) {
    return { ok: false, text: "L'auteur n'a pas permis à l'assistant de demander des images. Dans MondoWrite : Réglages › IA › Assistant externe › « Autoriser l'assistant à demander des images ». / Image requests are not allowed by the author." };
  }
  if (!imageService()) {
    return { ok: false, text: "Aucun service d'images n'est branché dans MondoWrite (OpenAI ou OpenRouter, Réglages › IA). / No image service is set up in MondoWrite." };
  }
  const st = s();
  const cards = st.nodes.map((n) => n.data);
  const scenes = buildMcpSnapshot({ title: st.title, kind: st.kind, nodes: st.nodes, edges: st.edges, plan: st.plan, manuscript: st.manuscript, screenplay: st.screenplay, pitch: st.pitch }, getT(), new Date(), "").scenes.map(({ n, id, title }) => ({ n, id, title }));
  const read = readImageSpecs(tool, args, {
    kind: st.kind,
    hasCover: !!st.pitch.visuel,
    findCard: (w) => findCard(cards, w),
    findScene: (w) => {
      const n = /^\d+$/.test(w.trim()) ? Number(w.trim()) : NaN;
      return scenes.find((x) => x.n === n) ?? findCard(scenes, w);
    },
  });
  if ("error" in read) return { ok: false, text: read.error };
  const batch = newJobId("demande");
  const at = Date.now();
  const jobs: ImageJob[] = read.specs.map((spec) => ({ ...spec, id: newJobId("img"), batch, project, client, status: "confirm", at }));
  useAssistantImages.getState().add(jobs);
  const list = jobs.map((j) => `\`${j.id}\``).join(", ");
  return {
    ok: true,
    text: `${jobs.length > 1 ? `${jobs.length} images demandées` : "Image demandée"} (${list} ; demande \`${batch}\`). MondoWrite demande l'accord de l'auteur avant de générer quoi que ce soit (chaque image est facturée par son service). Suis l'avancement avec image_status, sans redemander. / Requested; MondoWrite asks the author first. Follow with image_status.`,
  };
}

/** `image_status` : état des tâches de ce projet pour la séance. */
export const imageStatus = (args: unknown, project: string) => statusAnswer(useAssistantImages.getState().jobs, project, typeof (args as { job?: unknown })?.job === "string" ? ((args as { job: string }).job ?? "").trim() : "");

/** L'auteur refuse une demande : ses tâches sont marquées, rien ne part. */
export function refuseBatch(batch: string) {
  const { jobs, update } = useAssistantImages.getState();
  for (const j of jobs) if (j.batch === batch && j.status === "confirm") update(j.id, { status: "refused" });
}

let running = false;

/** L'auteur accepte une demande : ses tâches passent en file, générées une à la fois. */
export async function acceptBatch(batch: string): Promise<void> {
  const { jobs, update } = useAssistantImages.getState();
  for (const j of jobs) if (j.batch === batch && j.status === "confirm") update(j.id, { status: "queued" });
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = useAssistantImages.getState().jobs.find((j) => j.status === "queued");
      if (!next) break;
      await runJob(next);
    }
  } finally {
    running = false;
  }
}

/** Le projet de la tâche est-il encore celui qui est ouvert, en écriture pour l'assistant ? */
const stillOpen = (job: ImageJob) => s().screen === "project" && storage.current?.() === job.project && mcpWritable(useSettings.getState().mcp, job.project);

async function runJob(job: ImageJob): Promise<void> {
  const { update } = useAssistantImages.getState();
  const fail = (message: string) => update(job.id, { status: "error", message });
  if (!stillOpen(job)) return fail("le projet n'est plus ouvert en écriture dans MondoWrite, rien n'a été généré / project closed, nothing generated");
  const service = imageService();
  if (!service) return fail("plus de service d'images branché / no image service");
  update(job.id, { status: "running" });
  const t = getT();
  const g = t.imageGen;
  const cards = s().nodes.map((n) => n.data);
  const profile = useSettings.getState().profile;
  // Jamais un nom de personne dans la consigne (règle des images générées, ai/imageGen.ts) : l'assistant décrit.
  const names = properNames(cards, [`${profile.firstName} ${profile.lastName}`, profile.penName].map((v) => v.trim()).filter(Boolean));
  const labels: Record<string, string> = { ...t.fiche.fields, ...t.character.fields, ...t.pitch.fields, themes: t.pitch.themes };
  const card = job.target.kind === "card" ? cards.find((c) => c.id === (job.target as { id: string }).id) : undefined;
  const subject = job.target.kind === "cover" ? "cover" : job.target.kind === "scene" ? "scene" : subjectOf(card?.type ?? "image");
  const { referenceOf } = await import("./components/ImageGen");
  // Personnages d'abord (décrits par leur fiche, jamais nommés), puis lieux et objets : l'ordre des images jointes
  // est celui que la consigne leur donne.
  const refCards = job.refs.map((id) => cards.find((c) => c.id === id)).filter((c): c is (typeof cards)[number] => !!c?.image);
  const people = refCards.filter((c) => c.type === "personnage");
  const things = refCards.filter((c) => c.type !== "personnage");
  const refs: ReferenceImage[] = [];
  const members = [];
  for (const ref of people) {
    const image = await referenceOf(ref.image!);
    if (image) refs.push(image);
    members.push({ description: castDescription(ref, labels, g.fieldSep), reference: !!image });
  }
  let settingRefs = 0;
  for (const ref of things) {
    const image = await referenceOf(ref.image!);
    if (image) {
      refs.push(image);
      settingRefs++;
    }
  }
  const options = { cast: members, settingRefs, ...(job.target.kind === "cover" ? { space: true } : {}) };
  const prompt = imagePrompt(subject, stripNames(job.prompt, names), names, options);
  const model = job.quality ? IMAGE_MODEL_CHOICES[service.provider][job.quality] : imageModelOf(service.provider, service.chosen);
  let image;
  try {
    [image] = await generateImages(service.config, model, prompt, 1, subject, undefined, refs);
  } catch (err) {
    console.error(err);
    return fail(`le service d'images a refusé ou n'a pas répondu (${err instanceof Error ? err.message : String(err)}) / the image service failed`);
  }
  const ext = image && IMAGE_EXT[image.mime];
  if (!image || !ext) return fail("image illisible / unreadable image");
  if (!stillOpen(job)) return fail("le projet a été fermé pendant la génération : rien n'a été posé / project closed meanwhile, nothing placed");
  const name = `${newId()}.${ext}`;
  try {
    await storage.writeMedia(name, image.data);
  } catch (err) {
    console.error(err);
    return fail("impossible d'écrire l'image dans le projet / could not save the image");
  }
  const placed = place(job, name, iaImageSource(service.provider, model), model);
  if (placed !== true) return fail(placed);
  update(job.id, { status: "done", media: name });
  publishOpenProject(true);
}

/** Pose l'image (une étape d'annulation, journalisée). Rend true, ou la raison d'un refus. */
function place(job: ImageJob, name: string, mark: string, model: string): true | string {
  const st = s();
  const before = st.past.at(-1) ?? null;
  const extra = { model, detail: `MCP · ${job.client || "assistant"}` };
  const target = job.target;
  const done = st.externalEdit((): true | string => {
    if (target.kind === "cover") {
      // Vérifié à la demande ; une couverture posée depuis par l'auteur n'est jamais remplacée sans `replace`.
      if (s().pitch.visuel && !job.replace) return "la couverture a reçu une image entre-temps : rien n'a été remplacé / the cover got an image meanwhile";
      s().setCoverVisual(name, { ia: mark });
      s().logAtelier("image", s().title || getT().home.untitled, 0, extra);
      return true;
    }
    if (target.kind === "card") {
      const card = s().nodes.find((n) => n.id === target.id)?.data;
      if (!card) return "la carte n'existe plus / the card is gone";
      const iaImages = { ...(iaImagesOf(card) ?? {}), [name]: mark };
      const gallery = card.images ?? [];
      if (target.slot === "gallery" || (card.image && !job.replace)) {
        // Jamais d'écrasement silencieux : une carte qui a son image reçoit la nouvelle en galerie.
        s().updateCard(card.id, card.image ? { images: [...gallery, name], iaImages } : { image: name, iaImages });
      } else {
        // Remplacer : l'ancienne image passe dans la galerie, rien n'est perdu.
        s().updateCard(card.id, { image: name, images: card.image ? [...gallery, card.image] : gallery, iaImages });
      }
      s().logAtelier("image", card.title, 0, extra);
      return true;
    }
    const scene = s().nodes.find((n) => n.id === target.id)?.data;
    if (!scene || scene.type !== "scene" || s().kind === "scenario") return "la scène n'existe plus / the scene is gone";
    s().setManuscriptText(scene.id, withSceneImage(s().manuscript[scene.id] ?? "", name, job.alt, target.position));
    s().logAtelier("image", scene.title, 0, extra);
    return true;
  });
  if (done === true) {
    const after = s().past.at(-1) ?? null;
    noteAssistantWrite(job.client, after !== before ? after : null);
  }
  return done;
}
