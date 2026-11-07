import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "../model";
import { LAYOUTS } from "../layout";
import { typeset } from "../export/typeset";
import { assignSceneNumbers, buildLock, nextLabel, pageLabels, resolveLock } from "../lockedPages";

const el = (type: ScreenplayElement["type"], text: string, extra: Partial<ScreenplayElement> = {}): ScreenplayElement => ({ type, text, ...extra }) as ScreenplayElement;
const strings = { more: "(MORE)", contd: "(CONT'D)" };
const layout = LAYOUTS.letter;

/** Un scénario de plusieurs pages : des scènes faites de petites actions. */
function script(scenes = 8, actions = 10): ScreenplayElement[] {
  const out: ScreenplayElement[] = [];
  for (let s = 1; s <= scenes; s++) {
    out.push(el("sceneHeading", `INT. LIEU ${s} - JOUR`));
    for (let a = 0; a < actions; a++) out.push(el("action", `Action ${s}.${a} ` + "lorem ipsum dolor sit amet ".repeat(8)));
  }
  return out;
}

describe("nextLabel", () => {
  it("ajoute puis incrémente la lettre", () => {
    expect(nextLabel("12")).toBe("12A");
    expect(nextLabel("12A")).toBe("12B");
    expect(nextLabel("12Z")).toBe("12AA");
    expect(nextLabel("13-14")).toBe("13-14A");
  });
});

describe("assignSceneNumbers", () => {
  it("numérote de 1 à n au verrouillage", () => {
    const out = assignSceneNumbers([el("sceneHeading", "A"), el("action", "x"), el("sceneHeading", "B")], true);
    expect(out.filter((e) => e.type === "sceneHeading").map((e) => e.sceneNumber)).toEqual(["1", "2"]);
  });
  it("une scène nouvelle prend le numéro précédent suivi d'une lettre", () => {
    const out = assignSceneNumbers([el("sceneHeading", "A", { sceneNumber: "12" }), el("sceneHeading", "B"), el("sceneHeading", "C"), el("sceneHeading", "D", { sceneNumber: "13" })]);
    expect(out.map((e) => e.sceneNumber)).toEqual(["12", "12A", "12B", "13"]);
  });
  it("saute un numéro déjà pris et commence à A1 avant la première", () => {
    const out = assignSceneNumbers([el("sceneHeading", "N"), el("sceneHeading", "A", { sceneNumber: "1" })]);
    expect(out[0].sceneNumber).toBe("A1");
    const same = [el("sceneHeading", "A", { sceneNumber: "1" })];
    expect(assignSceneNumbers(same)).toBe(same);
  });
});

describe("pages verrouillées", () => {
  const base = script();
  const pages = typeset(base, layout, "fr", strings);
  const lock = buildLock(pages, base);

  it("le PDF verrouillé redonne la même pagination, libellés 1, 2, 3…", () => {
    expect(pages.length).toBeGreaterThan(2);
    const plan = resolveLock(lock, base)!;
    const again = typeset(base, layout, "fr", strings, { lock: plan });
    expect(again.map((p) => p.start)).toEqual(pages.map((p) => p.start));
    expect(again.map((p) => p.label)).toEqual(pages.map((_, i) => String(i + 1)));
  });

  it("du texte ajouté dans une page déborde sur une page lettrée, la suivante garde son numéro", () => {
    const edited = [...base];
    for (let k = 0; k < 6; k++) edited.splice(1, 0, el("action", "ajout " + "lorem ipsum dolor sit amet ".repeat(8)));
    const plan = resolveLock(lock, edited)!;
    const out = typeset(edited, layout, "fr", strings, { lock: plan });
    const labels = out.map((p) => p.label);
    expect(labels[0]).toBe("1");
    // Les pages 1 et 2 d'origine n'en faisaient qu'une (paragraphe coupé) : le surplus prend la lettre suivante.
    expect(labels.slice(0, 4)).toEqual(["1", "2", "2A", "3"]);
    expect(labels).toContain("2A");
    // Chaque page verrouillée commence à son élément : la page 3 garde son numéro.
    const third = out.find((p) => p.label === "3")!;
    expect(third.start).toBe(plan.starts[1]);
  });

  it("une page dont l'élément a disparu se fond dans la précédente (« 1-3 »)", () => {
    const reduced = base.filter((_, i) => i !== lock[1].at);
    const plan = resolveLock(lock, reduced)!;
    expect(plan.labels[0]).toBe("1-3");
    expect(plan.starts).toHaveLength(lock.length - 1);
  });

  it("pageLabels : élément coupé = lettre suivante", () => {
    const plan = { starts: [0, 5], labels: ["1", "2"], more: [[], []] };
    expect(pageLabels(plan, [{ start: 0 }, { start: 3, cont: true }, { start: 5 }, { start: 5, cont: true }])).toEqual(["1", "1A", "2", "2A"]);
  });

  it("rien de verrouillé ou texte vide : pas de plan", () => {
    expect(resolveLock(null, base)).toBeNull();
    expect(resolveLock([], base)).toBeNull();
    expect(resolveLock(lock, [])).toBeNull();
  });
});
