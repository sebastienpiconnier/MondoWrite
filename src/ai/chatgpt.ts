import { countRequest } from "./usage";
import { invoke } from "@tauri-apps/api/core";
import { getT } from "../i18n";
import { useSettings } from "../settings";
import { AiError, type ChatOptions } from "./providers";

export interface PlanStatus { account: string | null; plan: boolean; known: boolean }
export interface PlanModel { slug: string; label: string; efforts: string[] }
export const planModels = () => invoke<PlanModel[]>("chatgpt_models");
export function planError(raw: unknown): AiError {
  const [code, detail] = String(raw).split("|", 2);
  const t = getT().ai;
  const error = new AiError(code === "cancelled" || code === "timeout" || code === "network" || code === "empty" || code === "length" || code === "limit" ? code : "other");
  const labels: Record<string, unknown> = { ...t.errors, ...t.chatgpt, limit: t.chatgpt.quota };
  error.text = [typeof labels[code] === "string" ? labels[code] : t.errors.other, detail].filter(Boolean).join(" ");
  return error;
}
export async function planComplete(model: string, system: string, user: string, options: ChatOptions = {}, effort?: string) {
  if (options.images?.length) throw planError("photo");
  const { signal } = options;
  if (signal?.aborted) throw planError("cancelled");
  const id = await invoke<string>("chatgpt_prepare");
  const cancel = () => { void invoke("chatgpt_cancel", { id }).catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) { cancel(); throw "cancelled"; }
    const text = await invoke<string>("chatgpt_complete", { id, model, system, user, ...(effort && { effort }), timeoutMs: options.timeoutMs ?? 90000 });
    if (signal?.aborted) throw "cancelled";
    countRequest("chatgpt");
    return text;
  } catch (err) {
    if (String(err).split("|")[0] === "auth") {
      const { ai, setAi } = useSettings.getState();
      setAi({ ...ai, planReady: false });
    }
    throw planError(err);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
