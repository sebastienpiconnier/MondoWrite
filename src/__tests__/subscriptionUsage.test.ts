import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { bindUsageAccount, refreshUsage, useSubscriptionUsage } from "../ai/subscriptionUsage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

it("keeps the launch reading during a menu refresh, shares in-flight work, and clears it on sign-out", async () => {
  const snapshot = (percent: number) => ({ connected: true, workspace: "example", label: "Example", windows: [{ percent, reset: null }] });
  vi.mocked(invoke).mockResolvedValueOnce(snapshot(25));
  bindUsageAccount("example");
  await refreshUsage("read");
  expect(invoke).toHaveBeenCalledTimes(1);
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const refresh = refreshUsage("read");
  expect(useSubscriptionUsage.getState()).toMatchObject({ busy: true, codex: snapshot(25) });
  finish(snapshot(27));
  await refresh;
  expect(useSubscriptionUsage.getState()).toMatchObject({ busy: false, codex: snapshot(27) });
  vi.mocked(invoke).mockRejectedValueOnce("codexError");
  await refreshUsage("read");
  expect(useSubscriptionUsage.getState()).toMatchObject({ busy: false, codex: snapshot(27) });
  bindUsageAccount(null);
  expect(useSubscriptionUsage.getState().codex).toBeNull();
});
