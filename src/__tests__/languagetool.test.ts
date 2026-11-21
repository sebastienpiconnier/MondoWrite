// LanguageTool : réglages, requêtes, lecture des réponses, texte du document et retour des positions, suivi des
// remarques à travers les modifications.

import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { checkBody, checkText, checkUrl, chunks, kindOf, LtError, ltCanBulk, ltLeavesDevice, ltLive, ltMissing, parseMatches, readLt, type LtSettings } from "../languagetool/api";
import { collectRanges, collectText, toRange, touchedBlocks } from "../languagetool/textMap";
import { firstFrom, mapIssues, neighbour, reduceForTest, type LtIssue } from "../languagetool/extension";
import { readSecrets, writeSecrets, mergeSecrets } from "../secrets";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    character: { group: "block", content: "inline*" },
    mark: { group: "block", atom: true },
    text: { group: "inline" },
    hardBreak: { group: "inline", inline: true },
    footnote: { group: "inline", inline: true, atom: true },
  },
});
const p = (...content: Parameters<typeof schema.text>[0][]) => schema.node("paragraph", null, content.map((c) => schema.text(c)));

const premium: LtSettings = { server: "premium", username: "eddy@example.com", key: "abc", url: "", live: false };

describe("réglages LanguageTool", () => {
  it("lit prudemment et reste coupé par défaut", () => {
    expect(readLt(undefined).server).toBe("off");
    expect(readLt({ server: "bidon" }).server).toBe("off");
    expect(readLt({ server: "premium", username: " a@b.c ", key: 3 })).toEqual({ server: "premium", username: "a@b.c", key: "", url: "", live: false });
  });
  it("dit ce qui manque", () => {
    expect(ltMissing(readLt({}))).toBe("off");
    expect(ltMissing({ ...premium, key: "" })).toBe("account");
    expect(ltMissing(premium)).toBeNull();
    expect(ltMissing({ ...premium, server: "custom", url: "localhost" })).toBe("url");
    expect(ltMissing({ ...premium, server: "custom", url: "http://localhost:8081" })).toBeNull();
    expect(ltMissing({ ...premium, server: "public" })).toBeNull();
  });
  it("sait si le texte quitte l'ordinateur", () => {
    expect(ltLeavesDevice({ ...premium, server: "public" })).toBe(true);
    expect(ltLeavesDevice(premium)).toBe(true);
    expect(ltLeavesDevice({ ...premium, server: "custom", url: "http://localhost:8081" })).toBe(false);
    expect(ltLeavesDevice({ ...premium, server: "custom", url: "http://127.0.0.1:8081/v2" })).toBe(false);
    expect(ltLeavesDevice({ ...premium, server: "custom", url: "https://lt.example.com" })).toBe(true);
  });
  it("la clé Premium va dans le trousseau avec les autres", () => {
    const s = { ai: { anthropic: "k" }, photos: { pixabay: "", unsplash: "" }, languagetool: "lt-key" };
    expect(readSecrets(writeSecrets(s))).toEqual(s);
    // Sans clé LanguageTool, l'entrée garde sa forme d'avant.
    expect(writeSecrets({ ...s, languagetool: "" })).toBe(JSON.stringify({ ai: { anthropic: "k" }, photos: {} }));
    expect(mergeSecrets(s, { ai: {}, photos: { pixabay: "", unsplash: "" }, languagetool: "" }).languagetool).toBe("lt-key");
  });
});

describe("requête", () => {
  it("vise le bon service", () => {
    expect(checkUrl({ ...premium, server: "public" })).toBe("https://api.languagetool.org/v2/check");
    expect(checkUrl(premium)).toBe("https://api.languagetoolplus.com/v2/check");
    expect(checkUrl({ ...premium, server: "custom", url: "http://localhost:8081/" })).toBe("http://localhost:8081/v2/check");
    expect(checkUrl({ ...premium, server: "custom", url: "http://localhost:8081/v2" })).toBe("http://localhost:8081/v2/check");
    expect(checkUrl({ ...premium, server: "custom", url: "http://localhost:8081/v2/check" })).toBe("http://localhost:8081/v2/check");
  });
  it("envoie identifiant et clé seulement au compte Premium", () => {
    const b = checkBody(premium, "Texte", "fr");
    expect(b.get("username")).toBe("eddy@example.com");
    expect(b.get("apiKey")).toBe("abc");
    expect(b.get("language")).toBe("fr");
    expect(checkBody({ ...premium, server: "public" }, "Texte", "auto").get("apiKey")).toBeNull();
    // Seulement des langues à variantes : « fr » seul fait refuser la requête par LanguageTool.
    const variants = checkBody({ ...premium, server: "public" }, "Texte", "auto").get("preferredVariants")!.split(",");
    for (const v of variants) expect(v).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    expect(checkBody(premium, "Texte", "fr").get("preferredVariants")).toBeNull();
  });
  it("coupe un long texte entre deux paragraphes, sans rien perdre", () => {
    const text = `${"a".repeat(60)}\n\n${"b".repeat(60)}\n\n${"c".repeat(30)}`;
    const parts = chunks(text, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((x) => x.text).join("")).toBe(text);
    for (const part of parts) expect(text.slice(part.offset, part.offset + part.text.length)).toBe(part.text);
    expect(chunks("court", 100)).toEqual([{ offset: 0, text: "court" }]);
    expect(chunks("x".repeat(250), 100).map((x) => x.text.length)).toEqual([100, 100, 50]);
  });
  it("lit les remarques et leur famille", () => {
    const json = {
      matches: [
        { message: "Faute probable.", offset: 3, length: 5, replacements: [{ value: "allé" }, { value: "aller" }], rule: { id: "R1", issueType: "misspelling", category: { id: "TYPOS" } } },
        { message: "", shortMessage: "Style", offset: 10, length: 2, replacements: [], rule: { id: "R2", issueType: "style", category: { id: "STYLE" } } },
        { offset: 1, length: 0 },
        "rien",
      ],
    };
    const m = parseMatches(json, 100);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ offset: 103, length: 5, message: "Faute probable.", replacements: ["allé", "aller"], kind: "spelling", rule: "R1" });
    expect(m[1].message).toBe("Style");
    expect(m[1].kind).toBe("style");
    expect(kindOf("grammar", "GRAMMAR")).toBe("grammar");
    expect(parseMatches(null)).toEqual([]);
  });
  it("interroge morceau par morceau et rend les positions du texte entier", async () => {
    const calls: string[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      calls.push(body.get("text")!);
      const i = body.get("text")!.indexOf("fote");
      return new Response(JSON.stringify({ matches: i < 0 ? [] : [{ message: "m", offset: i, length: 4, replacements: [{ value: "faute" }], rule: { issueType: "misspelling" } }] }), { status: 200 });
    }) as typeof fetch;
    const text = `${"Un. ".repeat(4000)}\n\nUne fote ici.`;
    const out = await checkText({ ...premium, server: "public" }, text, "fr", undefined, fake);
    expect(calls.length).toBeGreaterThan(1);
    expect(out).toHaveLength(1);
    expect(text.slice(out[0].offset, out[0].offset + out[0].length)).toBe("fote");
  });
  it("traduit les refus en erreurs claires", async () => {
    const answer = (status: number) => (async () => new Response("{}", { status })) as typeof fetch;
    await expect(checkText(premium, "Texte", "fr", undefined, answer(403))).rejects.toMatchObject({ code: "auth" });
    await expect(checkText(premium, "Texte", "fr", undefined, answer(429))).rejects.toMatchObject({ code: "limit" });
    await expect(checkText(premium, "Texte", "fr", undefined, answer(500))).rejects.toMatchObject({ code: "server" });
    const refused = (async () => new Response("Error: Invalid request\nmore", { status: 400 })) as typeof fetch;
    await expect(checkText(premium, "Texte", "fr", undefined, refused)).rejects.toMatchObject({ code: "server", detail: "400 : Error: Invalid request more" });
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(checkText(premium, "Texte", "fr", undefined, down)).rejects.toBeInstanceOf(LtError);
    expect(await checkText(premium, "   ", "fr", undefined, down)).toEqual([]);
  });
});

describe("texte du document", () => {
  const doc = schema.node("doc", null, [
    schema.node("mark"),
    p("Je suis ", "aller"),
    schema.node("paragraph", null, [schema.text("Une note"), schema.node("footnote"), schema.text(" ici"), schema.node("hardBreak"), schema.text("suite")]),
    schema.node("character", null, [schema.text("PAUL")]),
    p("Fin."),
  ]);

  it("met une ligne vide entre les paragraphes et retrouve les positions", () => {
    const mapped = collectText(doc, 0, doc.content.size);
    expect(mapped.text).toBe("Je suis aller\n\nUne note ici\nsuite\n\nPAUL\n\nFin.");
    for (const word of ["aller", "note ici", "suite", "PAUL", "Fin."]) {
      const at = mapped.text.indexOf(word);
      const r = toRange(mapped, at, word.length)!;
      expect(doc.textBetween(r.from, r.to, "\n", "")).toBe(word.replace("\n", ""));
    }
  });
  it("écarte les blocs refusés (scénario)", () => {
    const mapped = collectText(doc, 0, doc.content.size, (b) => b.type.name !== "character");
    expect(mapped.text).not.toContain("PAUL");
    const r = toRange(mapped, mapped.text.indexOf("Fin"), 3)!;
    expect(doc.textBetween(r.from, r.to)).toBe("Fin");
  });
  it("ne lit que la partie demandée", () => {
    const start = doc.child(0).nodeSize;
    const mapped = collectText(doc, start, start + doc.child(1).nodeSize);
    expect(mapped.text).toBe("Je suis aller");
    expect(toRange(mapped, 50, 2)).toBeNull();
  });
});

describe("suivi des remarques", () => {
  const issue = (id: string, from: number, to: number, original: string): LtIssue => ({ id, from, to, original, message: "", replacements: [], kind: "spelling", rule: "" });

  it("suit le texte et retire une remarque dont le passage change", () => {
    const state = EditorState.create({ schema, doc: schema.node("doc", null, [p("Je suis aller au port")]) });
    const issues = [issue("a", 9, 14, "aller"), issue("b", 18, 22, "port")];
    // Un mot tapé devant : les deux remarques se déplacent.
    const tr1 = state.tr.insertText("bien ", 1);
    const moved = mapIssues(issues, tr1);
    expect(moved.map((i) => tr1.doc.textBetween(i.from, i.to))).toEqual(["aller", "port"]);
    // « aller » corrigé : sa remarque disparaît, l'autre reste.
    const tr2 = state.tr.insertText("allé", 9, 14);
    expect(mapIssues(issues, tr2).map((i) => i.id)).toEqual(["b"]);
  });
  it("passe d'une remarque à l'autre, en boucle", () => {
    const list = [issue("a", 1, 2, "x"), issue("b", 5, 6, "y"), issue("c", 9, 10, "z")];
    expect(neighbour(list, "a", 1)?.id).toBe("b");
    expect(neighbour(list, "c", 1)?.id).toBe("a");
    expect(neighbour(list, "a", -1)?.id).toBe("c");
    expect(neighbour(list, null, 1)?.id).toBe("a");
    expect(neighbour([], "a", 1)).toBeNull();
    expect(firstFrom(list, 4)?.id).toBe("b");
    expect(firstFrom(list, 50)?.id).toBe("a");
  });
});

describe("vérifications automatiques (Premium, serveur personnel)", () => {
  it("jamais avec l'API publique", () => {
    expect(ltCanBulk({ ...premium, server: "public" })).toBe(false);
    expect(ltCanBulk(premium)).toBe(true);
    expect(ltCanBulk({ ...premium, key: "" })).toBe(false);
    expect(ltCanBulk({ ...premium, server: "custom", url: "http://localhost:8081" })).toBe(true);
    expect(ltLive({ ...premium, live: true })).toBe(true);
    expect(ltLive({ ...premium, server: "public", live: true })).toBe(false);
    expect(ltLive(premium)).toBe(false);
    expect(readLt({ server: "premium", live: true }).live).toBe(true);
  });
  it("tout le livre : morceaux espacés, avancement annoncé", async () => {
    const progress: string[] = [];
    const times: number[] = [];
    const fake = (async () => {
      times.push(Date.now());
      return new Response(JSON.stringify({ matches: [] }), { status: 200 });
    }) as typeof fetch;
    const text = `${"a".repeat(30_000)}\n\n${"b".repeat(30_000)}`;
    await checkText(premium, text, "fr", undefined, fake, { pauseMs: 50, onProgress: (n, total) => progress.push(`${n}/${total}`) });
    expect(progress).toEqual(["1/2", "2/2"]);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(45);
  });
  it("plusieurs paragraphes à la suite, positions retrouvées", () => {
    const doc = schema.node("doc", null, [p("Un aller."), p("Rien."), p("Deux aller.")]);
    const first = { from: 0, to: doc.child(0).nodeSize };
    const third = { from: doc.content.size - doc.child(2).nodeSize, to: doc.content.size };
    const mapped = collectRanges(doc, [third, first]);
    expect(mapped.text).toBe("Un aller.\n\nDeux aller.");
    const at = mapped.text.lastIndexOf("aller");
    const r = toRange(mapped, at, 5)!;
    expect(r.from).toBeGreaterThan(third.from);
    expect(doc.textBetween(r.from, r.to)).toBe("aller");
  });
  it("les paragraphes touchés par une frappe", () => {
    const state = EditorState.create({ schema, doc: schema.node("doc", null, [p("Un."), p("Deux."), p("Trois.")]) });
    const second = state.doc.child(0).nodeSize;
    const tr = state.tr.insertText("x", second + 2);
    expect(touchedBlocks(tr)).toEqual([second]);
    // Un Entrée en fin de paragraphe ne change pas son texte : seul le nouveau paragraphe (vide) est relevé.
    const split = state.tr.split(second + 1 + "Deux.".length);
    expect(touchedBlocks(split).map((pos) => split.doc.nodeAt(pos)!.textContent)).toEqual([""]);
    // Coupé au milieu : les deux moitiés sont à relire.
    expect(touchedBlocks(state.tr.split(second + 3)).length).toBe(2);
    // Une lettre effacée en fin de paragraphe : il est à relire.
    const del = state.tr.delete(second + 5, second + 6);
    expect(touchedBlocks(del)).toEqual([second]);
  });
  it("remplace seulement les remarques des parties relues", () => {
    const issue = (id: string, from: number, to: number): LtIssue => ({ id, from, to, original: "", message: "", replacements: [], kind: "grammar", rule: "" });
    const state = { issues: [issue("a", 1, 3), issue("b", 10, 12), issue("c", 20, 22)], active: "c", focus: 0 };
    const next = reduceForTest(state, { within: [{ from: 9, to: 15 }], add: [issue("d", 11, 13)] });
    expect(next.issues.map((i) => i.id)).toEqual(["a", "d", "c"]);
    expect(next.active).toBe("c");
    expect(next.focus).toBe(0);
    const gone = reduceForTest(state, { within: [{ from: 19, to: 30 }], add: [] });
    expect(gone.active).toBeNull();
  });
});
