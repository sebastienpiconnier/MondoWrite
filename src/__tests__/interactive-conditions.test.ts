import { describe, expect, it } from "vitest";
import { condIdentifiers, condPhrase, effectPhrase, parseCond, parseEffect } from "../interactive/conditions";
import { verifyStory } from "../interactive/verify";
import { getT } from "../i18n";
import { fr } from "../i18n/fr";

describe("conditions d'un choix", () => {
  it("lit faits, compteurs, et, ou, non, parenthèses", () => {
    expect(parseCond("cle")).toEqual({ k: "name", name: "cle" });
    expect(parseCond("not nom_donne and ourdas and reconnu and flamme > 0")).toEqual({
      k: "and",
      list: [
        { k: "not", a: { k: "name", name: "nom_donne" } },
        { k: "name", name: "ourdas" },
        { k: "name", name: "reconnu" },
        { k: "cmp", name: "flamme", op: ">", value: 0 },
      ],
    });
    expect(parseCond("(a || b) && !c")?.k).toBe("and");
    expect(parseCond("cle == true")).toEqual({ k: "cmp", name: "cle", op: "==", value: true });
    expect(condIdentifiers(parseCond("a and (b or c > 2)")!)).toEqual(["a", "b", "c"]);
  });

  it("refuse ce qu'il ne sait pas lire", () => {
    for (const bad of ["", "a and", "RANDOM(1, 6) > 3", "nom == \"Paul\"", "a +", "(a", "true", "and"]) expect(parseCond(bad)).toBeNull();
  });

  it("effets : fait donné ou retiré, compteur posé, augmenté ou diminué", () => {
    expect(parseEffect("lanterne = true")).toEqual({ name: "lanterne", op: "set", value: true });
    expect(parseEffect("~ flamme = 3")).toEqual({ name: "flamme", op: "set", value: 3 });
    expect(parseEffect("flamme -= 1")).toEqual({ name: "flamme", op: "sub", value: 1 });
    expect(parseEffect("pieces++")).toEqual({ name: "pieces", op: "add", value: 1 });
    expect(parseEffect("flamme += true")).toBeNull();
    expect(parseEffect("x = RANDOM(1,6)")).toBeNull();
  });

  const texts = fr.interactive.gamebook;
  const names = { section: (n: string) => (n === "la_cour" ? 2 : null), fact: (n: string) => `« ${n} »` };

  it("dit au lecteur une condition faite de plusieurs faits et d'un compteur", () => {
    expect(condPhrase("not nom_donne and ourdas and flamme > 0", texts, names)).toBe(
      "Si vous n’avez pas noté « nom_donne », vous avez noté « ourdas » et votre total de « flamme » est d’au moins 1,",
    );
    expect(condPhrase("bille or souvenir", texts, names)).toBe("Si vous avez noté « bille » ou vous avez noté « souvenir »,");
    expect(condPhrase("flamme < 1", texts, names)).toBe("Si votre total de « flamme » est d’au plus 0,");
    expect(condPhrase("not la_cour", texts, names)).toBe("Si vous n’êtes pas encore passé par le 2,");
    expect(condPhrase("", texts, names)).toBe("");
    // Des « et » et des « ou » mêlés : pas de phrase sûre.
    expect(condPhrase("a and (b or c)", texts, names)).toBeNull();
  });

  it("dit les effets", () => {
    const fact = (n: string) => `« ${n} »`;
    expect(effectPhrase("flamme = 3", texts, fact)).toBe("inscrivez 3 pour « flamme »");
    expect(effectPhrase("flamme -= 1", texts, fact)).toBe("retirez 1 à « flamme »");
    expect(effectPhrase("cle = false", texts, fact)).toBe("rayez « cle »");
    expect(effectPhrase("x = x + 2", texts, fact)).toBe("ajoutez 2 à « x »");
    expect(effectPhrase("x = RANDOM(1,6)", texts, fact)).toBeNull();
  });

  it("vérifier : un choix que le livre imprimé ne sait pas écrire, et les faits d'un « et »", () => {
    void getT();
    const scenes = [
      { id: "a", title: "La cour" },
      { id: "b", title: "Le puits" },
    ];
    const ms = {
      a: '<p>Texte.</p><pre data-choices="true">* {a_x and (b_y or c_z)} [Descendre] -&gt; le_puits\n* [Fouiller] -&gt; le_puits\n  ~ cle = true</pre>',
      b: '<p>Texte.</p><pre data-choices="true">* {cle and ourdas} [Finir] -&gt; END</pre>',
    };
    const points = verifyStory(scenes, ms);
    expect(points.filter((p) => p.rule === "notPrinted").map((p) => p.label)).toEqual(["Descendre"]);
    // « a_x » et « ourdas » sont demandés dans un « et » sans être donnés nulle part ; « cle » est donné avant.
    expect(points.filter((p) => p.rule === "factNeverGiven").map((p) => p.name)).toEqual(["a_x", "ourdas"]);
  });
});

describe("canevas d'un roman interactif en arbre", () => {
  it("départ en haut, une rangée par pas de lecture, les scènes isolées dessous", async () => {
    const { choiceTree } = await import("../interactive/choices");
    const edges = [
      { from: "a", index: 0, label: "", target: "", to: "b" },
      { from: "a", index: 1, label: "", target: "", to: "c" },
      { from: "b", index: 0, label: "", target: "", to: "d" },
      { from: "c", index: 0, label: "", target: "", to: "d" },
      { from: "d", index: 0, label: "", target: "", to: "END" },
    ];
    const { positions } = choiceTree(["a", "b", "c", "d", "e"], edges, () => ({ width: 100, height: 50 }), { x: 0, y: 0 }, { x: 20, y: 30 });
    const y = (id: string) => positions.get(id)!.y;
    expect([y("a"), y("b"), y("c"), y("d"), y("e")]).toEqual([0, 80, 80, 160, 240]);
    // Chaque rangée est centrée sur la plus large (b et c).
    expect(positions.get("a")!.x).toBe(60);
    expect(positions.get("b")!.x).toBe(0);
    expect(positions.get("c")!.x).toBe(120);
  });
});
