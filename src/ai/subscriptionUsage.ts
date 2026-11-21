import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { planModels } from "./chatgpt";

export interface UsageWindow { percent: number; reset: number | null }

const initial = { windows: [] as UsageWindow[], busy: false };
export const useSubscriptionUsage = create(() => initial);
let account: string | null = null;
let generation = 0;
let pending: Promise<void> | undefined;

export function bindUsageAccount(next: string | null) {
  if (next === account) return;
  account = next;
  ++generation;
  pending = undefined;
  useSubscriptionUsage.setState(initial);
}

export function refreshUsage(discovery?: Promise<unknown>): Promise<void> {
  if (!account) return Promise.resolve();
  if (pending) return pending;
  const version = generation;
  useSubscriptionUsage.setState({ busy: true });
  pending = (discovery ?? planModels())
    .catch(() => undefined)
    .then(() => invoke<UsageWindow[]>("chatgpt_usage"))
    .then((windows) => {
      if (version === generation) useSubscriptionUsage.setState({ windows });
    })
    .catch(() => undefined)
    .finally(() => {
      if (version === generation) {
        pending = undefined;
        useSubscriptionUsage.setState({ busy: false });
      }
    });
  return pending;
}
