// Images de la page web jouable (#125) : plus légères que celles des autres exports. WebP quand le navigateur de
// l'app sait l'écrire (pas WebKit, donc pas l'app Mac ni l'iPad : JPEG à la place), une image transparente reste
// transparente (WebP ou PNG), et une même image n'est gardée qu'une fois, sous un nom tiré de son contenu.
// `encodeWebImage` dessine dans un canvas ; le reste est pur.

import { fitWithin } from "../ai/image";
import { crc32 } from "../export/zip";
import { QUALITY_SETTINGS, type WebQuality } from "./webThemes";

export interface WebImage {
  data: Uint8Array;
  mime: "image/webp" | "image/jpeg" | "image/png";
  ext: "webp" | "jpg" | "png";
}

const fromDataUrl = (url: string) => Uint8Array.from(atob(url.split(",")[1] ?? ""), (c) => c.charCodeAt(0));

/** Format choisi pour une image : WebP s'il sait l'écrire, sinon PNG pour une image transparente, JPEG pour les autres. */
export function pickFormat(webp: boolean, transparent: boolean): WebImage["ext"] {
  if (webp) return "webp";
  return transparent ? "png" : "jpg";
}

/** Une image de medias/, réduite et réencodée selon la qualité choisie. */
export function encodeWebImage(url: string, quality: WebQuality): Promise<WebImage> {
  const { side, quality: q } = QUALITY_SETTINGS[quality];
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, side);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0, width, height);
      let transparent = false;
      try {
        const pixels = ctx.getImageData(0, 0, width, height).data;
        for (let i = 3; i < pixels.length; i += 4)
          if (pixels[i] < 255) {
            transparent = true;
            break;
          }
      } catch {
        // image d'une autre origine : traitée comme opaque
      }
      const webp = canvas.toDataURL("image/webp", q);
      const ext = pickFormat(webp.startsWith("data:image/webp"), transparent);
      if (ext === "webp") return resolve({ data: fromDataUrl(webp), mime: "image/webp", ext });
      if (ext === "png") return resolve({ data: fromDataUrl(canvas.toDataURL("image/png")), mime: "image/png", ext });
      // JPEG sans transparence : fond blanc, sinon les pixels transparents deviendraient noirs.
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      resolve({ data: fromDataUrl(canvas.toDataURL("image/jpeg", q)), mime: "image/jpeg", ext: "jpg" });
    };
    img.onerror = () => reject(new Error("image illisible"));
    img.src = url;
  });
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export interface WebImageSet {
  /** Chaque fichier une fois : nom de fichier (minuscules, sans espace) → image. */
  files: Record<string, WebImage>;
  /** Nom dans medias/ → nom de fichier. */
  byName: Record<string, string>;
}

/**
 * Range les images par contenu : deux noms de medias/ aux mêmes octets partagent un fichier. Le nom du fichier vient
 * de son contenu (crc32 en hexadécimal) : stable d'un export à l'autre, en minuscules, sans espace (itch.io).
 */
export function dedupeImages(images: Readonly<Record<string, WebImage>>): WebImageSet {
  const files: Record<string, WebImage> = {};
  const byName: Record<string, string> = {};
  for (const name of Object.keys(images).sort()) {
    const img = images[name];
    const base = crc32(img.data).toString(16).padStart(8, "0");
    let file = `${base}.${img.ext}`;
    for (let n = 2; files[file] && !sameBytes(files[file].data, img.data); n++) file = `${base}-${n}.${img.ext}`;
    files[file] ??= img;
    byName[name] = file;
  }
  return { files, byName };
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Adresse `data:` d'une image, pour la page en un seul fichier. */
export const dataUrl = (img: WebImage) => `data:${img.mime};base64,${toBase64(img.data)}`;

/** Poids d'une image dans la page : un tiers de plus en `data:` (base64), son poids réel dans l'archive. */
export const imageWeight = (img: WebImage, inline: boolean) => (inline ? Math.ceil(img.data.length / 3) * 4 : img.data.length);
