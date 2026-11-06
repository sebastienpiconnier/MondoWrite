// @vitest-environment happy-dom
// Clés dans le trousseau du système (#30) : migration depuis les réglages, clés jamais perdues, retour aux réglages
// si le trousseau refuse d'écrire.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initSettings, keysInKeychain, setKeysInKeychain, useSettings } from "../settings";
import { KEYCHAIN_DELAY_MS, initKeychain, mergeSecrets, readSecrets, writeSecrets, type Keychain } from "../secrets";

const saved = () => JSON.parse(localStorage.getItem("cosmos:reglages") ?? "{}");

function fakeKeychain(initial: string | null = null) {
  const box = { text: initial, failSet: false, broken: false };
  const keychain: Keychain = {
    get: async () => {
      if (box.broken) throw new Error("no keychain");
      return box.text;
    },
    set: async (text) => {
      if (box.failSet) throw new Error("refused");
      box.text = text;
    },
    remove: async () => {
      box.text = null;
    },
  };
  return { box, keychain };
}

const setKeys = (claude: string, unsplash = "") =>
  useSettings.setState((s) => ({ ai: { ...s.ai, keys: claude ? { anthropic: claude } : {} }, photos: { ...s.photos, keys: { pixabay: "", unsplash } } }));

let stop: () => void = () => {};

beforeEach(() => {
  setKeysInKeychain(false);
  initSettings();
  setKeys("");
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("format de l'entrée", () => {
  it("relit ce qu'elle écrit, sans les clés vides", () => {
    const text = writeSecrets({ ai: { anthropic: "sk-1", openai: "" }, photos: { pixabay: "", unsplash: "u-2" } });
    expect(text).toBe('{"ai":{"anthropic":"sk-1"},"photos":{"unsplash":"u-2"}}');
    expect(readSecrets(text)).toEqual({ ai: { anthropic: "sk-1" }, photos: { pixabay: "", unsplash: "u-2" } });
  });

  it("ignore ce qui n'a pas la bonne forme", () => {
    expect(readSecrets("pas du json")).toBeNull();
    expect(readSecrets('{"ai":{"anthropic":42,"inconnu":"x"}}')).toEqual({ ai: {}, photos: { pixabay: "", unsplash: "" } });
    expect(readSecrets(null)).toEqual({ ai: {}, photos: { pixabay: "", unsplash: "" } });
  });

  it("les clés des réglages passent devant, celles du trousseau restent", () => {
    const merged = mergeSecrets({ ai: { anthropic: "ancienne", openai: "o" }, photos: { pixabay: "p", unsplash: "" } }, { ai: { anthropic: "nouvelle" }, photos: { pixabay: "", unsplash: "u" } });
    expect(merged).toEqual({ ai: { anthropic: "nouvelle", openai: "o" }, photos: { pixabay: "p", unsplash: "u" } });
  });
});

describe("trousseau", () => {
  it("migration : les clés passent au trousseau, puis quittent cosmos:reglages", async () => {
    setKeys("sk-ant", "uns");
    expect(saved().ai.keys).toEqual({ anthropic: "sk-ant" });
    const { box, keychain } = fakeKeychain();
    stop = await initKeychain(keychain);
    expect(readSecrets(box.text)).toEqual({ ai: { anthropic: "sk-ant" }, photos: { pixabay: "", unsplash: "uns" } });
    expect(keysInKeychain()).toBe(true);
    expect(saved().ai.keys).toEqual({});
    expect(saved().photos.keys).toEqual({ pixabay: "", unsplash: "" });
    // En mémoire, rien n'a bougé : l'IA a toujours sa clé.
    expect(useSettings.getState().ai.keys.anthropic).toBe("sk-ant");
  });

  it("au lancement suivant, les clés reviennent du trousseau", async () => {
    const { keychain } = fakeKeychain('{"ai":{"openai":"sk-o"},"photos":{"pixabay":"px"}}');
    stop = await initKeychain(keychain);
    expect(useSettings.getState().ai.keys).toEqual({ openai: "sk-o" });
    expect(useSettings.getState().photos.keys.pixabay).toBe("px");
    expect(saved().ai.keys).toEqual({});
  });

  it("pas de trousseau : les clés restent dans les réglages", async () => {
    setKeys("sk-ant");
    const { box, keychain } = fakeKeychain();
    box.broken = true;
    stop = await initKeychain(keychain);
    expect(keysInKeychain()).toBe(false);
    expect(saved().ai.keys).toEqual({ anthropic: "sk-ant" });
  });

  it("écriture refusée à la migration : rien ne quitte les réglages", async () => {
    setKeys("sk-ant");
    const { box, keychain } = fakeKeychain();
    box.failSet = true;
    stop = await initKeychain(keychain);
    expect(keysInKeychain()).toBe(false);
    expect(saved().ai.keys).toEqual({ anthropic: "sk-ant" });
  });

  it("une entrée abîmée n'est pas écrasée", async () => {
    setKeys("sk-ant");
    const { box, keychain } = fakeKeychain("{abîmé");
    stop = await initKeychain(keychain);
    expect(box.text).toBe("{abîmé");
    expect(saved().ai.keys).toEqual({ anthropic: "sk-ant" });
  });

  it("une clé changée ensuite est écrite au trousseau ; refusée, elle revient dans les réglages", async () => {
    vi.useFakeTimers();
    const { box, keychain } = fakeKeychain('{"ai":{"anthropic":"a"},"photos":{}}');
    stop = await initKeychain(keychain);
    setKeys("b");
    await vi.advanceTimersByTimeAsync(KEYCHAIN_DELAY_MS + 10);
    expect(readSecrets(box.text)?.ai.anthropic).toBe("b");
    expect(saved().ai.keys).toEqual({});

    box.failSet = true;
    setKeys("c");
    await vi.advanceTimersByTimeAsync(KEYCHAIN_DELAY_MS + 10);
    expect(keysInKeychain()).toBe(false);
    expect(saved().ai.keys).toEqual({ anthropic: "c" });
  });

  it("toutes les clés retirées : l'entrée est supprimée", async () => {
    vi.useFakeTimers();
    const { box, keychain } = fakeKeychain('{"ai":{"anthropic":"a"},"photos":{}}');
    stop = await initKeychain(keychain);
    setKeys("");
    await vi.advanceTimersByTimeAsync(KEYCHAIN_DELAY_MS + 10);
    expect(box.text).toBeNull();
    expect(keysInKeychain()).toBe(true);
  });
});
