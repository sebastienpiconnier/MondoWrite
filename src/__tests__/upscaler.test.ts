import { describe, expect, it } from "vitest";
import { ORT_VERSION, TILE, TILE_PAD, fromPlanar, readUpscalerManifest, tileGrid, toPlanar } from "../upscaler";

const sha = "a".repeat(64);

describe("agrandisseur sur l'appareil (#78, lot 4)", () => {
  it("liste du site : modèle et moteur de cette version, sur le site, en https, empreinte et taille bornée", () => {
    const raw = { model: { file: "m.onnx", size: 100, sha256: sha }, runtime: { [ORT_VERSION]: { file: "ort.wasm", size: 200, sha256: sha.toUpperCase() } } };
    const m = readUpscalerManifest(raw);
    expect(m?.model.url).toBe("https://mondowrite.app/upscaler/m.onnx");
    expect(m?.runtime.sha256).toBe(sha);
    // Autre version de l'app : pas de moteur pour elle.
    expect(readUpscalerManifest({ ...raw, runtime: { "0.0.1": raw.runtime[ORT_VERSION] } })).toBeNull();
    // Ailleurs que sur le site, mauvaise extension, empreinte ou taille fausses : refusé.
    expect(readUpscalerManifest({ ...raw, model: { ...raw.model, file: "https://exemple.com/m.onnx" } })).toBeNull();
    expect(readUpscalerManifest({ ...raw, model: { ...raw.model, file: "m.js" } })).toBeNull();
    expect(readUpscalerManifest({ ...raw, model: { ...raw.model, sha256: "x" } })).toBeNull();
    expect(readUpscalerManifest({ ...raw, model: { ...raw.model, size: 1e9 } })).toBeNull();
    expect(readUpscalerManifest(null)).toBeNull();
  });

  it("tuiles : couvrent l'image sans se chevaucher, chacune lue avec sa marge dans l'image", () => {
    const w = 500;
    const h = 430;
    const tiles = tileGrid(w, h);
    const seen = new Uint8Array(w * h);
    for (const t of tiles) {
      expect(t.sx).toBeGreaterThanOrEqual(0);
      expect(t.sy).toBeGreaterThanOrEqual(0);
      expect(t.sx + t.sw).toBeLessThanOrEqual(w);
      expect(t.sy + t.sh).toBeLessThanOrEqual(h);
      expect(t.x - t.sx).toBeLessThanOrEqual(TILE_PAD);
      expect(t.w).toBeLessThanOrEqual(TILE);
      for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) seen[y * w + x]++;
    }
    expect(seen.every((n) => n === 1)).toBe(true);
    // Une tuile du milieu voit sa marge de tous les côtés.
    const mid = tiles.find((t) => t.x === TILE && t.y === TILE)!;
    expect(mid).toMatchObject({ sx: TILE - TILE_PAD, sy: TILE - TILE_PAD, sw: TILE + 2 * TILE_PAD, sh: TILE + 2 * TILE_PAD });
  });

  it("pixels : RGBA vers tenseur et retour, fenêtre gardée, valeurs bornées", () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 255, 10, 20, 30, 255]);
    const planar = toPlanar(rgba, 2, 1);
    expect(Array.from(planar).map((v) => Math.round(v * 255))).toEqual([255, 10, 0, 20, 128, 30]);
    const back = fromPlanar(planar, 2, 1, { x: 1, y: 0, w: 1, h: 1 });
    expect(Array.from(back)).toEqual([10, 20, 30, 255]);
    expect(Array.from(fromPlanar(new Float32Array([1.2, -0.1, 0.5]), 1, 1, { x: 0, y: 0, w: 1, h: 1 }))).toEqual([255, 0, 128, 255]);
  });
});
