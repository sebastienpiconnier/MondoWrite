// @vitest-environment happy-dom
// Lot 1.7.4, zone IA : corrections de l'audit (identifiants, questions, cohérence, services, lecture de page).

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AiError, aiErrorText, chatRequest, complete, isLoopback, THINKING_MARGIN, type AiConfig } from "../ai/providers";
import { nameCards, parseCoherence, parseQuestion, TIDY_MAX, tidyCandidates, tidyLeftOut } from "../ai/tasks";
import { readText } from "../web";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { useSettings } from "../settings";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string, html = ""): CardData => ({ id, type, title, html });
const config = (provider: AiConfig["provider"], extra: Partial<AiConfig> = {}): AiConfig => ({ provider, key: "sk-test", model: "modele", url: "", ...extra });
const names = { type: (t: string) => (t === "personnage" ? "personnage" : t), untitled: "Sans titre" };

describe("nameCards : identifiant qui commence ou finit par un tiret", () => {
  it("l'identifiant nanoid avec « - » au bord est remplacé par le titre", () => {
    const cards = [card("-k3x9a7bq2", "personnage", "Inès"), card("p4t8w2zq1-", "personnage", "Yann")];
    expect(nameCards("Que sait -k3x9a7bq2 de p4t8w2zq1- ?", cards, names)).toBe("Que sait Inès (personnage) de Yann (personnage) ?");
    // Jamais au milieu d'un mot plus long.
    expect(nameCards("x-k3x9a7bq2", cards, names)).toBe("x-k3x9a7bq2");
  });
});

describe("parseQuestion : un nombre de la phrase reste", () => {
  it("« 2 ans après » garde son chiffre, « 2. » et « 2) » partent", () => {
    expect(parseQuestion("2 ans après le naufrage, que garde-t-elle ?")).toBe("2 ans après le naufrage, que garde-t-elle ?");
    expect(parseQuestion("2. Que garde-t-elle ?")).toBe("Que garde-t-elle ?");
    expect(parseQuestion("2) Que garde-t-elle ?")).toBe("Que garde-t-elle ?");
    expect(parseQuestion("- 1. Question : Pourquoi ?")).toBe("Pourquoi ?");
  });
});

describe("parseCoherence : titre cité en mots entiers", () => {
  it("« Max » n'est pas cité dans « maximum », l'est dans « Max et Élise »", () => {
    const cards = [card("a1", "personnage", "Max"), card("b2", "personnage", "Élise")];
    expect(parseCoherence('{"items":[{"cards":[],"question":"Quel âge au maximum ?"}]}', cards)).toEqual([]);
    expect(parseCoherence('{"items":[{"cards":[],"question":"Max et Elise se connaissent-ils ?"}]}', cards)[0].cards).toEqual(["a1", "b2"]);
    expect(parseCoherence('{"items":[{"cards":[],"question":"Pourquoi Maxé ?"}]}', cards)).toEqual([]);
  });
});

describe("Ranger : au-delà de 80 idées", () => {
  it("le nombre d'idées laissées de côté est connu", () => {
    const cards = Array.from({ length: TIDY_MAX + 5 }, (_, i) => card(`i${i}`, "idee", `Idée ${i}`));
    expect(tidyCandidates(cards)).toHaveLength(TIDY_MAX);
    expect(tidyLeftOut(cards)).toBe(5);
    expect(tidyLeftOut(cards.slice(0, 3))).toBe(0);
    expect(fr.ai.tidyLeftOut && en.ai.tidyLeftOut).toBeTruthy();
  });
});

describe("services : adresse, limite de longueur, délai", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("une adresse collée avec /v1 ne donne pas /v1/v1", () => {
    expect(chatRequest(config("lmstudio", { url: "http://localhost:1234/v1/" }), "c", "t").url).toBe("http://localhost:1234/v1/chat/completions");
    expect(chatRequest(config("ollama", { url: "http://localhost:11434/v1" }), "c", "t").url).toBe("http://localhost:11434/api/chat");
  });

  it("une limite de longueur part aussi vers OpenAI, OpenRouter, LM Studio et Ollama", () => {
    const body = (p: AiConfig["provider"]) => JSON.parse(chatRequest(config(p), "c", "t", 400).body!);
    expect(body("openai").max_completion_tokens).toBe(400 + THINKING_MARGIN);
    expect(body("openrouter").max_tokens).toBe(400 + THINKING_MARGIN);
    expect(body("lmstudio").max_tokens).toBe(400 + THINKING_MARGIN);
    expect(body("ollama").options.num_predict).toBe(400 + THINKING_MARGIN);
    expect(body("anthropic").max_tokens).toBe(400);
  });

  it("délai dépassé : son propre message ; annulation par l'auteur", async () => {
    vi.useFakeTimers();
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      // Comme fetch : un signal déjà coupé rejette tout de suite.
      if (init.signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", hang);
    const late = complete(config("openai"), "c", "t");
    const caught = late.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(91_000);
    const err = await caught;
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).code).toBe("timeout");
    expect(aiErrorText(err, fr.ai.errors)).toBe(fr.ai.errors.timeout);
    expect(fr.ai.errors.timeout).not.toBe(fr.ai.errors.network);

    const controller = new AbortController();
    const cancelled = complete(config("openai"), "c", "t", { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    expect(((await cancelled) as AiError).code).toBe("cancelled");
  });

  it("le texte d'aide ne promet « rien ne sort » que pour une adresse de cet ordinateur", () => {
    expect(isLoopback("")).toBe(true);
    expect(isLoopback("http://localhost:11434")).toBe(true);
    expect(isLoopback("http://127.0.0.1:1234/v1")).toBe(true);
    expect(isLoopback("192.168.1.20:11434")).toBe(false);
    expect(isLoopback("http://serveur.example:11434")).toBe(false);
    expect(fr.ai.hintRemote && en.ai.hintRemote).toBeTruthy();
  });
});

describe("readPage : lecture arrêtée à la taille maximale", () => {
  it("le flux n'est pas lu au-delà de la limite", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 1000) return c.close();
        c.enqueue(new TextEncoder().encode("a".repeat(1000)));
      },
    });
    const text = await readText(new Response(stream), 2500);
    expect(text).toHaveLength(2500);
    expect(pulled).toBeLessThan(10);
  });

  it("sans flux : tout est lu puis coupé", async () => {
    expect(await readText(new Response("é".repeat(10)), 1000)).toBe("é".repeat(10));
  });
});

describe("Réglages : clé collée pendant le chargement des modèles, nouvel essai après un échec", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("la clé n'est pas effacée par le modèle proposé ensuite", async () => {
    const { Settings } = await import("../components/Settings");
    let release: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (release = r))));
    useSettings.getState().setAi({ provider: "openai", keys: { openai: "sk-ancienne" }, models: { openai: "" }, urls: {} });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Settings, { project: false })));
    const open = host.querySelector<HTMLButtonElement>(`button[aria-label="${useSettings.getState().lang === "en" ? en.settings.title : fr.settings.title}"]`)!;
    await act(async () => open.click());
    const testButton = [...host.querySelectorAll("button")].find((b) => b.textContent === fr.ai.test || b.textContent === en.ai.test)!;
    await act(async () => testButton.click());
    // Pendant la requête, l'auteur colle une nouvelle clé.
    const ai = useSettings.getState().ai;
    useSettings.getState().setAi({ ...ai, keys: { openai: "sk-nouvelle" } });
    await act(async () => release(new Response(JSON.stringify({ data: [{ id: "gpt-x" }] }), { status: 200 })));
    expect(useSettings.getState().ai.keys.openai).toBe("sk-nouvelle");
    expect(useSettings.getState().ai.models.openai).toBe("gpt-x");
    await act(async () => root.unmount());
  });

  it("un serveur local injoignable : on le dit, et la liste se recharge en rouvrant", async () => {
    const { Settings } = await import("../components/Settings");
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    useSettings.getState().setAi({ provider: "lmstudio", keys: {}, models: {}, urls: {} });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Settings, { project: false })));
    const open = () => host.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
    await act(async () => open().click());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    const status = host.querySelector('[role="status"]')!.textContent ?? "";
    expect(status.startsWith(fr.ai.listFailed.split(" :")[0]) || status.startsWith(en.ai.listFailed.split(":")[0])).toBe(true);
    await act(async () => open().click()); // fermer
    await act(async () => open().click()); // rouvrir
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    await act(async () => root.unmount());
  });
});
