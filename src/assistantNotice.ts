import { create } from "zustand";

/** Écritures rapprochées de l'assistant regroupées dans un seul message. */
export const ASSISTANT_GROUP_MS = 10_000;

/**
 * Message « L'assistant vient de modifier ton projet » (#62) : état d'affichage, jamais enregistré.
 * `steps` garde les étapes d'historique posées par l'assistant, dans l'ordre : « Annuler » ne défait
 * que celles qui sont encore au sommet de l'historique (rien de ce que l'auteur a fait depuis).
 */
export interface AssistantNotice {
  at: number;
  client: string;
  count: number;
  steps: object[];
}

export const useAssistantNotice = create<{ notice: AssistantNotice | null; clear: () => void }>((set) => ({
  notice: null,
  clear: () => set({ notice: null }),
}));

/** Une écriture de l'assistant vient de réussir ; `step` est l'étape d'historique qu'elle a posée, s'il y en a une. */
export function noteAssistantWrite(client: string, step: object | null, now = Date.now()): void {
  const prev = useAssistantNotice.getState().notice;
  const same = prev && prev.client === client && now - prev.at < ASSISTANT_GROUP_MS;
  const steps = same ? prev.steps.slice() : [];
  if (step && !steps.includes(step)) steps.push(step);
  useAssistantNotice.setState({ notice: { at: now, client, count: same ? prev.count + 1 : 1, steps } });
}

/** Les étapes de l'assistant encore au sommet de l'historique, de la plus récente à la plus ancienne. */
export function undoableSteps(steps: readonly object[], past: readonly object[]): number {
  let n = 0;
  while (n < steps.length && past[past.length - 1 - n] === steps[steps.length - 1 - n]) n++;
  return n;
}
