import { bindUsageAccount } from "../ai/subscriptionUsage";
import { ChatGPTUsage } from "./ChatGPTUsage";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { planError, planModels, type PlanModel, type PlanStatus } from "../ai/chatgpt";
import { fmt, useT } from "../i18n";
import { isMobileOS, isTauri } from "../platform";
import { useSettings } from "../settings";

export const offersChatGPT = () => isTauri() && !isMobileOS();

export function useChatGPTSettings(selected: boolean, open: boolean) {
  const t = useT();
  const copy = t.ai.chatgpt;
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [models, setModels] = useState<PlanModel[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const modelId = useId();
  const model = useSettings((s) => s.ai.models.chatgpt ?? "");
  const thinking = useSettings((s) => s.ai.thinking);
  const levels = models.find((m) => m.slug === model)?.efforts ?? [];
  const ready = useSettings((s) => s.ai.planReady);
  const generation = useRef(0);
  const active = useRef(false);
  const sync = useCallback(async (id: number, current: PlanStatus) => {
    if (generation.current !== id) return;
    setStatus(current);
    const {ai, setAi} = useSettings.getState();
    setAi({ ...ai, planReady: false });
    setModels([]);
    if (!current.plan) { bindUsageAccount(null); return; }
    const available = await planModels();
    if (generation.current !== id) return;
    bindUsageAccount(current.account);
    setModels(available);
    const state = useSettings.getState();
    const previous = state.ai.models.chatgpt;
    const choice = available.find((m) => m.slug === previous)?.slug ?? available[0]?.slug ?? "";
    const saved = state.ai.thinking;
    const thinking = available.find((m) => m.slug === saved?.model)?.efforts?.includes(saved?.effort ?? "") ? saved : undefined;
    state.setAi({ ...state.ai, thinking, planReady: !!choice, models: { ...state.ai.models, chatgpt: choice } });
    if (!choice) setMessage(fmt(t.ai.testOk, { n: 0 }));
  }, [t]);

  const run = useCallback(async (action: "status" | "connect" | "different" | "disconnect") => {
    if (active.current && action === "status") return;
    const id = ++generation.current;
    active.current = true;
    setBusy(true);
    setMessage(action === "connect" || action === "different" ? copy.waiting : "");
    try {
      if (action === "disconnect") {
        const confirmed = await invoke<boolean>("chatgpt_disconnect");
        await sync(id, { account: null, plan: false, known: true });
        if (!confirmed && id === generation.current) setMessage(copy.signedOut);
      } else {
        const current = action === "status" ? await invoke<PlanStatus>("chatgpt_status")
          : await invoke<PlanStatus>("chatgpt_connect", { different: action === "different" });
        if (action !== "status") bindUsageAccount(null);
        await sync(id, current);
        if (action !== "status" && generation.current === id) setMessage("");
      }
    } catch (err) {
      if (id === generation.current) setMessage(String(err) === "timeout" && (action === "connect" || action === "different") ? copy.loginTimeout : planError(err).text);
    } finally {
      if (id === generation.current) { active.current = false; setBusy(false); }
    }
  }, [copy, sync]);

  useEffect(() => {
    if (selected && offersChatGPT()) void run("status");
  }, [selected, open, run]);

  const choose = (value: string) => {
    const {ai,setAi} = useSettings.getState();
    setAi({ ...ai, models: { ...ai.models, chatgpt: value } });
  };
  return <>
    {status?.account && <div className="plan-account"><span>{status.account}</span><button type="button" className="ghost-button" disabled={busy} onClick={() => void run("disconnect")}>{copy.disconnect}</button></div>}
    {(!ready || !status?.account) && <button type="button" className="ghost-button" disabled={busy} onClick={() => void run("connect")}>
      {status?.account && !status.plan ? copy.enable : copy.connect}
    </button>}
    {status?.known && !status.account && <button type="button" className="ghost-button" disabled={busy} onClick={() => void run("different")}>{copy.different}</button>}
    {status?.plan && <>
      <label htmlFor={modelId}>{t.ai.model}</label>
      <select id={modelId} disabled={busy || !models.length} value={model} onChange={(e) => choose(e.target.value)}>
        {models.map((m) => <option value={m.slug} key={m.slug}>{m.label}</option>)}
      </select>
      {levels.length > 0 && <>
        <label htmlFor={modelId + "-effort"}>{copy.thinking}</label>
        <select id={modelId + "-effort"} disabled={busy} value={thinking?.model === model ? thinking.effort : ""}
          onChange={(e) => {
            const {ai, setAi} = useSettings.getState();
            setAi({ ...ai, thinking: e.target.value ? {model, effort: e.target.value} : undefined });
          }}>
          <option value="">{copy.auto}</option>
          {levels.map((level) => <option key={level} value={level}>{copy.levels[level as keyof typeof copy.levels] ?? level}</option>)}
        </select>
      </>}
      <button type="button" className="ghost-button" disabled={busy} onClick={() => void run("status")}>{copy.retry}</button>
      <ChatGPTUsage />

    </>}
    {message && <p className="settings-hint" role="status">{message}</p>}
  </>;
}
