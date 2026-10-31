// @vitest-environment happy-dom
// Mode Atelier (1.8.0) : marque `ia` (HTML ↔ Markdown, nettoyage, éditeurs), journal ia-journal.md, réglage
// `aiMode` de cosmos.json, note [[ia]] du Fountain, « À faire » et Statistiques, lecteurs des réponses de l'IA,
// et actions du store (une action, une étape ; le journal hors historique).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { NO_FILTER } from "../canvasFilter";
import { cardToFile, fileToCard, htmlToMarkdown, markdownToHtml, sanitizeHtml } from "../storage/markdown";
import { JOURNAL_FILE, deserialize, isProjectFilePath, serialize } from "../storage";
import { KNOWN_META, fromProject, toProject } from "../projectState";
import {
  appendJournal,
  iaAfterPatch,
  iaPassagesIn,
  iaPercent,
  iaShareOfManuscript,
  iaShareOfScreenplay,
  iaWordsIn,
  isIaId,
  journalLine,
  journalStamp,
  readAiMode,
  readIaFields,
  unmarkIa,
  type JournalLabels,
} from "../atelier";
import { parse } from "../screenplay/parse";
import { serialize as toFountain } from "../screenplay/serialize";
import { fromDoc, toDoc } from "../screenplay/editor/convert";
import { setSceneSynopsis, synopsisIsIa } from "../screenplay/scenes";
import { typeset } from "../screenplay/export/typeset";
import { LAYOUTS } from "../screenplay/layout";
import { iaTodos, collectTodos } from "../todos";
import { pitchIaKeys, readPitch, setPitchField, setPitchFieldIa, withoutPitchIa } from "../pitch";
import { richTextExtensions } from "../components/editorKit";
import { MentionNode } from "../components/MentionNode";
import { SceneMark } from "../components/bookExtensions";
import { composeBook } from "../bookDoc";
import { mentionHtml } from "../mentions";
import { parseDirections, parsePitchDraft, parseSheetDraft, parseSynopsis, parseVariants, pitchDraftPrompt, sheetDraftPrompt, variantsPrompt } from "../ai/atelier";
import type { CardData, Project } from "../types";

const state = () => useCosmos.getState();
const card = (id: string) => state().nodes.find((n) => n.id === id)!.data;

const LABELS: JournalLabels = {
  header: "# Journal de l’IA\n\nUne ligne par proposition acceptée.",
  actions: { variants: "Variante", synopsis: "Synopsis", directions: "Piste", pitch: "Couverture", sheet: "Fiche", image: "Image" },
  words: "{n} mots",
  quoted: "« {title} »",
};

describe("marque ia : HTML, Markdown, nettoyage", () => {
  it("garde le <span data-ia> autour du Markdown, aller et retour", () => {
    const html = `<p>Il <span data-ia="ab12cd34ef">pleuvait <strong>fort</strong></span> ce soir-là.</p>`;
    const md = htmlToMarkdown(html);
    expect(md).toBe(`Il <span data-ia="ab12cd34ef">pleuvait **fort**</span> ce soir-là.`);
    const back = markdownToHtml(md);
    expect(back).toContain(`<span data-ia="ab12cd34ef">pleuvait <strong>fort</strong></span>`);
    expect(htmlToMarkdown(back)).toBe(md);
  });

  it("une mention dans un passage de l'IA reste une mention", () => {
    const html = `<p><span data-ia="ab12cd34ef">Voici ${mentionHtml("ines000001", "Inès")}.</span></p>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("[@Inès](cosmos:ines000001)");
    expect(markdownToHtml(md)).toContain(`data-mention="ines000001"`);
  });

  it("le nettoyage ne garde la marque qu'avec un identifiant sûr, et rien d'autre qu'elle", () => {
    expect(sanitizeHtml(`<p><span data-ia="ab12cd34" onclick="x()" class="y">a</span></p>`)).toBe(`<p><span data-ia="ab12cd34">a</span></p>`);
    expect(sanitizeHtml(`<p><span data-ia="a&quot; onx=&quot;">a</span></p>`)).toBe("<p>a</p>");
    expect(sanitizeHtml(`<p><span data-ia="x">a</span><span style="color:red">b</span></p>`)).toBe("<p>ab</p>");
    expect(isIaId("ab12cd34")).toBe(true);
    expect(isIaId("a b")).toBe(false);
    expect(isIaId("x")).toBe(false);
  });

  it("une marque vide ou invalide ne s'écrit pas", () => {
    expect(htmlToMarkdown(`<p>a<span data-ia="zz">b</span></p>`)).toBe("ab");
  });

  it("passages, mots et « Je l'ai repris » (unmarkIa)", () => {
    const html = `<p>A <span data-ia="aaaa1111">un deux</span> B</p><p><span data-ia="aaaa1111">trois</span> et <span data-ia="bbbb2222">quatre ${mentionHtml("ines000001", "Inès")}</span>.</p>`;
    expect(iaPassagesIn(html)).toEqual([
      { id: "aaaa1111", text: "un deux trois" },
      { id: "bbbb2222", text: "quatre @Inès" },
    ]);
    expect(iaWordsIn(html)).toBe(5);
    const one = unmarkIa(html, "bbbb2222");
    expect(one).toContain(`quatre ${mentionHtml("ines000001", "Inès")}.`);
    expect(one).toContain(`data-ia="aaaa1111"`);
    expect(unmarkIa(html)).not.toContain("data-ia");
    expect(unmarkIa(html)).toContain(mentionHtml("ines000001", "Inès"));
    expect(unmarkIa("<p>rien</p>")).toBe("<p>rien</p>");
  });
});

describe("marque ia dans les éditeurs", () => {
  let editor: Editor | null = null;
  afterEach(() => editor?.destroy());

  it("une carte garde la marque, et unsetIa la retire du passage entier", () => {
    editor = new Editor({ element: document.createElement("div"), extensions: [...richTextExtensions(), MentionNode], content: `<p>Avant <span data-ia="abcd1234">texte de l'IA</span> après.</p>` });
    expect(editor.getHTML()).toContain(`<span data-ia="abcd1234" class="ia-mark">texte de l'IA</span>`);
    // Curseur au milieu du passage : le passage entier perd sa marque.
    editor.commands.setTextSelection(12);
    editor.commands.unsetIa();
    expect(editor.getHTML()).not.toContain("data-ia");
    expect(editor.getHTML()).toContain("texte de l'IA");
  });

  it("la frappe juste après un passage n'est pas marquée", () => {
    editor = new Editor({ element: document.createElement("div"), extensions: [...richTextExtensions()], content: `<p><span data-ia="abcd1234">IA</span></p>` });
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("x");
    expect(editor.getHTML()).toContain(`IA</span>x`);
  });

  it("le livre (manuscrit) garde la marque d'une scène", () => {
    const blocks = [{ id: "s1scene000" }] as Parameters<typeof composeBook>[0];
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [...richTextExtensions({ link: false, prose: true }), MentionNode, SceneMark],
      content: composeBook(blocks, { s1scene000: `<p>La mer <span data-ia="abcd1234">grondait doucement</span>.</p>` }),
    });
    expect(editor.getHTML()).toContain(`data-ia="abcd1234"`);
  });
});

describe("champs proposés par l'IA (frontmatter `ia`)", () => {
  it("s'écrit et se relit, sans doublon ni clé suspecte", () => {
    const c: CardData = { id: "p1abcdefgh", type: "personnage", title: "Yann", html: "", fiche: { metier: "Pêcheur" }, ia: ["metier", "title"] };
    const file = cardToFile(c);
    expect(file).toContain(`ia: ["metier","title"]`);
    expect(fileToCard(file)?.ia).toEqual(["metier", "title"]);
    expect(readIaFields(["a", "a", "../x", 3, "b"])).toEqual(["a", "b"]);
    expect(readIaFields([])).toBeUndefined();
  });

  it("un champ retouché n'est plus « de l'IA »", () => {
    const before = { title: "Piste", fiche: { metier: "Pêcheur", age: "40" } };
    expect(iaAfterPatch(["title", "metier"], before, { title: "Piste reprise" })).toEqual(["metier"]);
    expect(iaAfterPatch(["metier", "age"], before, { fiche: { metier: "Marin", age: "40" } })).toEqual(["age"]);
    const same = ["metier"];
    expect(iaAfterPatch(same, before, { title: "Piste" })).toBe(same);
  });
});

describe("journal ia-journal.md", () => {
  const at = new Date(2026, 9, 31, 14, 5);
  it("une ligne : date et heure, action, titre, service et modèle, mots", () => {
    expect(journalStamp(at)).toBe("2026-10-31 14:05");
    expect(journalLine({ at, action: "variants", target: "Le phare\nde nuit", service: "anthropic", model: "claude-sonnet-5-5", words: 12 }, LABELS)).toBe(
      "- 2026-10-31 14:05 · Variante · « Le phare de nuit » · anthropic, claude-sonnet-5-5 · 12 mots",
    );
  });

  it("ajout seulement : l'en-tête une fois, rien de ce qui est écrit n'est retouché", () => {
    const first = appendJournal("", "- 1", LABELS.header);
    expect(first).toBe(`${LABELS.header}\n\n- 1\n`);
    const annotated = `${first}Note de l'auteur, sans retour final`;
    const second = appendJournal(annotated, "- 2", LABELS.header);
    expect(second.startsWith(annotated)).toBe(true);
    expect(second).toBe(`${annotated}\n- 2\n`);
  });

  it("fait partie du projet : écrit, relu, accepté dans un .zip", () => {
    const project: Project = { meta: { version: 1, title: "T", layout: [], links: [] }, cards: [], screenplay: null, journal: "# J\n\n- ligne\n" };
    const files = serialize(project);
    expect(files[JOURNAL_FILE]).toBe("# J\n\n- ligne\n");
    expect(deserialize(files)?.journal).toBe("# J\n\n- ligne\n");
    expect(serialize({ ...project, journal: "" })[JOURNAL_FILE]).toBeUndefined();
    expect(isProjectFilePath(JOURNAL_FILE)).toBe(true);
  });
});

describe("réglage aiMode dans cosmos.json", () => {
  const base: Project = { meta: { version: 1, title: "T", layout: [], links: [] }, cards: [], screenplay: null };
  it("absent = gardienne ; « atelier » écrit seulement s'il est actif", () => {
    expect(readAiMode(undefined)).toBe("gardienne");
    expect(readAiMode("autre")).toBe("gardienne");
    const read = fromProject({ ...base, meta: { ...base.meta, aiMode: "atelier" } });
    expect(read.aiMode).toBe("atelier");
    const slice = { ...read, screenplay: null, awaitingLayout: [] };
    expect(toProject(slice).meta.aiMode).toBe("atelier");
    expect("aiMode" in toProject({ ...slice, aiMode: "gardienne" }).meta).toBe(false);
    expect(KNOWN_META.has("aiMode")).toBe(true);
  });
});

describe("scénario : note [[ia]]", () => {
  const source = `INT. PHARE - NUIT [[cosmos:sc1abcdefg]]\n\n= Inès monte. [[ia]]\n\nLa lanterne tourne. [[ia]]\n\nINÈS\n(bas) [[ia]]\nTu entends ? [[ia]]\n`;
  it("se lit sur l'élément, hors du texte, et se réécrit à l'identique", () => {
    const sp = parse(source);
    const [, synopsis, action, , paren, dialogue] = sp.elements;
    expect(synopsis).toMatchObject({ type: "synopsis", text: "Inès monte.", ia: true });
    expect(action).toMatchObject({ type: "action", text: "La lanterne tourne.", ia: true });
    expect(paren).toMatchObject({ type: "parenthetical", text: "(bas)", ia: true });
    expect(dialogue).toMatchObject({ type: "dialogue", text: "Tu entends ?", ia: true });
    expect(toFountain(sp)).toBe(source);
  });

  it("passe par l'éditeur sans se perdre, et ne s'imprime pas", () => {
    const sp = parse(source);
    expect(fromDoc(toDoc(sp), sp.titlePage)).toEqual(sp);
    const printed = JSON.stringify(typeset(sp.elements, LAYOUTS.a4, "fr", { more: "(À SUIVRE)", contd: "(SUITE)" }));
    expect(printed).not.toContain("[[ia]]");
  });

  it("le synopsis retouché perd la note ; posé par l'IA, il la porte", () => {
    const sp = parse(source);
    expect(synopsisIsIa(sp.elements, 0)).toBe(true);
    const retouched = setSceneSynopsis(sp.elements, 0, "Inès grimpe.");
    expect(synopsisIsIa(retouched, 0)).toBe(false);
    expect(synopsisIsIa(setSceneSynopsis(retouched, 0, "Inès grimpe.", true), 0)).toBe(true);
  });
});

describe("« À faire » et Statistiques", () => {
  it("les passages, champs et éléments de l'IA sont listés", () => {
    const cards: CardData[] = [
      { id: "c1abcdefgh", type: "idee", title: "Piste", html: `<p><span data-ia="abcd1234">un passage</span></p>`, ia: ["title"] },
      { id: "s1abcdefgh", type: "scene", title: "Phare", html: "", fiche: { synopsis: "Inès monte." }, ia: ["synopsis"] },
    ];
    const sp = parse(`INT. PHARE [[cosmos:s1abcdefgh]]\n\nLa lanterne tourne. [[ia]]\n`);
    const todos = iaTodos(cards, { s1abcdefgh: `<p><span data-ia="eeee1111">La mer</span> monte.</p>` }, sp);
    expect(todos.map((t) => [t.where, t.text, t.markId ?? t.field ?? t.index])).toEqual([
      ["card", "un passage", "abcd1234"],
      ["card", "Piste", "title"],
      ["card", "Inès monte.", "synopsis"],
      ["manuscript", "La mer", "eeee1111"],
      ["screenplay", "La lanterne tourne.", 1],
    ]);
    expect(todos[4].cardId).toBe("s1abcdefgh");
    expect(collectTodos(cards, {}).filter((t) => t.kind === "ia")).toHaveLength(3);
  });

  it("la part du texte touchée par l'IA, en mots", () => {
    const share = iaShareOfManuscript({ a: `<p>Un deux <span data-ia="abcd1234">trois quatre</span>.</p>`, b: "<p>cinq six sept huit</p>" });
    expect(share).toEqual({ ia: 2, total: 8 });
    expect(iaPercent(share)).toBe(25);
    expect(iaPercent({ ia: 1, total: 1000 })).toBe(1);
    expect(iaPercent({ ia: 0, total: 10 })).toBe(0);
    expect(iaShareOfScreenplay(parse(`INT. PHARE\n\nLa lanterne tourne. [[ia]]\n\nInès monte.\n`))).toEqual({ ia: 3, total: 7 });
  });
});

describe("couverture : pitch.ia", () => {
  it("accepté, retouché, repris", () => {
    const p = setPitchFieldIa({}, "logline", "Une gardienne cache un secret.");
    expect(pitchIaKeys(p)).toEqual(["logline"]);
    const both = setPitchFieldIa(p, "tagline", "Le phare ment.");
    expect(both.ia).toBe("tagline,logline");
    expect(pitchIaKeys(setPitchField(both, "logline", "Autre logline"))).toEqual(["tagline"]);
    expect(withoutPitchIa(both, "tagline").ia).toBe("logline");
    expect(withoutPitchIa(p, "logline").ia).toBeUndefined();
    // Relu : clés connues et remplies seulement, jamais une clé inconnue gardée à part.
    expect(readPitch({ logline: "x", ia: "logline,resume,../bad" })).toEqual({ logline: "x", ia: "logline" });
  });
});

describe("lecteurs des réponses de l'IA (texte brut, bornés)", () => {
  it("trois variantes distinctes, sans balise ni Markdown, différentes du passage", () => {
    const reply = '```json\n{"variants": ["**La mer grondait.**", "<b>La mer grondait</b>", "La mer rugissait.", "La mer tonnait.", "Elle grondait"]}\n```';
    // Sélection sans ponctuation finale : les variantes n'en ajoutent pas (sinon « grondait.. » dans le texte).
    expect(parseVariants(reply, "La mer grondait")).toEqual(["La mer rugissait", "La mer tonnait", "Elle grondait"]);
    expect(parseVariants(reply, "La mer grondait.")).toEqual(["La mer rugissait.", "La mer tonnait.", "Elle grondait"]);
    expect(parseVariants('{"variants": ["' + "x".repeat(2000) + '"]}', "court")[0].length).toBeLessThanOrEqual(121);
    expect(parseVariants("rien", "rien")).toEqual([]);
  });

  it("synopsis : un paragraphe, sans préfixe ni guillemets", () => {
    expect(parseSynopsis('Synopsis : « Inès monte au phare. »\n\nDeuxième paragraphe.')).toBe("Inès monte au phare.");
    expect(parseSynopsis("<script>x</script>Inès monte.")).toBe("xInès monte.");
  });

  it("trois directions d'une ligne", () => {
    expect(parseDirections('{"directions": ["1. Yann revient", "- La tempête coupe le courant", "Inès ment", "En trop"]}')).toEqual(["Yann revient", "La tempête coupe le courant", "Inès ment"]);
    expect(parseDirections("- A une\n- B deux\n- C trois")).toEqual(["A une", "B deux", "C trois"]);
  });

  it("brouillon de la couverture : seulement les champs demandés", () => {
    const reply = JSON.stringify({ logline: "Une **gardienne**.", resume: "Premier.\n\nSecond.", tagline: "non demandé", other: "x" });
    expect(parsePitchDraft(reply, ["logline", "resume"])).toEqual({ logline: "Une gardienne.", resume: "Premier.\n\nSecond." });
  });

  it("fiche : seulement les champs permis (jamais l'origine), textes bornés", () => {
    const reply = JSON.stringify({ fields: { metier: "Pêcheur", origine: "Bretonne", genre: "Homme", age: "x".repeat(200), arcType: "positif" } });
    const out = parseSheetDraft(reply, ["metier", "age"]);
    expect(out.metier).toBe("Pêcheur");
    expect(out.age!.length).toBeLessThanOrEqual(61);
    expect(Object.keys(out)).toEqual(["metier", "age"]);
  });

  it("les consignes interdisent ce qu'il faut interdire", () => {
    const c: CardData = { id: "p1abcdefgh", type: "personnage", title: "Yann", html: "<p>Pêcheur taiseux.</p>" };
    const sheet = sheetDraftPrompt(c, [], ["metier"], { metier: "Métier" }, "fr");
    expect(sheet.system).toMatch(/origin, religion, health, disability or sexual orientation/);
    expect(sheet.system).toMatch(/Never mention a card id/);
    expect(variantsPrompt("Il pleut.", "prose", "fr").system).toMatch(/exactly three/);
    expect(pitchDraftPrompt({ title: "T", kind: "roman", filled: {} }, ["logline"], [c], "en").system).toMatch(/Do not invent/);
  });
});

describe("actions du store : une action, une étape ; le journal hors historique", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr", ai: { ...useSettings.getState().ai, provider: "anthropic", keys: { anthropic: "k" }, models: { anthropic: "claude-test" } } as never });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, trash: [], lastFiles: {}, past: [], future: [], filter: NO_FILTER, spotlightId: null, journal: "", aiMode: "gardienne" });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
  });

  it("setAiMode : hors historique, projet modifié", () => {
    const past = state().past.length;
    useCosmos.setState({ status: "enregistre" });
    state().setAiMode("atelier");
    expect(state().aiMode).toBe("atelier");
    expect(state().status).toBe("modifie");
    expect(state().past.length).toBe(past);
  });

  it("synopsis accepté : une étape, marqué, journalisé ; annuler garde la ligne du journal", () => {
    const id = state().addTitledCard("scene", "Le phare");
    const past = state().past.length;
    state().acceptIaSynopsis(id, "Inès monte au phare.");
    expect(state().past.length).toBe(past + 1);
    expect(card(id).fiche?.synopsis).toBe("Inès monte au phare.");
    expect(card(id).ia).toEqual(["synopsis"]);
    expect(state().journal).toMatch(/· Synopsis · «\s?Le phare\s?» · anthropic, claude-test · 4 mots\n$/);
    state().undo();
    expect(card(id).fiche?.synopsis).toBeUndefined();
    expect(state().journal).toContain("Synopsis");
    // Retouché par l'auteur : la marque part.
    state().redo();
    state().setFiche(id, "synopsis", "Inès grimpe.");
    expect(card(id).ia).toBeUndefined();
  });

  it("piste acceptée : une carte Idée reliée par un fil « piste », en une étape", () => {
    const scene = state().addTitledCard("scene", "Le phare");
    const past = state().past.length;
    const idea = state().acceptIaDirection(scene, "Yann revient de la mer.")!;
    expect(state().past.length).toBe(past + 1);
    expect(card(idea)).toMatchObject({ type: "idee", title: "Yann revient de la mer.", ia: ["title"] });
    expect(state().edges.find((e) => e.source === scene && e.target === idea)?.label).toBe("piste");
    state().updateCard(idea, { title: "Yann revient." });
    expect(card(idea).ia).toBeUndefined();
  });

  it("champ de fiche accepté : une étape ; « Je l'ai repris » retire la marque", () => {
    const id = state().addTitledCard("personnage", "Yann");
    const past = state().past.length;
    state().acceptIaFiche(id, "metier", "Pêcheur");
    expect(state().past.length).toBe(past + 1);
    expect(card(id)).toMatchObject({ fiche: { metier: "Pêcheur" }, ia: ["metier"] });
    state().reworkIaField(id, "metier");
    expect(card(id).ia).toBeUndefined();
    expect(card(id).fiche?.metier).toBe("Pêcheur");
    expect(state().journal.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
  });

  it("couverture acceptée : marquée, journalisée, hors historique comme la couverture", () => {
    const past = state().past.length;
    state().acceptIaPitch("logline", "Une gardienne cache un secret.");
    expect(state().past.length).toBe(past);
    expect(pitchIaKeys(state().pitch)).toEqual(["logline"]);
    expect(state().journal).toMatch(/Couverture · «\s?Kerlaouen\s?»/);
    state().setPitch("logline", "Une gardienne ment.");
    expect(state().pitch.ia).toBeUndefined();
  });

  it("« Je l'ai repris » sur une carte et dans le manuscrit", () => {
    const id = state().addTitledCard("idee", "Note");
    state().updateCard(id, { html: `<p><span data-ia="abcd1234">proposé</span></p>` });
    const past = state().past.length;
    state().unmarkIaPassage(id, "card", "abcd1234");
    expect(state().past.length).toBe(past + 1);
    expect(card(id).html).toBe("<p>proposé</p>");
    useCosmos.setState({ manuscript: { [id]: `<p><span data-ia="abcd1234">mer</span></p>` } });
    state().unmarkIaPassage(id, "manuscript");
    expect(state().manuscript[id]).toBe("<p>mer</p>");
  });

  it("le journal et le réglage s'enregistrent avec le projet", () => {
    state().setAiMode("atelier");
    state().logAtelier("variants", "Le phare", 4);
    const files = serialize(toProject(state()));
    expect(JSON.parse(files["cosmos.json"]).aiMode).toBe("atelier");
    expect(files[JOURNAL_FILE]).toMatch(/^# Journal de l’IA/);
    expect(files[JOURNAL_FILE]).toMatch(/· Variante · «\s?Le phare\s?» · anthropic, claude-test · 4 mots\n$/);
  });
});

describe("scénario : actions sur les éléments", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, trash: [], lastFiles: {}, past: [], future: [], filter: NO_FILTER, spotlightId: null, journal: "" });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "scenario" });
  });

  it("synopsis accepté dans un scénario : ligne « = » avec [[ia]], une étape ; « Je l'ai repris » sur un élément", () => {
    const id = state().addTitledCard("scene", "");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    const sp = state().screenplay!;
    const at = sp.elements.findIndex((e) => e.cardId === id);
    expect(at).toBeGreaterThanOrEqual(0);
    const past = state().past.length;
    state().acceptIaSynopsis(id, "Inès monte.");
    expect(state().past.length).toBe(past + 1);
    expect(toFountain(state().screenplay!)).toContain("= Inès monte. [[ia]]");
    const index = state().screenplay!.elements.findIndex((e) => e.type === "synopsis");
    state().unmarkIaElement(index);
    expect(toFountain(state().screenplay!)).not.toContain("[[ia]]");
  });
});
