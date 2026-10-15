// Signets d'un PDF (le sommaire que montre le lecteur de PDF à côté des pages) : une entrée par chapitre.
// pdf-lib n'a pas de fonction pour cela : on écrit le dictionnaire /Outlines à la main.
// Chargé seulement avec les modules PDF (import dynamique).

import { PDFDocument, PDFHexString, PDFName, type PDFRef } from "pdf-lib";

export function addOutline(pdf: PDFDocument, items: { title: string; page: number }[]) {
  const pages = pdf.getPages();
  const entries = items.filter((i) => i.title.trim() && pages[i.page]);
  if (entries.length === 0) return;
  const ctx = pdf.context;
  const root = ctx.nextRef();
  const refs: PDFRef[] = entries.map(() => ctx.nextRef());
  entries.forEach((item, i) => {
    ctx.assign(
      refs[i],
      ctx.obj({
        Title: PDFHexString.fromText(item.title.trim()),
        Parent: root,
        Dest: [pages[item.page].ref, "XYZ", null, null, null],
        ...(i > 0 ? { Prev: refs[i - 1] } : {}),
        ...(i < entries.length - 1 ? { Next: refs[i + 1] } : {}),
      }),
    );
  });
  ctx.assign(root, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: entries.length }));
  pdf.catalog.set(PDFName.of("Outlines"), root);
  pdf.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}
