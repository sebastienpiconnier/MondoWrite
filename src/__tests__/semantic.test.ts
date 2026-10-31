import { describe, expect, it } from "vitest";
import {
  canEmbed,
  cardChunks,
  cosine,
  embedRequest,
  excerptOf,
  groupParagraphs,
  hashText,
  isEmbedModel,
  manuscriptChunks,
  missingHashes,
  needleOf,
  paragraphsOf,
  prefixes,
  proposeEmbedModel,
  rankChunks,
  readEmbeddings,
  screenplayChunks,
  SemanticIndex,
  CHUNK_MAX,
} from "../ai/semantic";
import type { AiConfig } from "../ai/providers";
import type { CardData } from "../types";
import type { ScreenplayElement } from "../screenplay/model";

const ollama: AiConfig = { provider: "ollama", key: "", model: "llama3", url: "" };
const lmstudio: AiConfig = { provider: "lmstudio", key: "jeton", model: "qwen", url: "http://localhost:1234/v1/" };
const card = (id: string, title: string, html = "", extra: Partial<CardData> = {}): CardData => ({ id, type: "idee", title, html, ...extra });

describe("recherche par le sens : service", () => {
  it("n'est offerte qu'avec un service local", () => {
    expect(canEmbed("ollama")).toBe(true);
    expect(canEmbed("lmstudio")).toBe(true);
    expect(canEmbed("anthropic")).toBe(false);
    expect(canEmbed("openai")).toBe(false);
    expect(canEmbed("openrouter")).toBe(false);
    expect(canEmbed(null)).toBe(false);
  });

  it("propose un modèle qui dit « embed », et ne propose pas un modèle d'embedding pour converser", () => {
    expect(proposeEmbedModel(["llama3:8b", "nomic-embed-text:latest", "mxbai-embed-large"])).toBe("nomic-embed-text:latest");
    expect(proposeEmbedModel(["llama3:8b"])).toBe("");
    expect(isEmbedModel("nomic-embed-text")).toBe(true);
    expect(isEmbedModel("bge-m3")).toBe(true);
    expect(isEmbedModel("llama3:8b")).toBe(false);
  });

  it("préfixes des modèles qui en attendent", () => {
    expect(prefixes("nomic-embed-text")).toEqual({ query: "search_query: ", doc: "search_document: " });
    expect(prefixes("multilingual-e5-large")).toEqual({ query: "query: ", doc: "passage: " });
    expect(prefixes("mxbai-embed-large")).toEqual({ query: "", doc: "" });
  });

  it("Ollama : /api/embed ; LM Studio : /v1/embeddings avec le jeton Bearer, sans /v1 en double", () => {
    const o = embedRequest(ollama, "nomic-embed-text", ["a", "b"]);
    expect(o.url).toBe("http://localhost:11434/api/embed");
    expect(JSON.parse(o.body!)).toEqual({ model: "nomic-embed-text", input: ["a", "b"], truncate: true });
    expect(o.headers.authorization).toBeUndefined();
    const l = embedRequest(lmstudio, "text-embedding-nomic", ["a"]);
    expect(l.url).toBe("http://localhost:1234/v1/embeddings");
    expect(l.headers.authorization).toBe("Bearer jeton");
    expect(JSON.parse(l.body!)).toEqual({ model: "text-embedding-nomic", input: ["a"] });
  });
});

describe("recherche par le sens : réponses jamais crues sur parole", () => {
  it("lit Ollama et OpenAI (dans l'ordre des index)", () => {
    expect(readEmbeddings({ embeddings: [[1, 0], [0, 1]] }, 2)?.map((v) => [...v])).toEqual([[1, 0], [0, 1]]);
    const data = { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] };
    expect(readEmbeddings(data, 2)?.map((v) => [...v])).toEqual([[1, 0], [0, 1]]);
  });

  it("refuse un nombre de vecteurs faux, des tailles différentes, des valeurs qui ne sont pas des nombres", () => {
    expect(readEmbeddings({ embeddings: [[1, 0]] }, 2)).toBeNull();
    expect(readEmbeddings({ embeddings: [[1, 0], [1]] }, 2)).toBeNull();
    expect(readEmbeddings({ embeddings: [[1, "0"]] }, 1)).toBeNull();
    expect(readEmbeddings({ embeddings: [[1, NaN]] }, 1)).toBeNull();
    expect(readEmbeddings({ embeddings: [[]] }, 1)).toBeNull();
    expect(readEmbeddings({ message: "oups" }, 1)).toBeNull();
    expect(readEmbeddings(null, 1)).toBeNull();
  });
});

describe("recherche par le sens : cosinus et classement", () => {
  it("cosinus", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosine([1, 1], [2, 2])).toBeCloseTo(1);
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(cosine([1], [1, 0])).toBe(0);
  });

  it("classe par proximité, une carte une fois, écarte ce qui est loin du meilleur", () => {
    const chunks = [
      { key: "a", kind: "manuscript" as const, text: "a", hash: "ha", type: "scene" as const, label: "" },
      { key: "b", kind: "card" as const, text: "b", hash: "hb", cardId: "c1", type: "idee" as const, label: "" },
      { key: "b2", kind: "card" as const, text: "b2", hash: "hb2", cardId: "c1", type: "idee" as const, label: "" },
      { key: "far", kind: "card" as const, text: "far", hash: "hf", cardId: "c2", type: "idee" as const, label: "" },
      { key: "none", kind: "card" as const, text: "none", hash: "hn", cardId: "c3", type: "idee" as const, label: "" },
    ];
    const vectors = new Map<string, number[]>([
      ["ha", [0.9, 0.1]],
      ["hb", [1, 0]],
      ["hb2", [0.95, 0.05]],
      ["hf", [0.1, 1]],
    ]);
    const hits = rankChunks([1, 0], chunks, vectors);
    expect(hits.map((h) => h.chunk.key)).toEqual(["b", "a"]);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(rankChunks([1, 0], chunks, vectors, 1)).toHaveLength(1);
  });
});

describe("recherche par le sens : découpage", () => {
  it("paragraphes d'un HTML, regroupés jusqu'à la longueur visée, un long paragraphe coupé entre deux phrases", () => {
    expect(paragraphsOf("<p>Un.</p><p></p><p>Deux &amp; trois.</p>")).toEqual(["Un.", "Deux & trois."]);
    const short = groupParagraphs(["« Tu viens ? »", "« Non. »", "Elle partit."]);
    expect(short).toHaveLength(1);
    expect(short[0]).toMatchObject({ first: "« Tu viens ? »", at: 0 });
    const para = "Elle relut la lettre trois fois, sans comprendre qui avait pu la glisser sous la porte du phare pendant la tempête, ni pourquoi elle portait son nom, écrit à l’encre bleue d’une main qui tremblait.";
    expect(groupParagraphs([para + " Encore.", para + " Toujours."])).toHaveLength(2);
    expect(groupParagraphs(["« Non. »", para + " Encore."]).map((g) => g.at)).toEqual([0, 1]);
    const long = "Elle relut la lettre. ".repeat(150);
    const parts = groupParagraphs(["Avant.", long]);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((p) => p.text.length <= CHUNK_MAX + 1)).toBe(true);
    expect(parts[1].at).toBe(1);
  });

  it("manuscrit : un passage garde sa scène, le titre de la carte et un début de paragraphe", () => {
    const chunks = manuscriptChunks(["s1", "s2"], { s1: "<p>Inès trouva la lettre sous la porte du phare, pliée en quatre.</p>", s2: "" }, new Map([["s1", "La lettre"]]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ kind: "manuscript", cardId: "s1", target: "s1", label: "La lettre", type: "scene" });
    expect(chunks[0].needle).toBe("Inès trouva la lettre sous la porte du");
    expect(needleOf("Court.")).toBe("Court.");
  });

  it("scénario : blocs par scène, un nom reste avec sa réplique, le premier bloc mène à l'en-tête", () => {
    const els: ScreenplayElement[] = [
      { type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: "k1" },
      { type: "action", text: "Inès ouvre l'enveloppe." },
      { type: "character", text: "Inès" },
      { type: "dialogue", text: "Qui l'a glissée ici ?" },
      { type: "note", text: "à revoir" },
      { type: "sceneHeading", text: "EXT. QUAI - JOUR" },
      { type: "action", text: "Le bateau arrive." },
    ];
    const chunks = screenplayChunks(els);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ kind: "screenplay", cardId: "k1", label: "INT. PHARE - NUIT", target: "@0" });
    expect(chunks[0].text).toContain("INÈS :\nQui l'a glissée ici ?");
    expect(chunks[0].text).not.toContain("à revoir");
    expect(chunks[1]).toMatchObject({ target: "@5", label: "EXT. QUAI - JOUR" });
    expect(chunks[1].cardId).toBeUndefined();
  });

  it("cartes : titre, fiche écrite par l'auteur (pas les codes) et texte ; une carte vide n'a rien", () => {
    const chunks = cardChunks([
      card("p1", "Inès Morvan", "<p>Ne supporte pas le silence.</p>", { type: "personnage", fiche: { metier: "Gardienne de phare", principal: "oui", certitude: "etabli" } }),
      card("e", ""),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Inès Morvan\nGardienne de phare\nNe supporte pas le silence.");
    expect(chunks[0]).toMatchObject({ kind: "card", cardId: "p1", type: "personnage" });
  });

  it("empreinte : même texte, même empreinte ; seuls les passages nouveaux sont à calculer", () => {
    expect(hashText("la lettre")).toBe(hashText("la lettre"));
    expect(hashText("la lettre")).not.toBe(hashText("la lettrE"));
    const chunks = cardChunks([card("a", "Un"), card("b", "Deux"), card("c", "Un")]);
    const known = new Map([[chunks[1].hash, 1]]);
    expect(missingHashes(chunks, known).map((c) => c.key)).toEqual([chunks[0].key]);
  });

  it("extrait coupé à la fin d'un mot", () => {
    expect(excerptOf("court")).toBe("court");
    const e = excerptOf("mot ".repeat(80), 30);
    expect(e.endsWith("…")).toBe(true);
    expect(e.length).toBeLessThanOrEqual(31);
  });
});

describe("recherche par le sens : index de la session", () => {
  it("ne recalcule que ce qui a changé, oublie ce qui n'est plus là, s'arrête sur Annuler", async () => {
    const calls: string[][] = [];
    const realFetch = globalThis.fetch;
    // Vecteur fabriqué : la lettre « l » pèse sur un axe, le reste sur l'autre.
    const vec = (s: string) => [s.includes("lettre") ? 1 : 0, s.includes("lettre") ? 0 : 1];
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { input: string[] };
      calls.push(body.input);
      return new Response(JSON.stringify({ embeddings: body.input.map(vec) }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const index = new SemanticIndex("t");
      const chunks = cardChunks([card("a", "La lettre"), card("b", "Le phare")]);
      const progress: number[] = [];
      await index.update(ollama, "m", chunks, (done) => progress.push(done));
      expect(calls).toHaveLength(1);
      expect(progress).toEqual([0, 2]);
      await index.update(ollama, "m", chunks, () => {});
      expect(calls).toHaveLength(1);
      const changed = cardChunks([card("a", "La lettre"), card("b", "Le phare de nuit")]);
      await index.update(ollama, "m", changed, () => {});
      expect(calls[1]).toEqual(["Le phare de nuit"]);
      expect(index.vectors.size).toBe(2);
      const hits = await index.search(ollama, "m", "une lettre", changed);
      expect(hits[0].chunk.cardId).toBe("a");
      const ctl = new AbortController();
      ctl.abort();
      await expect(index.update(ollama, "m", cardChunks([card("z", "Neuf")]), () => {}, ctl.signal)).rejects.toMatchObject({ code: "cancelled" });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
