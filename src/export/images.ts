// Images d'un document à exporter : lues dans medias/ par une balise <img> (comme pour l'IA, l'adresse
// blob: est permise aux images, pas aux requêtes), réduites et réencodées en JPEG. Tous les formats
// (PDF, Word) n'ont ainsi qu'une sorte d'image à intégrer.

import { fitWithin } from "../ai/image";
import { docImageNames, type DocImage, type ExportDoc } from "./doc";

const EXPORT_SIDE = 1600;

function toJpeg(url: string): Promise<DocImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, EXPORT_SIDE);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      // Fond blanc : un PNG transparent ne devient pas noir en JPEG.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
      resolve({ data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), width, height });
    };
    img.onerror = () => reject(new Error("image illisible"));
    img.src = url;
  });
}

/** Images lues dans medias/ et réencodées en JPEG ; une image manquante ou illisible est absente du résultat. */
export async function loadImages(names: Iterable<string>, mediaUrl: (name: string) => Promise<string | null>): Promise<Record<string, DocImage>> {
  const images: Record<string, DocImage> = {};
  for (const name of new Set(names)) {
    const url = await mediaUrl(name).catch(() => null);
    if (!url) continue;
    try {
      images[name] = await toJpeg(url);
    } catch {
      // ignorée
    } finally {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
  }
  return images;
}

/** Le document avec ses images chargées ; une image manquante ou illisible est simplement laissée de côté. */
export async function withImages(doc: ExportDoc, mediaUrl: (name: string) => Promise<string | null>): Promise<ExportDoc> {
  return { ...doc, images: await loadImages(docImageNames(doc), mediaUrl) };
}
