import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { planModels } from "./chatgpt";

export interface UsageWindow { percent: number; reset: number | null }
interface Snapshot { connected: boolean; workspace: string | null; label: string | null; windows: UsageWindow[] }
type UsageAction = "read" | "preview" | "connect" | "disconnect";
const initial = { codex: null as Snapshot | null, windows: [] as UsageWindow[], busy: false, error: "" };
export const useSubscriptionUsage = create(() => initial);
let account: string | null = null;
let epoch = 0;
let pending: Promise<void> | undefined;

export function bindUsageAccount(next: string | null) {
  if (next === account) return;
  account = next;
  ++epoch;
  pending = undefined;
  useSubscriptionUsage.setState(initial);
  if (next) void refreshUsage("read", undefined, false);
}

export function refreshUsage(action: UsageAction, workspace?: string | null, fetchModels = true): Promise<void> {
  if (action === "read" && pending) return pending;
  const version = ++epoch;
  const apply = (patch: Partial<typeof initial>) => {
    if (version === epoch) useSubscriptionUsage.setState(patch);
  };
  apply({ busy: true, error: "" });
  const task = async () => {
    try {
      const codex = await invoke<Snapshot>("codex_usage", { action, workspace });
      apply({ codex });
      if (!codex.connected && action === "read") {
        if (fetchModels) await planModels();
        const windows = await invoke<UsageWindow[]>("chatgpt_usage");
        if (windows.length) apply({ windows });
      }
    } catch (error) {
      const code = String(error);
      if (code === "codexMismatch" || code === "auth") apply({ codex: null, windows: [] });
      apply({ error: code });
    } finally {
      if (version === epoch) { pending = undefined; apply({ busy: false }); }
    }
  };
  pending = task();
  return pending;
}
