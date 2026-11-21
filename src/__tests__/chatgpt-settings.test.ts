// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useChatGPTSettings } from "../components/ChatGPTSettings";
import { getT } from "../i18n";
import { useSettings } from "../settings";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../platform", async (load) => ({
  ...await load<typeof import("../platform")>(), isTauri: () => true, isMobileOS: () => false,
}));

function Controls({ open }: { open: boolean }) {
  return useChatGPTSettings(true, open);
}

it("garde le modèle hors ligne au démarrage et distingue un catalogue vide à la réouverture", async () => {
  const previous = useSettings.getState().ai;
  useSettings.getState().setAi({ ...previous, models: { ...previous.models, chatgpt: "saved" }, planReady: false });
  let offline = true;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "chatgpt_status") return { account: "example", plan: true, known: true };
    if (command === "chatgpt_models" && offline) throw "network";
    return [];
  });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(Controls, { open: false })));
    expect(useSettings.getState().ai).toMatchObject({ planReady: true, models: { chatgpt: "saved" } });
    expect(host.querySelector("select")?.value).toBe("saved");
    offline = false;
    await act(async () => root.render(createElement(Controls, { open: true })));
    expect(host.textContent).toContain(getT().ai.chatgpt.noModels);
  } finally {
    await act(async () => root.unmount());
    useSettings.getState().setAi(previous);
  }
});
