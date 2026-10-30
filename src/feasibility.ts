// Libellés de la couverture selon la forme du projet, et faisabilité d'un film tirée du scénario.
// Fonctions pures : la couverture, « Questionner » et l'export de la Bible lisent les mêmes.
//
// La faisabilité n'est qu'une proposition : la couverture la montre tant que l'auteur n'a rien écrit dans le
// champ, et le PDF l'imprime de même ; dès qu'il l'écrit ou la modifie, c'est son texte qui compte.

import type { Messages } from "./i18n/fr";
import { fmt } from "./i18n";
import type { PitchText, ProjectForm } from "./pitch";
import type { ScreenplayElement } from "./screenplay/model";
import type { CardData } from "./types";
import type { Pagination } from "./screenplay/paginate";
import { listScenes } from "./screenplay/scenes";
import { screenplayPlaces, settingSummary } from "./review/places";
import { screenplayReport } from "./review/report";
import { titleCase } from "./screenplay/editor/autocomplete";

type PitchMessages = Messages["pitch"];

/** Libellés, textes indicatifs et questions d'un champ, selon la forme (« Ce qu'il n'est pas » pour un film). */
export function pitchLabels(p: PitchMessages, form: ProjectForm) {
  const film = form === "film";
  const mini = form === "miniserie";
  return {
    fields: { ...p.fields, ...(film ? p.filmFields : mini ? p.miniFields : {}) } as Record<PitchText, string> & PitchMessages["fields"],
    placeholders: { ...p.placeholders, ...(film ? p.filmPlaceholders : mini ? p.miniPlaceholders : {}) } as Record<PitchText, string>,
    questions: { ...p.questions, ...(film ? p.filmQuestions : mini ? p.miniQuestions : {}) } as Record<PitchText, string>,
  };
}

/** Décors principaux cités dans la faisabilité, au plus. */
const MAIN_PLACES = 3;

/**
 * Faisabilité d'un film d'après son scénario : scènes, pages, décors, intérieur et extérieur, jour et nuit,
 * rôles parlants, décors principaux. Une ligne par chiffre. Vide tant que le scénario n'a pas de scène.
 */
export function feasibilityText(
  elements: ScreenplayElement[],
  cards: CardData[],
  pagination: Pagination | null,
  p: PitchMessages,
  locale = "fr",
): string {
  const scenes = listScenes(elements).length;
  if (scenes === 0) return "";
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  // Pluriel simple, le même en français et en anglais pour ces mots (« 1 décor », « 2 décors »).
  const pl = (n: number) => (n > 1 || (n === 0 && !locale.startsWith("fr")) ? "s" : "");
  const f = p.feasibility;
  const pages = pagination?.pages ?? 0;
  const summary = settingSummary(elements);
  const places = screenplayPlaces(elements, cards, pagination, locale).filter((r) => r.scenes > 0);
  const roles = screenplayReport(elements, cards, locale).filter((r) => r.lines > 0).length;
  const main = [...places]
    .sort((a, b) => b.scenes - a.scenes || b.pages - a.pages)
    .slice(0, MAIN_PLACES)
    // Un nom écrit en capitales (en-tête de scène) se lit comme un titre : « Grand Bourbier de Grimpen ».
    .map((r) => fmt(f.place, { name: r.name === r.name.toUpperCase() ? titleCase(r.name, locale, true) : r.name, n: num(r.scenes) }));
  return [
    fmt(f.scenes, { scenes: num(scenes), s: pl(scenes), pages: num(pages), p: pl(pages), minutes: num(Math.max(1, Math.round(pages))) }),
    fmt(f.places, { n: num(places.length), s: pl(places.length), int: num(summary.int), si: pl(summary.int), ext: num(summary.ext) }),
    fmt(f.moments, { day: num(summary.day), s: pl(summary.day), night: num(summary.night) }),
    roles > 0 ? fmt(f.roles, { n: num(roles), s: pl(roles) }) : "",
    main.length > 0 ? fmt(f.main, { list: main.join(", ") }) : "",
  ]
    .filter(Boolean)
    .join("\n");
}
