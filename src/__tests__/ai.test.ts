// @vitest-environment happy-dom
// IA facultative : requêtes vers chaque service, lecture des réponses, consignes et relecture des propositions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_PROVIDERS, AiError, PROVIDERS, chatRequest, complete, errorCode, isReady, listModels, modelsRequest, readModels, readReply, type AiConfig, OLLAMA_CONTEXT, stripThinking } from "../ai/providers";
import { aiErrorText, AiError as AiErr, serviceReason } from "../ai/providers";
import { coherencePrompt, extractJson, interviewPrompt, nameCards, parseCoherence, parseQuestion, parseTidy, tidyCandidates, tidyPrompt } from "../ai/tasks";
import { aiConfig } from "../settings";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string, html = ""): CardData => ({ id, type, title, html });
const config = (provider: AiConfig["provider"], extra: Partial<AiConfig> = {}): AiConfig => ({ provider, key: "sk-test", model: "modele", url: "", ...extra });

describe("services", () => {
  it("cinq services, tous nommés ; les deux locaux n'ont pas besoin de clé", () => {
    expect(AI_PROVIDERS).toEqual(["anthropic", "openai", "openrouter", "ollama", "lmstudio"]);
    for (const p of AI_PROVIDERS) expect(fr.ai.providers[p] && en.ai.providers[p]).toBeTruthy();
    expect(AI_PROVIDERS.filter((p) => PROVIDERS[p].local)).toEqual(["ollama", "lmstudio"]);
    expect(isReady(config("ollama", { key: "" }))).toBe(true);
    expect(isReady(config("openai", { key: " " }))).toBe(false);
    expect(isReady(config("anthropic", { model: "" }))).toBe(false);
    expect(isReady(null)).toBe(false);
  });

  it("Claude : API Messages, clé dans x-api-key, consigne à part", () => {
    const req = chatRequest(config("anthropic"), "Consigne", "Texte", 200);
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers).toMatchObject({ "x-api-key": "sk-test", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
    expect(JSON.parse(req.body!)).toEqual({ model: "modele", max_tokens: 200, system: "Consigne", messages: [{ role: "user", content: "Texte" }] });
  });

  it("OpenAI et OpenRouter : complétions de conversation, clé en Bearer", () => {
    const openai = chatRequest(config("openai"), "Consigne", "Texte");
    expect(openai.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(openai.headers.authorization).toBe("Bearer sk-test");
    expect(JSON.parse(openai.body!)).toEqual({ model: "modele", stream: false, messages: [{ role: "system", content: "Consigne" }, { role: "user", content: "Texte" }] });
    const router = chatRequest(config("openrouter"), "c", "t");
    expect(router.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(router.headers).toMatchObject({ authorization: "Bearer sk-test", "x-title": "MondoWrite" });
  });

  it("Ollama et LM Studio : serveur local, sans clé, adresse modifiable", () => {
    // Ollama : API native, pour une fenêtre de contexte assez grande et une réponse JSON garantie.
    const ollama = chatRequest(config("ollama"), "c", "t", { json: true });
    expect(ollama.url).toBe("http://localhost:11434/api/chat");
    expect(ollama.headers).not.toHaveProperty("authorization");
    expect(JSON.parse(ollama.body!)).toMatchObject({ stream: false, format: "json", options: { num_ctx: OLLAMA_CONTEXT } });
    expect(JSON.parse(chatRequest(config("ollama"), "c", "t").body!)).not.toHaveProperty("format");
    expect(chatRequest(config("lmstudio"), "c", "t").url).toBe("http://localhost:1234/v1/chat/completions");
    expect(chatRequest(config("lmstudio", { url: "http://127.0.0.1:5000/" }), "c", "t").url).toBe("http://127.0.0.1:5000/v1/chat/completions");
    // Une adresse saisie ne détourne jamais un service en ligne (la clé partirait ailleurs).
    expect(chatRequest(config("openai", { url: "http://pirate.example" }), "c", "t").url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("lecture des réponses, quelle que soit leur forme", () => {
    expect(readReply("anthropic", { content: [{ type: "text", text: " Bonjour " }, { type: "tool_use" }, { type: "text", text: "!" }] })).toBe("Bonjour !");
    expect(readReply("openai", { choices: [{ message: { content: " Salut " } }] })).toBe("Salut");
    expect(readReply("ollama", { choices: [] })).toBe("");
    expect(readReply("ollama", { message: { role: "assistant", content: " Oui " } })).toBe("Oui");
    // Le raisonnement des modèles locaux (<think>) n'est jamais pris pour la réponse.
    expect(readReply("lmstudio", { choices: [{ message: { content: "<think>Une question ? [1]</think>\n{\"items\": []}" } }] })).toBe('{"items": []}');
    expect(stripThinking("raisonnement…</think>Réponse")).toBe("Réponse");
    expect(stripThinking("<think>coupé en plein milieu")).toBe("");
    expect(readReply("anthropic", null)).toBe("");
    expect(readReply("openai", { choices: [{ message: { content: [{ type: "text" }] } }] })).toBe("");
  });

  it("liste des modèles", () => {
    expect(modelsRequest(config("ollama"))).toMatchObject({ url: "http://localhost:11434/v1/models", method: "GET" });
    expect(modelsRequest(config("anthropic")).headers["x-api-key"]).toBe("sk-test");
    expect(readModels({ data: [{ id: "mistral" }, { id: "llama3" }, { id: 3 }, {}] })).toEqual(["llama3", "mistral"]);
    expect(readModels({ models: [] })).toEqual([]);
  });

  it("erreurs traduites en causes compréhensibles, toutes expliquées dans les deux langues", () => {
    expect([401, 403, 404, 400, 429, 402, 500].map(errorCode)).toEqual(["auth", "auth", "model", "model", "limit", "limit", "other"]);
    for (const code of ["network", "auth", "model", "limit", "empty", "other"] as const) expect(fr.ai.errors[code] && en.ai.errors[code]).toBeTruthy();
  });
});

describe("appels", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("complétion : la requête part vers le service, le texte revient", async () => {
    const fetchMock = answer(200, { choices: [{ message: { content: "Une question ?" } }] });
    vi.stubGlobal("fetch", fetchMock);
    expect(await complete(config("lmstudio"), "c", "t")).toBe("Une question ?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:1234/v1/chat/completions");
    expect(init.method).toBe("POST");
  });

  it("clé refusée, serveur éteint, réponse vide", async () => {
    vi.stubGlobal("fetch", answer(401, { error: "bad key" }));
    await expect(complete(config("openai"), "c", "t")).rejects.toMatchObject({ code: "auth" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(complete(config("ollama"), "c", "t")).rejects.toMatchObject({ code: "network" });
    await expect(listModels(config("ollama"))).rejects.toBeInstanceOf(AiError);
    vi.stubGlobal("fetch", answer(200, { choices: [{ message: { content: "  " } }] }));
    await expect(complete(config("openai"), "c", "t")).rejects.toMatchObject({ code: "empty" });
  });

  it("modèles du service", async () => {
    vi.stubGlobal("fetch", answer(200, { data: [{ id: "b" }, { id: "a" }] }));
    expect(await listModels(config("openrouter"))).toEqual(["a", "b"]);
  });
});

describe("réglages de l'IA", () => {
  it("désactivée par défaut ; chaque service garde sa clé, son modèle et son adresse", () => {
    expect(aiConfig({ provider: null, keys: {}, models: {}, urls: {} })).toBeNull();
    const ai = { provider: "anthropic" as const, keys: { anthropic: "sk-a", openai: "sk-o" }, models: { openai: "gpt" }, urls: { ollama: "http://127.0.0.1:9" } };
    expect(aiConfig(ai)).toEqual({ provider: "anthropic", key: "sk-a", model: PROVIDERS.anthropic.model, url: "" });
    expect(aiConfig({ ...ai, provider: "openai" })).toEqual({ provider: "openai", key: "sk-o", model: "gpt", url: "" });
    expect(aiConfig({ ...ai, provider: "ollama" })).toEqual({ provider: "ollama", key: "", model: "", url: "http://127.0.0.1:9" });
  });
});

describe("relecture des réponses", () => {
  it("JSON entouré de texte ou de balises de code", () => {
    expect(extractJson('Voici :\n```json\n[{"id":"a"}]\n```\nVoilà.')).toEqual([{ id: "a" }]);
    expect(extractJson('{"suggestions":[{"id":"a"}]} fin]')).toEqual({ suggestions: [{ id: "a" }] });
    expect(extractJson("Rien à signaler.")).toBeNull();
    expect(extractJson("[oups")).toBeNull();
  });
});

describe("Ranger", () => {
  const cards = [card("i1", "idee", "Inès Morvan", "<p>Gardienne remplaçante.</p>"), card("i2", "idee", "", "<p>Un phare sur un îlot.</p>"), card("i3", "idee", "", ""), card("p1", "personnage", "Yann")];

  it("ne regarde que les idées en vrac qui ont un contenu ; la consigne interdit de réécrire", () => {
    expect(tidyCandidates(cards).map((c) => c.id)).toEqual(["i1", "i2"]);
    const prompt = tidyPrompt(cards, "fr", "roman");
    expect(JSON.parse(prompt.user)).toEqual([{ id: "i1", title: "Inès Morvan", text: "Gardienne remplaçante." }, { id: "i2", title: "", text: "Un phare sur un îlot." }]);
    expect(prompt.system).toMatch(/Never rewrite/);
    expect(prompt.system).toContain("français");
    expect(tidyPrompt(cards, "en", "scenario").system).toMatch(/screenplay[\s\S]*English/);
  });

  it("propositions gardées : carte connue, type valable, une fois par carte", () => {
    const reply = JSON.stringify([
      { id: "i1", type: "personnage", reason: "C'est quelqu'un." },
      { id: "i1", type: "lieu", reason: "doublon" },
      { id: "i2", type: "lieu" },
      { id: "p1", type: "theme", reason: "déjà typée" },
      { id: "zz", type: "scene", reason: "inconnue" },
      { id: "i2", type: "dragon", reason: "type inventé" },
      "n'importe quoi",
    ]);
    expect(parseTidy(reply, cards)).toEqual([{ id: "i1", type: "personnage", reason: "C'est quelqu'un." }, { id: "i2", type: "lieu", reason: "" }]);
    expect(parseTidy("Je ne sais pas.", cards)).toEqual([]);
    expect(parseTidy('{"suggestions":[{"id":"i2","type":"idee"}]}', cards)).toEqual([]);
    // Un type qui porte un fichier ou une adresse n'est jamais proposé : la carte n'aurait ni l'un ni l'autre.
    for (const type of ["image", "lien", "document"]) expect(parseTidy(JSON.stringify([{ id: "i2", type }]), cards)).toEqual([]);
  });
});

describe("interview", () => {
  const ines = card("p1", "personnage", "Inès Morvan", "<p>Gardienne remplaçante.</p>");
  const cards = [ines, card("l1", "lieu", "Phare", "<p>Îlot.</p>"), card("p2", "personnage", "Yann")];

  it("la consigne demande une seule question et interdit d'y répondre", () => {
    const prompt = interviewPrompt(ines, cards, [{ source: "p1", target: "l1", label: "y travaille" }], "fr", ["Déjà posée ?"]);
    expect(prompt.system).toMatch(/ONE open question/);
    expect(prompt.system).toMatch(/Do not answer it/);
    const sent = JSON.parse(prompt.user);
    expect(sent.character).toMatchObject({ title: "Inès Morvan", text: "Gardienne remplaçante." });
    expect(sent.related).toEqual([{ id: "l1", type: "lieu", title: "Phare", text: "Îlot.", link: "y travaille" }]);
    expect(sent.alreadyAsked).toEqual(["Déjà posée ?"]);
  });

  it("la question est débarrassée de ce qui l'entoure", () => {
    expect(parseQuestion('Voici ma question :\n\n« Que fuit-elle en venant ici ? »')).toBe("Que fuit-elle en venant ici ?");
    expect(parseQuestion("1. Question : Pourquoi le phare ?\nParce que…")).toBe("Pourquoi le phare ?");
    expect(parseQuestion('"What is she running from?"')).toBe("What is she running from?");
    expect(parseQuestion("  ")).toBe("");
  });
});

describe("cohérence", () => {
  const cards = [card("p1", "personnage", "Inès", "<p>Elle a 34 ans.</p>"), card("s1", "scene", "Arrivée", "<p>Inès, 41 ans, débarque.</p>"), card("i1", "idee", "", "")];

  it("la consigne demande des contradictions réelles, sous forme de questions, sans correction", () => {
    const prompt = coherencePrompt(cards, [{ source: "p1", target: "s1", label: "" }, { source: "p1", target: "i1", label: "" }], "fr");
    expect(prompt.system).toMatch(/Do not propose fixes/);
    const sent = JSON.parse(prompt.user);
    expect(sent.cards.map((c: { id: string }) => c.id)).toEqual(["p1", "s1"]);
    expect(sent.links).toEqual([{ source: "p1", target: "s1", label: "" }]);
  });

  it("alertes gardées : au moins une carte connue et une question", () => {
    const reply = '```json\n[{"cards":["p1","s1","zz","p1"],"question":"Inès a-t-elle 34 ou 41 ans ?"},{"cards":["zz"],"question":"?"},{"cards":["p1"],"question":""}]\n```';
    expect(parseCoherence(reply, cards)).toEqual([{ cards: ["p1", "s1"], question: "Inès a-t-elle 34 ou 41 ans ?" }]);
    expect(parseCoherence("[]", cards)).toEqual([]);
  });

  it("carte donnée par son titre (malgré la consigne) : reconnue", () => {
    const reply = JSON.stringify({ items: [{ cards: ["Inès (personnage)", "arrivée"], question: "Inès a-t-elle 34 ou 41 ans ?" }, { cards: [], question: "Quel âge a Inès ?" }, { cards: ["Personne"], question: "Rien ?" }] });
    expect(parseCoherence(reply, cards)).toEqual([
      { cards: ["p1", "s1"], question: "Inès a-t-elle 34 ou 41 ans ?" },
      { cards: ["p1"], question: "Quel âge a Inès ?" },
    ]);
  });

  it("le texte d'une scène (manuscrit, scénario) est lu, et la bible passe avant les images", () => {
    const scene = card("s2", "scene", "Retour", "");
    const image = card("im", "image", "Photo", "<p>Un phare.</p>");
    const sent = JSON.parse(coherencePrompt([image, scene, ...cards], [], "fr", { s2: "Inès, 41 ans, revient au phare." }).user);
    expect(sent.cards.map((c: { id: string }) => c.id)).toEqual(["p1", "s2", "s1", "im"]);
    expect(sent.cards[1].text).toBe("Inès, 41 ans, revient au phare.");
  });

  it("un gros projet reste dans la fenêtre de contexte", () => {
    const many = Array.from({ length: 200 }, (_, i) => card(`c${i}`, "personnage", `Perso ${i}`, `<p>${"x".repeat(450)}</p>`));
    const prompt = coherencePrompt(many, [], "fr");
    expect(prompt.user.length).toBeLessThan(32_000);
    expect(JSON.parse(prompt.user).cards.length).toBeGreaterThan(40);
  });
});

describe("cartes nommées, jamais par leur identifiant", () => {
  const cards = [card("k3x9a7bq2m", "personnage", "Inès Morvan", ""), card("p4t8w2zq1c", "lieu", "Le phare", ""), card("i1aaaaaaaa", "idee", "", "<p>un vieux port</p>")];
  const names = { type: (t: string) => ({ personnage: "personnage", lieu: "lieu", idee: "idée" })[t] ?? t, untitled: "Sans titre" };

  it("chaque identifiant connu devient « Titre (type) », avec ce qui l'entoure", () => {
    expect(nameCards("Pourquoi k3x9a7bq2m quitte-t-elle p4t8w2zq1c ?", cards, names)).toBe("Pourquoi Inès Morvan (personnage) quitte-t-elle Le phare (lieu) ?");
    expect(nameCards('La carte "k3x9a7bq2m" et [p4t8w2zq1c], `i1aaaaaaaa`', cards, names)).toBe("La carte Inès Morvan (personnage) et Le phare (lieu), Sans titre (idée)");
    expect(nameCards("Inès Morvan (k3x9a7bq2m) a-t-elle 34 ans (id: k3x9a7bq2m) ?", cards, names)).toBe("Inès Morvan (personnage) a-t-elle 34 ans Inès Morvan (personnage) ?");
    expect(nameCards("Rien à changer, ID inconnu zz12345678.", cards, names)).toBe("Rien à changer, ID inconnu zz12345678.");
    expect(nameCards("(voir k3x9a7bq2m)", cards, names)).toBe("(voir Inès Morvan (personnage))");
  });

  it("la relecture des réponses s'en charge, et les consignes l'interdisent", () => {
    const reply = JSON.stringify({ items: [{ cards: ["k3x9a7bq2m"], question: "k3x9a7bq2m a-t-elle 34 ou 41 ans ?" }] });
    expect(parseCoherence(reply, cards, names)[0].question).toBe("Inès Morvan (personnage) a-t-elle 34 ou 41 ans ?");
    expect(parseQuestion("Que cache k3x9a7bq2m à p4t8w2zq1c ?", cards, names)).toBe("Que cache Inès Morvan (personnage) à Le phare (lieu) ?");
    expect(parseTidy(JSON.stringify([{ id: "i1aaaaaaaa", type: "lieu", reason: "Comme p4t8w2zq1c." }]), cards, names)[0].reason).toBe("Comme Le phare (lieu).");
    expect(coherencePrompt(cards, [], "fr").system).toMatch(/never mention a card id/);
    expect(tidyPrompt(cards, "en", "roman").system).toMatch(/never mention a card id/);
  });
});

describe("alerte gardée pour plus tard", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
  });

  it("une carte Question reliée aux cartes concernées, en une seule étape", () => {
    const a = state().addTitledCard("personnage", "Inès");
    const b = state().addTitledCard("scene", "Arrivée");
    const id = state().addQuestionAbout(" Inès a-t-elle 34 ou 41 ans ? ", [a, b, a, "inconnue"]);
    expect(state().nodes.find((n) => n.id === id)!.data).toMatchObject({ type: "question", title: "Inès a-t-elle 34 ou 41 ans ?" });
    expect(state().edges.map((e) => [e.source, e.target])).toEqual([[id, a], [id, b]]);
    state().undo();
    expect(state().nodes).toHaveLength(2);
    expect(state().edges).toHaveLength(0);
  });
});

describe("message d'erreur du service", () => {
  it("la raison donnée par le service est montrée", () => {
    expect(serviceReason(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }))).toMatch(/credit balance/);
    expect(serviceReason(JSON.stringify({ error: "model not found" }))).toBe("model not found");
    expect(serviceReason("<html>")).toBe("");
    const err = new AiErr("model");
    err.reason = "max_tokens: too big";
    const errors = { network: "N", auth: "A", model: "M", limit: "L", empty: "E", other: "O" };
    expect(aiErrorText(err, errors)).toBe("M (max_tokens: too big)");
    expect(aiErrorText(new Error("x"), errors)).toBe("O");
  });
});
