import type { AiProvider } from "./providers";

function counterKey(provider: AiProvider) {
  return "mondowrite:usage:" + provider;
}

export function requestsToday(provider: AiProvider, now = new Date()): number {
  try {
    const value = JSON.parse(localStorage.getItem(counterKey(provider)) ?? "null");
    return value?.day === now.toDateString() && Number.isSafeInteger(value.count) && value.count > 0 ? value.count : 0;
  } catch {
    return 0;
  }
}

export function countRequest(provider: AiProvider, now = new Date()) {
  try {
    const count = requestsToday(provider, now) + 1;
    localStorage.setItem(counterKey(provider), JSON.stringify({ day: now.toDateString(), count }));
    window.dispatchEvent(new Event("mondowrite-usage"));
  } catch {
    // Storage can be unavailable while the writing service still works.
  }
}
