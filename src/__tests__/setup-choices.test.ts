import { describe, expect, it } from "vitest";
import { matchChoices, shorten, type SceneChoice } from "../setupChoices";

const list: SceneChoice[] = [
  { id: "a", number: "1", title: "INT. PHARE – NUIT", hint: "Inès trouve le revolver." },
  { id: "b", number: "12", title: "EXT. QUAI – JOUR", hint: "Yann part en mer." },
];

describe("scènes proposées pour une préparation", () => {
  it("cherche par numéro exact, titre ou synopsis, sans casse ni accents", () => {
    expect(matchChoices(list, "12").map((c) => c.id)).toEqual(["b"]);
    expect(matchChoices(list, "1").map((c) => c.id)).toEqual(["a"]);
    expect(matchChoices(list, "ines").map((c) => c.id)).toEqual(["a"]);
    expect(matchChoices(list, "quai").map((c) => c.id)).toEqual(["b"]);
    expect(matchChoices(list, "  ")).toBe(list);
  });
  it("coupe le synopsis entre deux mots", () => {
    expect(shorten("un deux trois quatre", 10)).toBe("un deux…");
    expect(shorten("court", 10)).toBe("court");
  });
});
