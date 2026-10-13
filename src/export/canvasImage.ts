// Image du canevas (PNG) et PDF qui la porte, standard (A4) ou grand format (A1). Chargé à la demande :
// html-to-image et pdf-lib n'entrent pas dans le paquet de démarrage.
//
// On dessine le calque des cartes et des fils de React Flow (`.react-flow__viewport`) à l'échelle voulue,
// sans la mini-carte ni les boutons. Les images des cartes sont des adresses `blob:` que html-to-image
// ne peut pas relire dans l'app de bureau (la CSP refuse `blob:` dans connect-src) : elles passent en
// `data:` le temps de la capture, puis reprennent leur adresse.

import { toCanvas } from "html-to-image";
import { imageSize, type Box, type ImageQuality } from "./canvas";

const PADDING = 40;

/** Remplace les images `blob:` du calque par des `data:` ; rend de quoi tout remettre. */
async function inlineBlobImages(root: HTMLElement): Promise<() => void> {
  const cache = new Map<string, string>();
  const swapped: [HTMLImageElement, string][] = [];
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("blob:")) continue;
    if (!cache.has(src)) {
      await img.decode().catch(() => undefined);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      cache.set(src, canvas.toDataURL("image/jpeg", 0.9));
    }
    swapped.push([img, src]);
    img.setAttribute("src", cache.get(src)!);
  }
  await Promise.all(swapped.map(([img]) => img.decode().catch(() => undefined)));
  return () => swapped.forEach(([img, src]) => img.setAttribute("src", src));
}

/**
 * Le temps de la capture, les textes indicatifs disparaissent (« Écris… », « Titre (facultatif) ») : l'image
 * montre ce que l'auteur a écrit, pas l'interface. Les cartes gardent leur taille (les fils en dépendent).
 */
function hidePlaceholders(root: HTMLElement): () => void {
  root.classList.add("is-capturing");
  const titles = [...root.querySelectorAll<HTMLTextAreaElement>("textarea[placeholder]")].filter((el) => !el.value);
  const saved = titles.map((el) => el.getAttribute("placeholder") ?? "");
  titles.forEach((el) => el.removeAttribute("placeholder"));
  return () => {
    root.classList.remove("is-capturing");
    titles.forEach((el, i) => el.setAttribute("placeholder", saved[i]));
  };
}

/** Fond du canevas, tel qu'il est affiché (clair ou sombre). */
function background(viewport: HTMLElement): string {
  for (let el: HTMLElement | null = viewport; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return getComputedStyle(document.body).backgroundColor || "#ffffff";
}

/** Le canevas entier dessiné dans un canvas : `bounds` en unités du canevas (cartes et cadres). */
export async function renderCanvas(viewport: HTMLElement, bounds: Box, quality: ImageQuality): Promise<HTMLCanvasElement> {
  const { width, height, scale } = imageSize(bounds, quality, PADDING);
  const restore = await inlineBlobImages(viewport);
  const reveal = hidePlaceholders(viewport);
  try {
    return await toCanvas(viewport, {
      width,
      height,
      pixelRatio: 1,
      backgroundColor: background(viewport),
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${(PADDING - bounds.x) * scale}px, ${(PADDING - bounds.y) * scale}px) scale(${scale})`,
        transformOrigin: "0 0",
      },
      // Ni points d'accroche, ni poignées : seulement ce qu'on lit.
      filter: (node) => !(node instanceof HTMLElement && (node.classList.contains("react-flow__handle") || node.classList.contains("react-flow__resize-control"))),
    });
  } finally {
    reveal();
    restore();
  }
}

const toBytes = async (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Uint8Array(await (await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas vide"))), type, quality))).arrayBuffer());

export const canvasPng = (canvas: HTMLCanvasElement) => toBytes(canvas, "image/png");

/** Pages en points : A4 pour le PDF standard, A1 pour le grand format ; orientation selon l'image. */
const PAGES: Record<ImageQuality, { long: number; short: number; margin: number }> = {
  standard: { long: 841.89, short: 595.28, margin: 24 },
  large: { long: 2383.94, short: 1683.78, margin: 48 },
};

/** PDF d'une page qui porte l'image du canevas, centrée et entière. */
export async function canvasPdf(canvas: HTMLCanvasElement, quality: ImageQuality, title: string): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("MondoWrite");
  // JPEG : bien plus léger qu'un PNG pour un grand tableau, et sans perte visible au format standard.
  const image = await pdf.embedJpg(await toBytes(canvas, "image/jpeg", quality === "large" ? 0.92 : 0.85));
  const { long, short, margin } = PAGES[quality];
  const landscape = canvas.width >= canvas.height;
  const [pw, ph] = landscape ? [long, short] : [short, long];
  const fit = Math.min((pw - margin * 2) / image.width, (ph - margin * 2) / image.height);
  const w = image.width * fit;
  const h = image.height * fit;
  pdf.addPage([pw, ph]).drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  return pdf.save();
}
