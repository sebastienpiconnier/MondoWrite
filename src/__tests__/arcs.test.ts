import { describe, expect, it } from "vitest";
import { arcNotes, arcSummary, arcTicks, characterArcs, cumulativeArc } from "../arcs";
import { ISSUES_FOR, issuesFor, readFiche, withIssueFor } from "../character";
import { fortuneCurve } from "../ribbon";

const issues = (pairs: [string, string][]) => new Map(pairs);

describe("courbe cumulée d'un personnage", () => {
  it("part de 0 et ajoute +1, 0 ou −1 à chaque scène notée ; une scène non notée garde le score", () => {
    const points = cumulativeArc(["a", "b", "c", "d", "e"], issues([["a", "mieux"], ["b", "mieux"], ["d", "pire"], ["e", "pareil"]]));
    expect(points.map((p) => p.score)).toEqual([1, 2, 2, 1, 1]);
    expect(points.map((p) => p.step)).toEqual([1, 1, null, -1, 0]);
  });

  it("dépasse ±1 : deux scènes positives de suite font +2", () => {
    const points = cumulativeArc(["a", "b"], issues([["a", "mieux"], ["b", "mieux"]]));
    expect(points[1].score).toBe(2);
  });

  it("ignore une valeur inconnue", () => {
    expect(cumulativeArc(["a"], issues([["a", "bof"]]))[0].step).toBeNull();
  });

  it("résume : fin, extrêmes, plus longues suites (les scènes non notées ne coupent pas une suite)", () => {
    const order = ["a", "b", "c", "d", "e", "f", "g"];
    const points = cumulativeArc(order, issues([["a", "pire"], ["b", "pire"], ["c", "mieux"], ["e", "mieux"], ["f", "mieux"], ["g", "pire"]]));
    const s = arcSummary(points)!;
    expect(s.final).toBe(0);
    expect(s.trough).toEqual({ score: -2, rank: 1 });
    expect(s.peak).toEqual({ score: 1, rank: 5 });
    expect(s.rise).toEqual({ from: 2, to: 5, length: 3 });
    expect(s.fall).toEqual({ from: 0, to: 1, length: 2 });
    expect([s.up, s.same, s.down]).toEqual([3, 0, 3]);
  });

  it("rien de noté : pas de résumé ; peu de scènes : une seule remarque", () => {
    expect(arcSummary(cumulativeArc(["a"], new Map()))).toBeNull();
    const few = arcSummary(cumulativeArc(["a", "b"], issues([["a", "mieux"], ["b", "mieux"]])));
    expect(arcNotes(few)).toEqual([{ key: "few", n: 2 }]);
  });

  it("pose des questions sans trancher : rien ne coûte, creux à la fin, arc annoncé contredit", () => {
    const up = arcSummary(cumulativeArc(["a", "b", "c"], issues([["a", "mieux"], ["b", "mieux"], ["c", "pareil"]])))!;
    expect(arcNotes(up).map((n) => n.key)).toContain("neverDown");
    const down = arcSummary(cumulativeArc(["a", "b", "c", "d"], issues([["a", "mieux"], ["b", "pire"], ["c", "pire"], ["d", "pire"]])))!;
    const keys = arcNotes(down, "positif").map((n) => n.key);
    expect(keys).toContain("lowAtEnd");
    expect(keys).toContain("declared");
    expect(arcNotes(down, "negatif").map((n) => n.key)).not.toContain("declared");
    // Arc plat : seulement quand la courbe s'éloigne nettement de son départ.
    const flat = arcSummary(cumulativeArc(["a", "b", "c"], issues([["a", "mieux"], ["b", "mieux"], ["c", "mieux"]])))!;
    expect(arcNotes(flat, "plat").map((n) => n.key)).toContain("declared");
  });

  it("lit les scènes racontées par le personnage, et pour un principal celles sans point de vue", () => {
    const cards: { id: string; type: string; fiche?: Record<string, string> }[] = [
      { id: "h", type: "personnage", fiche: { principal: "oui" } },
      { id: "m", type: "personnage" },
      { id: "s1", type: "scene", fiche: { issue: "mieux" } },
      { id: "s2", type: "scene", fiche: { issue: "pire", pov: "m" } },
      { id: "s3", type: "scene", fiche: { issue: "mieux", pov: "h" } },
    ];
    const arcs = characterArcs(cards, ["s1", "s2", "s3"]);
    expect(arcs.map((a) => a.id)).toEqual(["h", "m"]);
    expect(arcs[0].summary.final).toBe(2);
    expect(arcs[1].summary.final).toBe(-1);
  });

  it("« beaucoup mieux » et « beaucoup moins bien » comptent deux crans, et pour le sens des suites", () => {
    const points = cumulativeArc(["a", "b", "c", "d"], issues([["a", "beaucoupMieux"], ["b", "mieux"], ["c", "beaucoupPire"], ["d", "pire"]]));
    expect(points.map((p) => p.step)).toEqual([2, 1, -2, -1]);
    expect(points.map((p) => p.score)).toEqual([2, 3, 1, 0]);
    const s = arcSummary(points)!;
    expect([s.up, s.same, s.down]).toEqual([2, 0, 2]);
    expect(s.rise?.length).toBe(2);
    expect(s.fall?.length).toBe(2);
    // La courbe du récit (ruban, frise) aussi.
    const curve = fortuneCurve(
      ["a", "b"].map((id, i) => ({ id, start: i, length: 1 })),
      (id) => ({ a: "beaucoupMieux", b: "pire" })[id],
    )!;
    expect(curve.map((p) => p.y)).toEqual([1, 0.5]);
  });

  it("une scène notée pour un personnage qui ne la raconte pas entre dans sa courbe", () => {
    const cards: { id: string; type: string; fiche?: Record<string, string> }[] = [
      { id: "h", type: "personnage", fiche: { principal: "oui" } },
      { id: "m", type: "personnage" },
      // Sans point de vue : celle du héros, mais une réponse pour lui l'emporte.
      { id: "s1", type: "scene", fiche: { issue: "mieux", issues: "m=pire;h=beaucoupPire" } },
      // Racontée par m : sa réponse principale l'emporte sur une ancienne réponse « pour m ».
      { id: "s2", type: "scene", fiche: { issue: "mieux", pov: "m", issues: "m=pire;h=pareil" } },
    ];
    const arcs = new Map(characterArcs(cards, ["s1", "s2"]).map((a) => [a.id, a.summary.final]));
    expect(arcs.get("h")).toBe(-2);
    expect(arcs.get("m")).toBe(0);
  });

  it("réponses par personnage : lues, écrites, gardées sur disque seulement pour une scène", () => {
    expect([...issuesFor("ab12=mieux;bad id=pire;cd34=inconnu;ef56=beaucoupPire")]).toEqual([["ab12", "mieux"], ["ef56", "beaucoupPire"]]);
    let fiche = withIssueFor({ issue: "mieux" }, "ab12", "pire");
    expect(fiche?.[ISSUES_FOR]).toBe("ab12=pire");
    fiche = withIssueFor(fiche, "cd34", "beaucoupMieux");
    expect(fiche?.[ISSUES_FOR]).toBe("ab12=pire;cd34=beaucoupMieux");
    fiche = withIssueFor(fiche, "ab12", "");
    expect(fiche?.[ISSUES_FOR]).toBe("cd34=beaucoupMieux");
    expect(withIssueFor({ [ISSUES_FOR]: "cd34=mieux" }, "cd34", "")).toBeUndefined();
    expect(readFiche({ issue: "beaucoupMieux", issues: "ab12=pire;x=nope" }, "scene")).toEqual({ issue: "beaucoupMieux", issues: "ab12=pire" });
    expect(readFiche({ issues: "ab12=pire" }, "personnage")).toBeUndefined();
  });

  it("graduations entières, zéro compris", () => {
    expect(arcTicks(-2, 3)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(arcTicks(1, 4)).toEqual([0, 1, 2, 3, 4]);
    const wide = arcTicks(-10, 20);
    expect(wide.length).toBeLessThanOrEqual(8);
    expect(wide).toContain(0);
  });
});
