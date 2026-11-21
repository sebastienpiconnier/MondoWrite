import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { bindUsageAccount, refreshUsage, useSubscriptionUsage } from "../ai/subscriptionUsage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

it("keeps the last header reading during refresh and discards pending results on sign-out", async () => {
  const windows = [{ percent: 25, reset: null }];
  bindUsageAccount("example");
  vi.mocked(invoke).mockResolvedValueOnce(windows);
  await refreshUsage(Promise.resolve());
  expect(invoke).toHaveBeenCalledWith("chatgpt_usage");
  let finish!: () => void;
  const discovery = new Promise<void>(resolve => { finish = resolve; });
  const refresh = refreshUsage(discovery);
  expect(refreshUsage()).toBe(refresh);
  expect(useSubscriptionUsage.getState()).toEqual({ busy: true, windows });
  bindUsageAccount(null);
  vi.mocked(invoke).mockResolvedValueOnce(windows);
  finish();
  await refresh;
  expect(useSubscriptionUsage.getState()).toEqual({ busy: false, windows: [] });
});
