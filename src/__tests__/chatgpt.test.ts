import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { complete, listModels, type AiConfig } from "../ai/providers";
import { parseCoherence } from "../ai/tasks";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const native = vi.mocked(invoke);
const config: AiConfig = { provider: "chatgpt", model: "account-model", key: "", url: "", planReady: true };
afterEach(() => vi.resetAllMocks());

describe("ChatGPT desktop writing", () => {
  it("uses the account catalog and preserves the selected model and prompt", async () => {
    native.mockResolvedValueOnce([{ slug: "account-model", label: "Account model" }]);
    expect(await listModels(config)).toEqual(["account-model"]);
    native.mockResolvedValueOnce("request").mockResolvedValueOnce('{"issues":[]}');
    const text = await complete(config, "Review consistency.", "A fictional scene.", { json: true, timeoutMs: 120000 });
    expect(parseCoherence(text, [])).toEqual([]);
    expect(native).toHaveBeenLastCalledWith("chatgpt_complete", {
      id: "request", model: "account-model", system: "Review consistency.", user: "A fictional scene.", timeoutMs: 120000
    });
  });
  it("rejects attachments before requesting a ticket", async () => {
    await expect(complete(config, "Describe", "Photo", { images: [{ mime: "image/png", data: "AA==" }] })).rejects.toThrow();
    expect(native).not.toHaveBeenCalled();
  });
  it("rejects a late result after cancellation", async () => {
    const ctrl = new AbortController();
    native.mockResolvedValueOnce("pending").mockImplementationOnce(async () => {
      ctrl.abort();
      return "late output";
    }).mockResolvedValue(undefined);
    await expect(complete(config, "Review", "Draft", { signal: ctrl.signal })).rejects.toMatchObject({ code: "cancelled" });
    expect(native).toHaveBeenCalledWith("chatgpt_cancel", { id: "pending" });
  });
  it("preserves quota recovery details and never retries using an API key", async () => {
    native.mockResolvedValueOnce("pending").mockRejectedValueOnce("limit|Retry in 12 minutes");
    await expect(complete(config, "Review", "Draft")).rejects.toMatchObject({ code: "limit", text: expect.stringContaining("12 minutes") });
    expect(native).toHaveBeenCalledTimes(2);
  });
});

it("passes an explicit thinking level through the subscription provider", async () => {
  native.mockResolvedValueOnce("ticket").mockResolvedValueOnce("done");
  await complete({ ...config, effort: "high" }, "Review", "Draft");
  expect(native).toHaveBeenLastCalledWith("chatgpt_complete", expect.objectContaining({ effort: "high" }));
});
