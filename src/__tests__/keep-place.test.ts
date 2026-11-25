import { describe, expect, it } from "vitest";
import { placeOnSwitch, type SwitchInput } from "../keepPlace";

const spot = { view: "toile" as const, at: 1, scene: "s42", el: 3, offset: 7 };
const base: SwitchInput = { from: "plan", to: "manuscrit", spot, picked: null, targetPending: false, exists: () => true };

describe("garder sa place en changeant de vue (#144)", () => {
  it("revient dans la vue d'écriture à la scène et au curseur gardés", () => {
    expect(placeOnSwitch(base)).toEqual({ kind: "open", scene: "s42", caret: { el: 3, offset: 7 } });
  });

  it("une scène choisie entre-temps l'emporte, ouverte à son début", () => {
    expect(placeOnSwitch({ ...base, picked: "s7" })).toEqual({ kind: "open", scene: "s7" });
    // Choisir la même scène garde le curseur.
    expect(placeOnSwitch({ ...base, picked: "s42" })).toEqual({ kind: "open", scene: "s42", caret: { el: 3, offset: 7 } });
  });

  it("une cible déjà demandée (recherche, clic sur une scène) l'emporte", () => {
    expect(placeOnSwitch({ ...base, targetPending: true })).toBeNull();
  });

  it("une scène disparue n'est pas rouverte", () => {
    expect(placeOnSwitch({ ...base, exists: () => false })).toBeNull();
    expect(placeOnSwitch({ ...base, spot: null })).toBeNull();
  });

  it("en quittant la vue d'écriture, le canevas et le Plan montrent la scène", () => {
    expect(placeOnSwitch({ ...base, from: "manuscrit", to: "toile" })).toEqual({ kind: "canvas", scene: "s42" });
    expect(placeOnSwitch({ ...base, from: "manuscrit", to: "plan" })).toEqual({ kind: "plan", scene: "s42" });
    expect(placeOnSwitch({ ...base, from: "manuscrit", to: "bible" })).toBeNull();
  });

  it("ailleurs, rien ne bouge (du Plan au canevas, scène sans carte)", () => {
    expect(placeOnSwitch({ ...base, from: "plan", to: "toile" })).toBeNull();
    expect(placeOnSwitch({ ...base, from: "manuscrit", to: "toile", spot: { ...spot, scene: "@12" } })).toBeNull();
  });

  it("du canevas au séquencier, la scène choisie sur le canevas est montrée (#153)", () => {
    const fromCanvas = { ...base, from: "toile" as const, to: "plan" as const };
    expect(placeOnSwitch({ ...fromCanvas, picked: "s7" })).toEqual({ kind: "plan", scene: "s7" });
    // Rien de choisi (ou plusieurs cartes), une scène disparue : rien ne bouge.
    expect(placeOnSwitch(fromCanvas)).toBeNull();
    expect(placeOnSwitch({ ...fromCanvas, picked: "s7", exists: () => false })).toBeNull();
    // Et du Plan au canevas, toujours rien.
    expect(placeOnSwitch({ ...base, from: "plan", to: "toile", picked: "s7" })).toBeNull();
  });
});
