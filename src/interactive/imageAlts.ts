// Description de chaque image d'une histoire, telle que l'auteur l'a écrite dans le texte de ses scènes (#126) :
// lue par la page web jouable et par « Lire l'histoire ». La première description trouvée l'emporte.

import { htmlToBlocks } from "../export/doc";

export function imageAlts(scenes: readonly { id: string }[], manuscript: Record<string, string | undefined>): Record<string, string> {
  const alts: Record<string, string> = {};
  for (const s of scenes)
    for (const b of htmlToBlocks(manuscript[s.id] ?? ""))
      if (b.kind === "image" && b.alt?.trim() && !alts[b.name]) alts[b.name] = b.alt.trim();
  return alts;
}
