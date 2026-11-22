// Images demandées par l'assistant externe (MCP) : la demande d'accord (rien ne part sans « Générer »), puis
// l'avancement. Voir assistantImages.ts et assistantImagesRun.ts.

import { useMemo } from "react";
import { fmt, useT } from "../i18n";
import { aiConfig, useSettings } from "../settings";
import { useCosmos } from "../store";
import { storage } from "../storage";
import { IMAGE_MODEL_CHOICES, canGenerateImages, imageModelOf } from "../ai/imageGen";
import { pendingBatches, useAssistantImages, type ImageJob } from "../assistantImages";

/** Libellé d'une consigne coupée pour la demande d'accord. */
const PROMPT_SHOWN = 220;

export function AssistantImages() {
  const t = useT();
  const m = t.mcp;
  const jobs = useAssistantImages((s) => s.jobs);
  const project = useCosmos((s) => (s.screen === "project" ? (storage.current?.() ?? null) : null));
  const nodes = useCosmos((s) => s.nodes);
  const ai = useSettings((s) => s.ai);
  const mine = useMemo(() => jobs.filter((j) => j.project === project), [jobs, project]);
  const batch = pendingBatches(mine)[0] ?? null;
  const active = mine.filter((j) => j.status === "queued" || j.status === "running");
  if (!project || (!batch && active.length === 0)) return null;

  if (!batch) {
    // Avancement : la tâche en cours parmi celles de sa demande.
    const running = active.find((j) => j.status === "running") ?? active[0];
    const same = mine.filter((j) => j.batch === running.batch);
    return (
      <div className="trash-notice assistant-notice assistant-images" role="status">
        <span>{fmt(m.imagesRunning, { i: same.indexOf(running) + 1, n: same.length })}</span>
      </div>
    );
  }

  const config = aiConfig(ai);
  const provider = config && canGenerateImages(config.provider) ? config.provider : null;
  const modelOf = (job: ImageJob) => (provider ? (job.quality ? IMAGE_MODEL_CHOICES[provider][job.quality] : imageModelOf(provider, ai.imageModels?.[provider])) : "");
  const models = [...new Set(batch.map(modelOf).filter(Boolean))].join(", ");
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.title.trim() || t.bible.untitled;
  const where = (job: ImageJob) => {
    const target = job.target;
    if (target.kind === "cover") return m.imagesCover;
    if (target.kind === "card") return fmt(target.slot === "portrait" ? m.imagesPortrait : m.imagesGallery, { title: titleOf(target.id) });
    return fmt(target.position === "top" ? m.imagesSceneTop : m.imagesSceneEnd, { title: titleOf(target.id) });
  };
  const client = batch[0].client || m.noticeClient;
  const decide = async (yes: boolean) => {
    const run = await import("../assistantImagesRun");
    if (yes) void run.acceptBatch(batch[0].batch);
    else run.refuseBatch(batch[0].batch);
  };

  return (
    <div className="trash-notice assistant-notice assistant-images" role="dialog" aria-labelledby="assistant-images-title">
      <strong id="assistant-images-title">{batch.length > 1 ? fmt(m.imagesAskMany, { client, n: batch.length }) : fmt(m.imagesAsk, { client })}</strong>
      <ul className="assistant-images-list">
        {batch.map((job) => (
          <li key={job.id}>
            <span className="assistant-images-where">{where(job)}</span>
            {job.replace && <span className="assistant-images-replace"> · {m.imagesReplace}</span>}
            <span className="assistant-images-prompt">{job.prompt.length > PROMPT_SHOWN ? `${job.prompt.slice(0, PROMPT_SHOWN)}…` : job.prompt}</span>
            {job.refs.length > 0 && <span className="assistant-images-refs">{fmt(m.imagesRefs, { list: job.refs.map(titleOf).join(", ") })}</span>}
          </li>
        ))}
      </ul>
      <p className="assistant-images-cost">{provider ? fmt(m.imagesCost, { service: t.ai.providers[provider] ?? provider, model: models }) : m.imagesNoService}</p>
      <div className="assistant-images-actions">
        <button type="button" className="ghost-button is-primary" disabled={!provider} onClick={() => void decide(true)}>
          {batch.length > 1 ? fmt(m.imagesGenerateMany, { n: batch.length }) : m.imagesGenerate}
        </button>
        <button type="button" className="ghost-button" onClick={() => void decide(false)}>
          {m.imagesRefuse}
        </button>
      </div>
    </div>
  );
}
