import { afterEach, expect, it, vi } from "vitest";
import { countRequest, requestsToday } from "../ai/usage";

afterEach(() => vi.unstubAllGlobals());

it("keeps separate provider counts and starts a new day at local midnight", () => {
  const evening = new Date(2026, 10, 20, 23, 59);
  const morning = new Date(2026, 10, 21, 0, 0);
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget());
  countRequest("chatgpt", evening);
  expect(requestsToday("chatgpt", evening)).toBe(1);
  expect(requestsToday("openai", evening)).toBe(0);
  expect(requestsToday("chatgpt", morning)).toBe(0);
});
