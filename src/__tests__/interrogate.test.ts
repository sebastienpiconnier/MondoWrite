// @vitest-environment happy-dom
// « Interroger le personnage » (1.8.0) : extraits bornés des scènes, consigne, relecture de la réponse,
// réponse gardée sous `i:` (une étape d'annulation), et clés `i:` lues en clair par les autres tâches.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { allQuestionTexts, hasAnswer, interviewKey, isInterviewKey, questionText } from "../assistant";
import { coherencePrompt, interviewPrompt, synthesisPrompt } from "../ai/tasks";
import {
  ANSWER_MAX,
  INTERROGATE_HISTORY,
  interrogatePrompt,
  knownText,
  novelPassages,
  parseInterrogation,
  screenplayPassages,
  unknownNames,
  type InterrogateContext,
} from "../ai/interrogate";
import { adoptTextAnswers } from "../projectState";
import type { CardData } from "../types";
import type { CardNode } from "../projectState";

const card = (id: string, type: CardData["type"], title: string, html = "", extra: Partial<CardData> = {}): CardData => ({ id, type, title, html, ...extra });
const ines = card("p1", "personnage", "Inès Morvan", "<p>Gardienne remplaçante. Ne supporte pas le silence.</p>", {
  fiche: { voix: "Phrases courtes, sèches.", objectif: "Garder le phare", principal: "oui" },
  reponses: { night: "La mer.", "i:Tu as peur de quoi ?": "Du noir, je crois." },
});
const yann = card("p2", "personnage", "Yann Le Goff", "<p>Ancien gardien.</p>");
const phare = card("l1", "lieu", "Phare de Kerlaouen");
const ctx = (over: Partial<InterrogateContext> = {}): InterrogateContext => ({
  lang: "fr",
  kind: "roman",
  questions: allQuestionTexts(fr.assistant),
  fieldLabels: fr.character.fields,
  arcLabels: fr.character.arcTypes,
  scenes: [],
  ...over,
});

describe("extraits des scènes où il paraît", () => {
  it("roman : seulement les paragraphes qui le nomment (prénom compris), deux par scène, dans l'ordre", () => {
    const manuscript = {
      s1: "<p>La nuit tombe.</p><p>Inès monte l’escalier.</p><p>Inès Morvan allume la lampe.</p><p>Inès dort.</p>",
      s2: "<p>Yann attend.</p>",
      s3: "<p>Au matin, inès part.</p>",
    };
    const got = novelPassages(ines, manuscript, ["s3", "s1", "s2"], [card("s1", "scene", "Arrivée"), card("s3", "scene", "Départ")]);
    expect(got).toEqual([
      { scene: "Départ", passages: ["Au matin, inès part."] },
      { scene: "Arrivée", passages: ["Inès monte l’escalier.", "Inès Morvan allume la lampe."] },
    ]);
  });

  it("roman : bornés (longueur de chaque extrait, nombre de scènes, budget)", () => {
    const long = `<p>Inès ${"marche ".repeat(200)}</p>`;
    const manuscript = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, long]));
    const got = novelPassages(ines, manuscript, Object.keys(manuscript), []);
    expect(got.length).toBeLessThanOrEqual(14);
    expect(JSON.stringify(got).length).toBeLessThan(8000);
    for (const s of got) for (const p of s.passages!) expect(p.length).toBeLessThanOrEqual(421);
  });

  it("scénario : en-tête, action et ses propres répliques, pas celles des autres", () => {
    const elements = [
      { type: "sceneHeading", text: "INT. PHARE - NUIT" },
      { type: "action", text: "La lampe tourne." },
      { type: "character", text: "INÈS" },
      { type: "parenthetical", text: "(bas)" },
      { type: "dialogue", text: "Je reste." },
      { type: "character", text: "YANN" },
      { type: "dialogue", text: "Tu ne tiendras pas." },
      { type: "sceneHeading", text: "EXT. QUAI - JOUR" },
      { type: "character", text: "YANN" },
      { type: "dialogue", text: "Personne." },
    ] as const;
    expect(screenplayPassages(ines, [...elements])).toEqual([{ scene: "INT. PHARE - NUIT", passages: ["La lampe tourne."], lines: ["(bas)", "Je reste."] }]);
  });
});

describe("consigne", () => {
  it("première personne, rien d'inventé, langue de l'interface ; fiche, notes, réponses (en clair), fils, scènes et historique borné", () => {
    const history = Array.from({ length: 9 }, (_, i) => ({ question: `Q${i}`, answer: `R${i}` }));
    const p = interrogatePrompt(ines, [ines, yann, phare], [{ source: "p1", target: "p2", label: "remplace" }, { source: "l1", target: "p1", label: "abrite" }], history, "  Qui es-tu ?  ", ctx({ scenes: [{ scene: "Arrivée", passages: ["Inès monte."] }] }));
    expect(p.system).toMatch(/first person/);
    expect(p.system).toMatch(/Never invent a fact/);
    expect(p.system).toMatch(/do not know, or that you would rather not say/);
    expect(p.system).toMatch(/in français/);
    const user = JSON.parse(p.user);
    expect(user.you.name).toBe("Inès Morvan");
    expect(user.you.sheet).toEqual({ [fr.character.fields.voix]: "Phrases courtes, sèches.", [fr.character.fields.objectif]: "Garder le phare" });
    expect(user.you.notes).toContain("Gardienne remplaçante");
    expect(user.you.earlierAnswers).toEqual([
      { question: fr.assistant.questions.night, answer: "La mer." },
      { question: "Tu as peur de quoi ?", answer: "Du noir, je crois." },
    ]);
    expect(user.links).toEqual([
      { from: "Inès Morvan", link: "remplace", to: "Yann Le Goff", type: "personnage", about: "Ancien gardien." },
      { from: "Phare de Kerlaouen", link: "abrite", to: "Inès Morvan", type: "lieu", about: "" },
    ]);
    expect(user.scenes).toHaveLength(1);
    expect(user.conversation).toHaveLength(INTERROGATE_HISTORY);
    expect(user.conversation[0]).toEqual({ writer: "Q3", you: "R3" });
    expect(user.question).toBe("Qui es-tu ?");
    // Aucun identifiant de carte dans ce que le modèle reçoit.
    expect(p.user).not.toMatch(/"p1"|"p2"|"l1"/);
  });

  it("en anglais pour une interface anglaise, et « screenplay » pour un scénario", () => {
    const p = interrogatePrompt(ines, [ines], [], [], "Who are you?", ctx({ lang: "en", kind: "scenario", questions: allQuestionTexts(en.assistant), fieldLabels: en.character.fields }));
    expect(p.system).toMatch(/in English/);
    expect(p.system).toMatch(/screenplay/);
  });
});

describe("relecture de la réponse", () => {
  const known = "Inès Morvan Yann Le Goff phare de Kerlaouen silence";

  it("texte brut : Markdown, préfixe « Nom : », guillemets et didascalie de tête retirés", () => {
    expect(parseInterrogation("**Inès :** « Je reste. »", ines, known).text).toBe("Je reste.");
    expect(parseInterrogation("Inès Morvan: \"Le silence, je le déteste.\"", ines, known).text).toBe("Le silence, je le déteste.");
    expect(parseInterrogation("(elle hausse les épaules) Je ne sais pas.\n\nVraiment.", ines, known).text).toBe("Je ne sais pas. Vraiment.");
    expect(parseInterrogation("<b>Réponse :</b> Non.", ines, known).text).toBe("Non.");
    expect(parseInterrogation("   ", ines, known).text).toBe("");
  });

  it("bornée, coupée à une fin de phrase", () => {
    const text = parseInterrogation(`${"Je garde la lampe allumée chaque nuit. ".repeat(40)}`, ines, known).text;
    expect(text.length).toBeLessThanOrEqual(ANSWER_MAX);
    expect(text.endsWith(".")).toBe(true);
  });

  it("noms propres absents du projet signalés, jamais un mot en tête de phrase ni un nom connu", () => {
    expect(parseInterrogation("Je pense à Yann. Parfois à ma sœur Lucie, à Brest.", ines, known).unknown).toEqual(["Lucie", "Brest"]);
    expect(parseInterrogation("Le phare de Kerlaouen, c’est tout. Rien d’autre.", ines, known).unknown).toEqual([]);
    expect(unknownNames("Well, I think I’m fine on Monday with Yann.", known)).toEqual([]);
    expect(unknownNames("I lived in Saint-Malo.", "saint")).toEqual(["Saint-Malo"]);
    expect(unknownNames("Je suis allée « Ailleurs ».", known)).toEqual([]);
  });

  it("knownText : ce que le modèle a reçu et les titres et textes de toutes les cartes", () => {
    const p = interrogatePrompt(ines, [ines], [], [], "Qui ?", ctx());
    const k = knownText(p, [ines, card("x", "idee", "Lucie", "<p>Brest</p>")]);
    expect(unknownNames("Je pense à Lucie, à Brest.", k)).toEqual([]);
  });
});

describe("réponse gardée", () => {
  const state = () => useCosmos.getState();
  let id = "";
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
    id = state().addTitledCard("personnage", "Inès Morvan");
  });
  const data = () => state().nodes.find((n) => n.id === id)!.data;

  it("va dans `reponses` sous `i:<question>`, en une étape d'annulation ; une autre réponse s'ajoute à la suite, un doublon rien", () => {
    const past = state().past.length;
    state().keepInterviewAnswer(id, "Tu as peur\nde quoi ?", "Du noir.");
    expect(data().reponses).toEqual({ "i:Tu as peur de quoi ?": "Du noir." });
    expect(state().past.length).toBe(past + 1);
    expect(state().status).toBe("modifie");
    state().keepInterviewAnswer(id, "Tu as peur de quoi ?", "Du noir.");
    expect(state().past.length).toBe(past + 1);
    state().keepInterviewAnswer(id, "Tu as peur de quoi ?", "Et du silence.");
    expect(data().reponses?.["i:Tu as peur de quoi ?"]).toBe("Du noir.\nEt du silence.");
    state().undo();
    expect(data().reponses?.["i:Tu as peur de quoi ?"]).toBe("Du noir.");
    state().undo();
    expect(data().reponses).toBeUndefined();
    // Réponse vide, carte inconnue ou qui n'est pas un personnage : rien.
    const lieu = state().addTitledCard("lieu", "Phare");
    const now = state().past.length;
    state().keepInterviewAnswer(id, "Q ?", "  ");
    state().keepInterviewAnswer("inconnu", "Q ?", "x");
    state().keepInterviewAnswer(lieu, "Q ?", "x");
    expect(state().past.length).toBe(now);
  });
});

describe("clés `i:` dans les autres tâches", () => {
  const texts = allQuestionTexts(fr.assistant);

  it("question en clair, jamais confondue avec une question livrée", () => {
    expect(interviewKey("  Tu as   peur ? ")).toBe("i:Tu as peur ?");
    expect(isInterviewKey("i:x")).toBe(true);
    expect(isInterviewKey("q:x")).toBe(false);
    expect(questionText("i:Tu as peur ?", texts)).toBe("Tu as peur ?");
    expect(Object.keys(texts).some((k) => k.startsWith("i:"))).toBe(false);
    // Une réponse `i:` qui reprend le texte d'une question livrée ne la rend pas « répondue ».
    const c = card("p", "personnage", "Inès", "", { reponses: { [interviewKey(fr.assistant.questions.night)]: "La mer." } });
    expect(hasAnswer(c, "night", fr.assistant.questions.night)).toBe(false);
  });

  it("interview, synthèse et cohérence reçoivent la question en clair", () => {
    const interview = JSON.parse(interviewPrompt(ines, [ines], [], "fr", [], texts).user);
    expect(interview.character.answers).toContainEqual({ question: "Tu as peur de quoi ?", answer: "Du noir, je crois." });
    expect(interview.alreadyAsked).toContain("Tu as peur de quoi ?");
    const coherence = JSON.parse(coherencePrompt([ines], [], "fr", {}, texts).user);
    expect(coherence.cards[0].answers).toContainEqual({ question: "Tu as peur de quoi ?", answer: "Du noir, je crois." });
    const synthesis = JSON.parse(
      synthesisPrompt(ines, [ines], [], "fr", fr.character.fields, fr.character.arcTypes, Object.entries(ines.reponses!).map(([k, a]) => ({ question: questionText(k, texts), answer: a }))).user,
    );
    expect(synthesis.answers).toContainEqual({ question: "Tu as peur de quoi ?", answer: "Du noir, je crois." });
  });

  it("la reprise des anciens projets garde les réponses `i:` telles quelles", () => {
    const node = { id: "p1", type: "card", position: { x: 0, y: 0 }, data: { ...ines, html: `<p><strong>${fr.assistant.questions.want}</strong></p><p>Le phare.</p>` } } as unknown as CardNode;
    const [after] = adoptTextAnswers([node]);
    expect(after.data.reponses).toEqual({ want: "Le phare.", night: "La mer.", "i:Tu as peur de quoi ?": "Du noir, je crois." });
  });
});
