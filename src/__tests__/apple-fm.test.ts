// @vitest-environment happy-dom
// Apple Foundation Models (lot 1.10.0) : limites des services, lecture des réponses du pont, disponibilité simulée.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import { allows, APPLE_CONTEXT, CONTEXT_MARGIN, estimateTokens, fitReply, MIN_REPLY, packBudget, PROVIDER_LIMITS, takeWithin, vracLimit, type AiAction } from "../ai/limits";
import { appleAvailability, appleComplete, isOffered, readAvailability, readFmError } from "../ai/apple";
import { AI_PROVIDERS, AiError, aiErrorText, complete, isReady, listModels, PROVIDERS } from "../ai/providers";
import { canEmbed } from "../ai/semantic";
import { aiConfig } from "../settings";
import { getT } from "../i18n";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const tauri = (on: boolean) => {
  if (on) (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  else delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
};

beforeEach(() => {
  core.invoke.mockReset();
  tauri(false);
});
afterEach(() => tauri(false));

describe("PROVIDER_LIMITS", () => {
  it("chaque service a ses limites ; seul le modèle d'Apple est borné", () => {
    for (const p of AI_PROVIDERS) expect(PROVIDER_LIMITS[p]).toBeDefined();
    for (const p of AI_PROVIDERS.filter((p) => p !== "apple")) {
      expect(PROVIDER_LIMITS[p].context).toBeNull();
      expect(PROVIDER_LIMITS[p].refused).toEqual([]);
    }
    expect(PROVIDER_LIMITS.apple.context).toBe(APPLE_CONTEXT);
    expect(PROVIDER_LIMITS.apple.maxOutput).toBeLessThan(APPLE_CONTEXT / 2);
  });

  it("le modèle d'Apple refuse ce qui lit tout le récit, garde Ranger, l'interview et les cases", () => {
    const refused: AiAction[] = ["coherence", "continuity", "voices", "beta", "retro", "photo"];
    for (const a of refused) expect(allows("apple", a)).toBe(false);
    for (const a of refused) expect(allows("anthropic", a)).toBe(true);
    for (const a of refused) expect(allows("ollama", a)).toBe(true);
  });

  it("paquets plus petits pour Apple, budget de l'action ailleurs", () => {
    expect(packBudget("apple", 30_000)).toBe(6000);
    expect(packBudget("apple", 4000)).toBe(4000);
    expect(packBudget("openai", 30_000)).toBe(30_000);
    expect(packBudget("ollama", Infinity)).toBe(Infinity);
    expect(vracLimit("apple", 8000)).toBe(1500);
    expect(vracLimit("lmstudio", 8000)).toBe(8000);
  });

  it("un paquet d'Apple plus une consigne de 1 600 caractères tiennent dans la fenêtre", () => {
    const system = "x".repeat(1600);
    const user = "y".repeat(PROVIDER_LIMITS.apple.pack!);
    expect(fitReply("apple", system, user, 3000)).toBeGreaterThanOrEqual(MIN_REPLY);
  });
});

describe("fitReply", () => {
  it("services sans fenêtre connue : la longueur demandée", () => {
    expect(fitReply("anthropic", "a".repeat(100_000), "b", 3000)).toBe(3000);
  });

  it("Apple : bornée par maxOutput, puis par la place qui reste", () => {
    expect(fitReply("apple", "court", "court", 3000)).toBe(PROVIDER_LIMITS.apple.maxOutput);
    expect(fitReply("apple", "court", "court", 400)).toBe(400);
    const user = "z".repeat(3 * 3500);
    const room = APPLE_CONTEXT - CONTEXT_MARGIN - estimateTokens("apple", "s") - estimateTokens("apple", user);
    expect(fitReply("apple", "s", user, 3000)).toBe(room);
  });

  it("Apple : trop long, null (la place qui reste ne vaut pas une réponse)", () => {
    expect(fitReply("apple", "s", "z".repeat(3 * 4000), 3000)).toBeNull();
  });
});

describe("takeWithin", () => {
  it("garde l'ordre et s'arrête au budget, au moins un élément", () => {
    expect(takeWithin([3, 3, 3, 3], (n) => n, 7)).toEqual([3, 3]);
    expect(takeWithin([10, 1], (n) => n, 5)).toEqual([10]);
    expect(takeWithin([], (n: number) => n, 5)).toEqual([]);
    expect(takeWithin([1, 2, 3], (n) => n, Infinity)).toEqual([1, 2, 3]);
  });
});

describe("lecture des réponses du pont", () => {
  it("disponibilité : valeurs connues, inconnue = other, absente = unsupported", () => {
    expect(readAvailability("available")).toBe("available");
    expect(readAvailability("notEnabled")).toBe("notEnabled");
    expect(readAvailability("osTooOld")).toBe("osTooOld");
    expect(readAvailability("quelque chose")).toBe("other");
    expect(readAvailability(3)).toBe("other");
    expect(readAvailability(null)).toBe("unsupported");
    expect(readAvailability(undefined)).toBe("unsupported");
  });

  it("proposé (ou grisé) seulement quand l'auteur peut y faire quelque chose", () => {
    expect(isOffered("available")).toBe(true);
    expect(isOffered("notEnabled")).toBe(true);
    expect(isOffered("notReady")).toBe(true);
    expect(isOffered("notEligible")).toBe(false);
    expect(isOffered("osTooOld")).toBe(false);
    expect(isOffered("unsupported")).toBe(false);
  });

  it("erreur : code connu ou other, message borné", () => {
    expect(readFmError({ code: "guardrail", message: "Unsafe content" })).toEqual({ code: "guardrail", message: "Unsafe content" });
    expect(readFmError({ code: "boom" }).code).toBe("other");
    expect(readFmError("texte").code).toBe("other");
    expect(readFmError({ code: "context", message: "x".repeat(500) }).message).toHaveLength(240);
    expect(readFmError(null)).toEqual({ code: "other", message: "" });
  });
});

describe("service apple dans l'app", () => {
  it("navigateur : non pris en charge, sans rien demander", async () => {
    expect(await appleAvailability(true)).toBe("unsupported");
    expect(core.invoke).not.toHaveBeenCalled();
  });

  it("app : la disponibilité vient de fm_availability ; une commande absente vaut unsupported", async () => {
    tauri(true);
    core.invoke.mockResolvedValueOnce("notEnabled");
    expect(await appleAvailability(true)).toBe("notEnabled");
    expect(core.invoke).toHaveBeenCalledWith("fm_availability");
    core.invoke.mockRejectedValueOnce(new Error("command fm_availability not found"));
    expect(await appleAvailability(true)).toBe("unsupported");
  });

  it("sans adresse, clé ni liste de modèles ; prêt d'office ; pas de recherche par le sens", async () => {
    const config = aiConfig({ provider: "apple", keys: {}, models: {}, urls: {}, embedModels: {} });
    expect(PROVIDERS.apple.device).toBe(true);
    expect(PROVIDERS.apple.local).toBe(true);
    expect(isReady(config)).toBe(true);
    expect(canEmbed("apple")).toBe(false);
    expect(canEmbed("ollama")).toBe(true);
    expect(await listModels(config!)).toEqual([]);
  });

  it("complete passe par fm_complete, longueur de réponse bornée", async () => {
    tauri(true);
    core.invoke.mockImplementation(async (cmd: string) => (cmd === "fm_complete" ? '  {"items": []}  ' : undefined));
    const config = aiConfig({ provider: "apple", keys: {}, models: {}, urls: {}, embedModels: {} })!;
    expect(await complete(config, "consigne", "message", { json: true, maxTokens: 3000 })).toBe('{"items": []}');
    expect(core.invoke).toHaveBeenCalledWith("fm_complete", expect.objectContaining({ system: "consigne", user: "message", maxTokens: PROVIDER_LIMITS.apple.maxOutput }));
  });

  it("trop long : refusé avant d'appeler le modèle, phrase claire", async () => {
    tauri(true);
    const err = await appleComplete("s", "z".repeat(20_000), { maxTokens: 1000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(core.invoke).not.toHaveBeenCalled();
    expect(aiErrorText(err, getT().ai.errors)).toBe(getT().apple.errors.tooLong);
  });

  it("garde-fous d'Apple : message propre au modèle, pas le message générique", async () => {
    tauri(true);
    core.invoke.mockRejectedValueOnce({ code: "guardrail", message: "Detected content likely to be unsafe" });
    const err = await appleComplete("s", "u").catch((e: unknown) => e);
    expect(aiErrorText(err, getT().ai.errors)).toBe(getT().apple.errors.guardrail);
  });

  it("réponse vide : code empty", async () => {
    tauri(true);
    core.invoke.mockResolvedValueOnce("   ");
    const err = (await appleComplete("s", "u").catch((e: unknown) => e)) as AiError;
    expect(err.code).toBe("empty");
  });

  it("Annuler : fm_cancel est appelé avec le même identifiant, code cancelled", async () => {
    tauri(true);
    let id = -1;
    core.invoke.mockImplementation((cmd: string, args: { id: number }) => {
      if (cmd === "fm_complete") {
        id = args.id;
        return new Promise(() => {}); // la réponse n'arrive jamais
      }
      return Promise.resolve();
    });
    const controller = new AbortController();
    const pending = appleComplete("s", "u", { signal: controller.signal });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    const err = (await pending.catch((e: unknown) => e)) as AiError;
    expect(err.code).toBe("cancelled");
    expect(core.invoke).toHaveBeenCalledWith("fm_cancel", { id });
  });

  it("annulé avant de partir : rien n'est demandé", async () => {
    tauri(true);
    const controller = new AbortController();
    controller.abort();
    const err = (await appleComplete("s", "u", { signal: controller.signal }).catch((e: unknown) => e)) as AiError;
    expect(err.code).toBe("cancelled");
    expect(core.invoke).not.toHaveBeenCalledWith("fm_complete", expect.anything());
  });
});

describe("textes", () => {
  it("chaque raison et chaque erreur a son texte, en français et en anglais", () => {
    for (const lang of [fr, en]) {
      for (const key of ["available", "notEnabled", "notEligible", "notReady", "osTooOld", "unsupported", "other"] as const) expect(lang.apple.availability[key]).toBeTruthy();
      for (const key of ["tooLong", "context", "guardrail", "language", "unavailable", "busy", "other"] as const) expect(lang.apple.errors[key]).toBeTruthy();
      expect(lang.ai.providers.apple).toBeTruthy();
    }
  });
});
