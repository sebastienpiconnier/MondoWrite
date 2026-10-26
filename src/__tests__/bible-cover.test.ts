// @vitest-environment happy-dom
// Couverture du projet (tête de la Bible) et moteur des personnages.

import { beforeEach, describe, expect, it } from "vitest";
import { chipSuggestions, isEmptyPitch, pitchFilled, readPitch, setPitchField } from "../pitch";
import { bandFields, ficheText, isAntagonist, motorFields, readFiche } from "../character";
import { fieldToFill } from "../assistant";
import { bibleDoc } from "../export/doc";
import { cardToFile, fileToCard } from "../storage/markdown";
import { EMPTY_PLAN } from "../plan";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

describe("couverture du projet, fonctions pures", () => {
  it("ne garde que les textes non vides (une clé inconnue est gardée pour une version future)", () => {
    expect(readPitch({ tagline: "Le phare ment.", logline: "  ", genre: "Polar", inconnu: "x", ton: 3 })).toEqual({ tagline: "Le phare ment.", genre: "Polar", inconnu: "x" });
    expect(readPitch(null)).toEqual({});
    expect(readPitch(["x"])).toEqual({});
    expect(readPitch({ genre: "x".repeat(500) }).genre).toHaveLength(120);
  });

  it("garde les clés inconnues qui portent un texte (champs d'une version plus récente)", () => {
    const p = readPitch({ logline: "x", nouveauChamp: "texte", vide: " ", "../x": "non", nombre: 3 });
    expect(p).toEqual({ logline: "x", nouveauChamp: "texte" });
    expect(pitchFilled(p)).toBe(1);
  });

  it("modifier un champ : même objet si rien ne change, champ retiré quand on le vide", () => {
    const a = { genre: "Polar" };
    expect(setPitchField(a, "genre", "Polar")).toBe(a);
    expect(setPitchField(a, "ton", "")).toBe(a);
    expect(setPitchField(a, "genre", "")).toEqual({});
    expect(setPitchField(a, "ton", "Sombre")).toEqual({ genre: "Polar", ton: "Sombre" });
    expect(isEmptyPitch({})).toBe(true);
    expect(pitchFilled({ genre: "Polar", logline: "x", ton: " " })).toBe(2);
  });

  it("suggestions d'une pastille sans celle déjà choisie ni doublon", () => {
    expect(chipSuggestions(["Polar", "Fantasy", "fantasy", "Romance"], "polar")).toEqual(["Fantasy", "Romance"]);
    expect(chipSuggestions(fr.pitch.suggest.genre, undefined)).toHaveLength(fr.pitch.suggest.genre.length);
    // Mêmes pastilles proposées dans les deux langues.
    for (const key of Object.keys(fr.pitch.suggest) as (keyof typeof fr.pitch.suggest)[]) expect(en.pitch.suggest[key].length).toBeGreaterThan(2);
  });
});

describe("moteur d'un personnage", () => {
  it("Veut, A besoin de, Blessure ; un antagoniste montre Motivation, Force, Faille", () => {
    expect(motorFields({ fiche: { role: "Protagoniste" } })).toEqual(["objectif", "besoin", "blessure"]);
    expect(isAntagonist({ fiche: { role: "Antagoniste principal" } })).toBe(true);
    expect(isAntagonist({ fiche: { role: "the villain" } })).toBe(true);
    expect(motorFields({ fiche: { role: "Antagonist" } })).toEqual(["motivation", "force", "faille"]);
    expect(bandFields({ type: "personnage", fiche: {} })).toEqual(new Set(["objectif", "besoin", "blessure", "arcType", "arc"]));
    expect(bandFields({ type: "lieu", fiche: {} }).size).toBe(0);
  });

  it("le type d'arc est une clé, relue seulement si elle est connue", () => {
    expect(readFiche({ arcType: "positif", blessure: "Le naufrage", voix: "Bref" })).toEqual({ arcType: "positif", blessure: "Le naufrage", voix: "Bref" });
    expect(readFiche({ arcType: "Positive" })).toBeUndefined();
    expect(ficheText("arcType", "negatif", fr.character.arcTypes)).toBe("Tragique");
    expect(ficheText("age", "34 ans", fr.character.arcTypes)).toBe("34 ans");
    const card = { id: "p", type: "personnage" as const, title: "Inès", html: "", fiche: { objectif: "Retrouver son frère", arcType: "plat" } };
    expect(fileToCard(cardToFile(card))?.fiche).toEqual(card.fiche);
  });

  it("une réponse de l'assistant peut aller dans le champ vide qui lui correspond", () => {
    expect(fieldToFill("want", { fiche: {} })).toBe("objectif");
    expect(fieldToFill("past", { fiche: {} })).toBe("blessure");
    expect(fieldToFill("want", { fiche: { objectif: "Déjà là" } })).toBeNull();
    expect(fieldToFill("night", { fiche: {} })).toBeNull();
    expect(fieldToFill(null, { fiche: {} })).toBeNull();
  });
});

describe("couverture dans le projet et dans l'export", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [], pitch: {} });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
  });

  it("la couverture s'enregistre dans cosmos.json, et seulement quand elle est remplie", async () => {
    await state().save();
    expect(JSON.parse(state().lastFiles["cosmos.json"]).pitch).toBeUndefined();
    state().setPitch("logline", "Une gardienne de phare cherche son frère.");
    state().setPitch("genre", "Polar");
    expect(state().status).toBe("modifie");
    await state().save();
    expect(JSON.parse(state().lastFiles["cosmos.json"]).pitch).toEqual({ logline: "Une gardienne de phare cherche son frère.", genre: "Polar" });
  });

  it("la bible exportée commence par la couverture, l'arc est écrit en toutes lettres", () => {
    const doc = bibleDoc(
      { title: "Bible", author: "", lang: "fr" },
      [{ id: "p", type: "personnage", title: "Inès", html: "", fiche: { arcType: "positif", blessure: "Le naufrage" } }],
      [],
      {
        sections: Object.fromEntries(Object.entries(fr.types).map(([k, v]) => [k, v.section])) as never,
        untitled: "Sans titre",
        linkedTo: "Relié à",
        fields: { ...fr.character.fields },
        arcTypes: fr.character.arcTypes,
        cover: { title: fr.pitch.toc, fields: fr.pitch.fields },
      },
      { tagline: "Le phare ment.", genre: "Polar", logline: "Une gardienne…" },
    );
    expect(doc.chapters[0].title).toBe("Le projet");
    expect(doc.chapters[0].blocks[0]).toEqual({ kind: "paragraph", runs: [{ text: "Le phare ment.", italic: true }] });
    const text = JSON.stringify(doc.chapters[1]);
    expect(text).toContain("Positif");
    expect(text).toContain("Le naufrage");
    // Sans couverture remplie, pas de partie vide.
    expect(bibleDoc({ title: "B", author: "", lang: "fr" }, [], [], { sections: {} as never, untitled: "", linkedTo: "", cover: { title: "Le projet", fields: {} } }).chapters).toHaveLength(0);
  });
});

describe("assistant par thème", () => {
  it("dix thèmes, des questions dans les deux langues, en même nombre", async () => {
    const { ASSISTANT_THEMES, themeKeys, flatThemeTexts, bankQuestions } = await import("../assistant");
    expect(ASSISTANT_THEMES).toHaveLength(10);
    for (const th of ASSISTANT_THEMES) {
      expect(fr.assistant.themeQuestions[th].length).toBeGreaterThanOrEqual(6);
      expect(en.assistant.themeQuestions[th]).toHaveLength(fr.assistant.themeQuestions[th].length);
      for (const q of [...fr.assistant.themeQuestions[th], ...en.assistant.themeQuestions[th]]) expect(q.trim().endsWith("?")).toBe(true);
    }
    // Une réponse donnée marque la question comme faite, et peut aller dans le champ qui lui correspond.
    const texts = flatThemeTexts(fr.assistant.themeQuestions);
    const card = { id: "p", type: "personnage" as const, title: "Inès", html: `<p><strong>${texts["passe.4"]}</strong></p><p>Le naufrage.</p>` };
    const qs = bankQuestions(themeKeys("passe", fr.assistant.themeQuestions), texts, card, [card], []);
    expect(qs.find((q) => q.key === "passe.4")?.state).toBe("answered");
    expect(qs.filter((q) => q.state === "open")).toHaveLength(qs.length - 1);
    expect(fieldToFill("past", { fiche: {} })).toBe("blessure");
    expect(fieldToFill("voice", { fiche: {} })).toBe("voix");
  });
});
