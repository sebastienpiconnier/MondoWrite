// Lecture à voix haute : ce qui se lit, par qui, et quelle voix.

import { describe, expect, it } from "vitest";
import { DEFAULT_READING, proseUtterances, readReading, screenplayUtterances, spokenHeading, voiceForSpeaker, type VoiceInfo } from "../reading";

describe("lecture d'un scénario", () => {
  const nodes = [
    { type: "sceneHeading", text: "INT. PHARE - NUIT" },
    { type: "action", text: "Le vent." },
    { type: "character", text: "INÈS (V.O.)" },
    { type: "parenthetical", text: "(bas)" },
    { type: "dialogue", text: "Tu entends ?" },
    { type: "note", text: "" },
    { type: "transition", text: "CUT TO:" },
  ];

  it("en-tête en phrase, réplique par son personnage, didascalie seulement sur demande", () => {
    expect(screenplayUtterances(nodes, 0, "fr")).toEqual([
      { index: 0, speaker: null, text: "Intérieur. Phare. Nuit." },
      { index: 1, speaker: null, text: "Le vent." },
      { index: 4, speaker: "INÈS", text: "Tu entends ?" },
      { index: 6, speaker: null, text: "CUT TO:" },
    ]);
    expect(screenplayUtterances(nodes, 0, "fr", true).map((u) => u.text)).toContain("bas");
  });

  it("partir du milieu d'une réplique garde son personnage", () => {
    expect(screenplayUtterances(nodes, 4, "fr")[0]).toEqual({ index: 4, speaker: "INÈS", text: "Tu entends ?" });
  });

  it("en-têtes en anglais et INT./EXT.", () => {
    expect(spokenHeading("INT./EXT. CAR - DAY", "en")).toBe("Interior, exterior. Car. Day.");
    expect(spokenHeading("EXT. CÔTE - PLUS TARD", "fr")).toBe("Extérieur. Côte. Plus tard.");
  });
});

describe("lecture d'un roman", () => {
  it("chaque paragraphe non vide, à partir du bloc demandé, sans les repères de scène", () => {
    const nodes = [
      { type: "sceneMark", text: "" },
      { type: "paragraph", text: "Un." },
      { type: "paragraph", text: " " },
      { type: "paragraph", text: "Deux." },
    ];
    expect(proseUtterances(nodes, 1).map((u) => [u.index, u.text])).toEqual([
      [1, "Un."],
      [3, "Deux."],
    ]);
  });
});

describe("voix", () => {
  const voices: VoiceInfo[] = [
    { uri: "a", name: "Amélie", lang: "fr-CA" },
    { uri: "t", name: "Thomas", lang: "fr-FR" },
    { uri: "d", name: "Daniel", lang: "en-GB" },
  ];

  it("narrateur : la première voix de la langue, sauf choix ; un personnage : une autre voix, toujours la même", () => {
    expect(voiceForSpeaker(null, voices, DEFAULT_READING, "fr")?.uri).toBe("a");
    expect(voiceForSpeaker(null, voices, { ...DEFAULT_READING, narrator: "t" }, "fr")?.uri).toBe("t");
    const ines = voiceForSpeaker("INÈS", voices, DEFAULT_READING, "fr");
    expect(ines?.uri).toBe("t");
    expect(voiceForSpeaker("Inès", voices, DEFAULT_READING, "fr")?.uri).toBe(ines?.uri);
    expect(voiceForSpeaker("INÈS", voices, { ...DEFAULT_READING, voices: { INES: "d" } }, "fr")?.uri).toBe("d");
    expect(voiceForSpeaker("INÈS", [], DEFAULT_READING, "fr")).toBeNull();
  });

  it("réglages relus : vitesse bornée, voix gardées", () => {
    expect(readReading({ rate: 9, voices: { ines: "d", x: 3 }, narrator: "t" })).toEqual({ narrator: "t", voices: { ines: "d" }, rate: 2, parentheticals: false });
  });
});
