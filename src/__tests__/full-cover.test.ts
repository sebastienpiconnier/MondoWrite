import { describe, expect, it } from "vitest";
import { BLOCKING, coverCrop, shadowPasses, inkOn, layoutFullCover, luminance, toHex, wrap, zoneInImage, type CoverMetrics, type CoverTexts, type FullCoverInput } from "../export/fullCover";
import { DEFAULT_COVER_DESIGN, cleanCoverDesign, coverDesignToMeta } from "../export/coverDesign";
import { INCH, coverLayout } from "../export/paperback";

/** Mesure simple : chaque caractère fait la moitié du corps. */
const m: CoverMetrics = { width: (s, _f, size) => [...s].length * size * 0.5 };

const texts: CoverTexts = { title: "Le Phare des Absents", author: "Claire Dumas", tagline: "Ils reviennent chaque nuit.", back: "Inès garde un phare.\nUne nuit, la lanterne s’éteint.", bio: "Claire Dumas vit en Bretagne." };
const input = (patch: Partial<FullCoverInput> = {}): FullCoverInput => ({ trim: "5x8", paper: "cream", pages: 240, design: DEFAULT_COVER_DESIGN, texts, image: { width: 2048, height: 3072 }, ...patch });
const inside = (b: { x: number; y: number; width: number; height: number }, x: number, y: number) => x >= b.x - 0.01 && x <= b.x + b.width + 0.01 && y >= b.y - 0.01 && y <= b.y + b.height + 0.01;

describe("couverture complète KDP (#78)", () => {
  it("réglages : relus prudemment, rien d'écrit tant qu'on n'a rien changé", () => {
    expect(cleanCoverDesign({ crop: "middle", back: "image", spineColor: "#ABCDEF", bio: false, other: 1 })).toEqual({ ...DEFAULT_COVER_DESIGN, back: "image", spineColor: "#abcdef", bio: false });
    expect(cleanCoverDesign({ spineColor: "red" }).spineColor).toBe("");
    expect(coverDesignToMeta(DEFAULT_COVER_DESIGN)).toBeUndefined();
    expect(coverDesignToMeta({ ...DEFAULT_COVER_DESIGN, titlePlace: "bottom" })).toEqual({ ...DEFAULT_COVER_DESIGN, titlePlace: "bottom" });
  });

  it("cadrage : l'image remplit le plat, coupée selon le réglage", () => {
    const target = { width: 2, height: 3 };
    expect(coverCrop({ width: 300, height: 300 }, target, "center")).toEqual({ sx: 50, sy: 0, sw: 200, sh: 300 });
    expect(coverCrop({ width: 200, height: 600 }, target, "top")).toEqual({ sx: 0, sy: 0, sw: 200, sh: 300 });
    expect(coverCrop({ width: 200, height: 600 }, target, "bottom")).toEqual({ sx: 0, sy: 300, sw: 200, sh: 300 });
    expect(coverCrop({ width: 200, height: 600 }, target, "center").sy).toBe(150);
    const zone = zoneInImage({ x: 10, y: 0, width: 5, height: 10 }, { x: 10, y: 0, width: 20, height: 30 }, { sx: 0, sy: 100, sw: 200, sh: 300 });
    expect(zone).toEqual({ sx: 0, sy: 100, sw: 50, sh: 100 });
  });

  it("résolution : 300 DPI demandés, sinon un avertissement (grave sous 200)", () => {
    const fine = layoutFullCover(input(), m);
    expect(fine.dpi).toBeGreaterThanOrEqual(300);
    expect(fine.checks.some((c) => c.kind === "lowRes")).toBe(false);
    const small = layoutFullCover(input({ trim: "6x9", image: { width: 1024, height: 1536 } }), m);
    expect(small.checks).toContainEqual({ kind: "lowRes", dpi: small.dpi, severe: true });
    expect(small.dpi).toBeLessThan(200);
    expect(layoutFullCover(input({ image: null }), m).checks).toContainEqual({ kind: "noImage" });
  });

  it("premier plat : titre et nom dans la zone sûre, à l'opposé l'un de l'autre ; rien quand ils sont déjà sur l'image", () => {
    const l = layoutFullCover(input(), m);
    const front = l.texts.filter((t) => t.panel === "front");
    expect(front.map((t) => t.text).join(" ")).toContain("CLAIRE DUMAS");
    for (const t of front) expect(inside(l.cover.safe[1], t.x, t.y)).toBe(true);
    const titleY = front.find((t) => t.font === "bold")!.y;
    const authorY = front.find((t) => t.text === "CLAIRE DUMAS")!.y;
    expect(titleY).toBeLessThan(authorY);
    const flipped = layoutFullCover(input({ design: { ...DEFAULT_COVER_DESIGN, titlePlace: "bottom" } }), m).texts.filter((t) => t.panel === "front");
    expect(flipped.find((t) => t.font === "bold")!.y).toBeGreaterThan(flipped.find((t) => t.text === "CLAIRE DUMAS")!.y);
    const onImage = layoutFullCover(input({ design: { ...DEFAULT_COVER_DESIGN, titleOnImage: true }, texts: { ...texts, title: "" } }), m);
    expect(onImage.texts.some((t) => t.panel === "front")).toBe(false);
    expect(onImage.checks.some((c) => c.kind === "noTitle")).toBe(false);
    expect(layoutFullCover(input({ texts: { ...texts, title: "" } }), m).checks).toContainEqual({ kind: "noTitle" });
  });

  it("dos : texte à partir de 80 pages, dans le dos et à distance de ses bords", () => {
    expect(layoutFullCover(input({ pages: 79 }), m).checks).toContainEqual({ kind: "noSpineText" });
    expect(layoutFullCover(input({ pages: 79 }), m).texts.some((t) => t.panel === "spine")).toBe(false);
    const l = layoutFullCover(input({ pages: 400 }), m);
    const spine = l.texts.filter((t) => t.panel === "spine");
    expect(spine.map((t) => t.text)).toEqual(["Le Phare des Absents", "Claire Dumas"]);
    for (const t of spine) {
      expect(t.rotate).toBe(-90);
      expect(t.x).toBeGreaterThan(l.cover.spine.x + 0.0625 * INCH - 0.01);
      expect(t.x + t.size * 0.64).toBeLessThan(l.cover.spine.x + l.cover.spine.width - 0.0625 * INCH + 0.01);
    }
    // 80 pages de papier blanc : 0,18 in de dos, le texte serait illisible, on n'en met pas (et on le dit).
    expect(layoutFullCover(input({ pages: 80, paper: "white" }), m).checks).toContainEqual({ kind: "spineTooThin" });
    expect(layoutFullCover(input({ pages: 120, paper: "cream" }), m).texts.some((t) => t.panel === "spine")).toBe(true);
  });

  it("quatrième : jamais sous le haut du code-barres ; trop long, l'enregistrement attend", () => {
    const l = layoutFullCover(input(), m);
    const back = l.texts.filter((t) => t.panel === "back");
    expect(back.length).toBeGreaterThan(3);
    for (const t of back) expect(t.y).toBeLessThan(l.cover.barcode.y);
    // Pas d'ISBN écrit à part : le code-barres de KDP le porte déjà.
    expect(l.texts.some((t) => t.text.includes("ISBN"))).toBe(false);
    const long = layoutFullCover(input({ texts: { ...texts, back: Array.from({ length: 40 }, () => "Une phrase assez longue pour remplir la quatrième de couverture.").join("\n") } }), m);
    const over = long.checks.find((c) => c.kind === "backOverflow");
    expect(over && over.kind === "backOverflow" && over.lines).toBeGreaterThan(0);
    expect(BLOCKING).toContain("backOverflow");
    expect(layoutFullCover(input({ texts: { ...texts, back: "" } }), m).checks).toContainEqual({ kind: "noBack" });
  });

  it("boîtes : quatrième, dos et premier plat couvrent toute la largeur", () => {
    const l = layoutFullCover(input(), m);
    const c = coverLayout("5x8", "cream", 240);
    expect(l.backBox.width + l.spineBox.width + l.frontBox.width).toBeCloseTo(c.width, 5);
    expect(l.frontBox.height).toBeCloseTo(c.height, 5);
  });

  it("ombre portée : décalée vers le bas à droite, douce, à l'échelle du corps", () => {
    const p = shadowPasses(40);
    expect(p).toHaveLength(17);
    const core = p[p.length - 1];
    expect(core.dx).toBeGreaterThan(0);
    expect(core.dy).toBeGreaterThan(0);
    expect(core.opacity).toBeGreaterThan(p[0].opacity);
    expect(shadowPasses(80)[16].dy).toBeCloseTo(core.dy * 2, 5);
    expect(cleanCoverDesign({}).shadow).toBe(true);
    expect(cleanCoverDesign({ shadow: false }).shadow).toBe(false);
  });

  it("encre lisible et couleurs", () => {
    expect(inkOn("#ffffff")).toBe("dark");
    expect(inkOn("#141b2d")).toBe("light");
    expect(luminance("#000000")).toBe(0);
    expect(toHex(255, 0, 127.6)).toBe("#ff0080");
    expect(wrap("un deux trois", 30, "regular", 10, m)).toEqual(["un", "deux", "trois"]);
    expect(wrap("anticonstitutionnellement", 30, "regular", 10, m)).toBeNull();
  });
});
