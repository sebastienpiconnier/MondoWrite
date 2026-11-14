// Image du premier plat de la couverture complète (#78), préparée dans le navigateur : lue par une balise <img>
// (l'adresse blob: est permise aux images, pas aux requêtes), cadrée à la taille utile, réencodée en JPEG, et
// mesurée (couleur du bord pour le dos, lumière des zones du titre et du nom). Le fond flouté de la quatrième est
// fait en réduisant puis en agrandissant l'image : `ctx.filter` n'existe pas dans tous les WebKit.
// Chargé seulement à l'export (import dynamique), jamais dans les tests (Node n'a pas de canvas).

import { PRINT_DPI, toHex, zoneInImage, type Crop, type FullCoverLayout } from "./fullCover";
import { INCH } from "./paperback";

export interface CoverArt {
  /** Premier plat cadré, en JPEG ; null sans image. */
  front: { data: Uint8Array; width: number; height: number } | null;
  /** Fond flouté et assombri de la quatrième, en JPEG, aux proportions de la quatrième. */
  back: Uint8Array | null;
  /** Couleur moyenne du bord de l'image côté dos, « #rrggbb ». */
  edge: string | null;
  /** Couleur moyenne des zones du titre et du nom, et du fond flouté. */
  titleBg: string | null;
  authorBg: string | null;
  backBg: string | null;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image illisible"));
    img.src = url;
  });
}

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  return { canvas, ctx };
};

const jpeg = (canvas: HTMLCanvasElement, quality = 0.92) => {
  const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

/** Couleur moyenne d'une partie de l'image (réduite à 12 × 12 pour la mesurer). */
function average(img: HTMLImageElement, c: Crop): string {
  const { ctx } = canvasOf(12, 12);
  ctx.drawImage(img, c.sx, c.sy, Math.max(1, c.sw), Math.max(1, c.sh), 0, 0, 12, 12);
  const data = ctx.getImageData(0, 0, 12, 12).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = data.length / 4;
  return toHex(r / n, g / n, b / n);
}

/** Prépare l'image pour la mise en page `layout` : premier plat, mesures, et fond flouté si `blurBack`. */
export function prepareCoverArt(img: HTMLImageElement, layout: FullCoverLayout, blurBack: boolean): CoverArt {
  const crop = layout.crop;
  if (!crop) return { front: null, back: null, edge: null, titleBg: null, authorBg: null, backBg: null };
  // Pas plus de pixels que n'en demande l'impression (un peu de marge) : le PDF reste léger.
  const need = (layout.frontBox.width / INCH) * PRINT_DPI * 1.15;
  const scale = Math.min(1, need / crop.sw);
  const front = canvasOf(crop.sw * scale, crop.sh * scale);
  front.ctx.fillStyle = "#fff";
  front.ctx.fillRect(0, 0, front.canvas.width, front.canvas.height);
  front.ctx.imageSmoothingQuality = "high";
  front.ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, front.canvas.width, front.canvas.height);
  // Bord côté dos : la bande gauche du premier plat, hors fond perdu.
  const edge = average(img, { sx: crop.sx, sy: crop.sy, sw: crop.sw * 0.04, sh: crop.sh });
  const zone = (b: FullCoverLayout["titleZone"]) => (b ? average(img, zoneInImage(b, layout.frontBox, crop)) : null);
  let back: Uint8Array | null = null;
  let backBg: string | null = null;
  if (blurBack) {
    // Réduite très petite puis agrandie avec lissage : un flou doux partout, puis assombrie pour le texte.
    const tiny = canvasOf(18, (18 * layout.backBox.height) / layout.backBox.width);
    tiny.ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, tiny.canvas.width, tiny.canvas.height);
    const w = Math.round((layout.backBox.width / INCH) * 150);
    const big = canvasOf(w, (w * layout.backBox.height) / layout.backBox.width);
    big.ctx.imageSmoothingEnabled = true;
    big.ctx.imageSmoothingQuality = "high";
    big.ctx.drawImage(tiny.canvas, 0, 0, big.canvas.width, big.canvas.height);
    big.ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    big.ctx.fillRect(0, 0, big.canvas.width, big.canvas.height);
    back = jpeg(big.canvas, 0.88);
    const probe = big.ctx.getImageData(0, 0, big.canvas.width, big.canvas.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const step = 4 * 37;
    let n = 0;
    for (let i = 0; i < probe.length; i += step) {
      r += probe[i];
      g += probe[i + 1];
      b += probe[i + 2];
      n++;
    }
    backBg = toHex(r / n, g / n, b / n);
  }
  return {
    front: { data: jpeg(front.canvas), width: front.canvas.width, height: front.canvas.height },
    back,
    edge,
    titleBg: zone(layout.titleZone),
    authorBg: zone(layout.authorZone),
    backBg,
  };
}
