// Textes des révisions de scénario (#18) : nom d'une passe, en-tête imprimé. Les clés de couleur du fichier ne se
// traduisent jamais ; seul leur libellé le fait.

import { fmt } from "./i18n";
import type { Messages } from "./i18n/fr";
import { colorFor, setOf, type RevColor, type Revisions } from "./screenplay/revisions";

/** « Révision bleue », ou « Révision bleue · Version tournage » si la passe a un nom. */
export function revisionName(t: Messages, r: Revisions, n: number, withLabel = true): string {
  const set = setOf(r, n);
  const color = t.revisions.colors[set?.color ?? colorFor(n)];
  return withLabel && set?.label ? fmt(t.revisions.nameWith, { color, label: set.label }) : fmt(t.revisions.name, { color });
}

/** Date AAAA-MM-JJ dans la langue (midi, pour qu'aucun fuseau ne la décale). */
export function revisionDateText(lang: string, date: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat(lang, { dateStyle: "short" }).format(d) : "";
}

/** En-tête imprimé sur les pages d'une passe : « Révision bleue - 03/11/2026 ». */
export function revisionHeader(t: Messages, lang: string, r: Revisions): (pass: number) => string {
  return (pass) => {
    const date = revisionDateText(lang, setOf(r, pass)?.date ?? "");
    return `${revisionName(t, r, pass, false)}${date ? ` - ${date}` : ""}`;
  };
}

/** Couleur CSS de la passe, depuis les jetons `--rev-<couleur>`. */
export const revisionVar = (color: RevColor) => `var(--rev-${color})`;
