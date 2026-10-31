// Recherche par le sens, dans la fenêtre de recherche (Search.tsx, Cmd/Ctrl + F) : l'état d'une recherche
// (lecture du projet avec sa progression, Annuler, résultats) et le chemin pour aller à un passage.
// Le calcul est dans ai/semantic.ts ; rien n'est écrit dans le projet.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiError, aiErrorText, listModels } from "../ai/providers";
import { canEmbed, cardChunks, indexKey, manuscriptChunks, proposeEmbedModel, screenplayChunks, sessionIndex, type Chunk, type SemanticHit } from "../ai/semantic";
import { bookOrder } from "../book";
import { fmt, useT } from "../i18n";
import { aiConfig, useSettings } from "../settings";
import { SCENE_AT, useCosmos } from "../store";

export type SemanticStatus =
  | { step: "idle" }
  | { step: "indexing"; done: number; total: number }
  | { step: "searching" }
  | { step: "done"; query: string }
  | { step: "message"; text: string };

/** Passages du projet ouvert : texte des scènes (manuscrit ou scénario) puis cartes. */
function projectChunks(): Chunk[] {
  const st = useCosmos.getState();
  const cards = st.nodes.map((n) => n.data);
  const scenes =
    st.kind === "scenario"
      ? screenplayChunks(st.screenplay?.elements ?? [], SCENE_AT)
      : manuscriptChunks(bookOrder(st.nodes, st.plan), st.manuscript, new Map(cards.map((c) => [c.id, c.title])));
  return [...scenes, ...cardChunks(cards)];
}

/** La recherche par le sens est-elle offerte (service local branché) ? */
export function useCanSearchBySense(): boolean {
  return useSettings((s) => canEmbed(s.ai.provider));
}

export function useSemanticSearch(active: boolean) {
  const t = useT();
  const ai = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(ai), [ai]);
  const model = (ai.provider && ai.embedModels?.[ai.provider]?.trim()) || "";
  const [status, setStatus] = useState<SemanticStatus>({ step: "idle" });
  const [hits, setHits] = useState<SemanticHit[]>([]);
  const controller = useRef<AbortController | null>(null);

  // Arrêtée si la fenêtre se ferme ou change de mode.
  useEffect(() => {
    if (active) return;
    controller.current?.abort();
  }, [active]);
  useEffect(() => () => controller.current?.abort(), []);

  // Pas encore de modèle choisi : on en propose un dont le nom dit « embed », s'il y en a un d'installé.
  const proposed = useRef(false);
  useEffect(() => {
    if (!active || model || !config || !canEmbed(config.provider) || proposed.current) return;
    proposed.current = true;
    listModels(config)
      .then((list) => {
        const found = proposeEmbedModel(list);
        const now = useSettings.getState().ai;
        if (found && now.provider === config.provider && !now.embedModels?.[config.provider]) {
          useSettings.getState().setAi({ ...now, embedModels: { ...now.embedModels, [config.provider]: found } });
        }
      })
      .catch(() => {
        /* service éteint : le message « choisis un modèle » reste */
      });
  }, [active, model, config]);

  const run = useCallback(
    async (query: string) => {
      if (!query.trim() || !config || !canEmbed(config.provider)) return;
      if (!model) {
        setHits([]);
        setStatus({ step: "message", text: t.semantic.noModel });
        return;
      }
      controller.current?.abort();
      const ctl = new AbortController();
      controller.current = ctl;
      const chunks = projectChunks();
      if (chunks.length === 0) {
        setHits([]);
        setStatus({ step: "message", text: t.semantic.nothing });
        return;
      }
      const index = sessionIndex(indexKey(config, model));
      try {
        await index.update(config, model, chunks, (done, total) => {
          if (!ctl.signal.aborted && total > 0) setStatus({ step: "indexing", done, total });
        }, ctl.signal);
        if (ctl.signal.aborted) return;
        setStatus({ step: "searching" });
        const found = await index.search(config, model, query, chunks, ctl.signal);
        if (ctl.signal.aborted) return;
        setHits(found);
        setStatus({ step: "done", query });
      } catch (err) {
        if (controller.current !== ctl) return; // remplacée par une recherche plus récente
        const code = err instanceof AiError ? err.code : "other";
        if (code === "cancelled") setStatus({ step: "message", text: t.semantic.cancelled });
        else if (code === "model" || code === "empty") setStatus({ step: "message", text: fmt(t.semantic.badModel, { model }) });
        else setStatus({ step: "message", text: fmt(t.semantic.failed, { error: aiErrorText(err, t.ai.errors) }) });
        console.error(err);
      } finally {
        if (controller.current === ctl) controller.current = null;
      }
    },
    [config, model, t],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  const busy = status.step === "indexing" || status.step === "searching";
  return { status, hits, run, cancel, busy, ready: !!model };
}

/** Aller au passage : l'endroit exact du texte de la scène, ou la carte sur le canevas. */
export function goToHit(hit: SemanticHit) {
  const st = useCosmos.getState();
  const c = hit.chunk;
  if (c.kind === "manuscript" && c.target) st.openInManuscript(c.target, c.needle);
  else if (c.kind === "screenplay" && c.target) st.openInManuscript(c.target);
  else if (c.cardId) {
    st.revealCard(c.cardId);
    st.setSpotlight(c.cardId);
  }
}
