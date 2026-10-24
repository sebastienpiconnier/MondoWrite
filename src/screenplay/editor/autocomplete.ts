// Complétion dans l'éditeur de scénario : personnages (cartes et noms déjà utilisés), extensions
// (V.O., H.C.…), puis pour un en-tête de scène : préfixe → décor → moment.
// Fonctions pures : la vue fournit les données et affiche le résultat.

import type { ScreenplayElement } from "../model";
import { characterName, headingParts } from "../scenes";

export interface SuggestData {
  /** Titres des cartes Personnage et des cartes Lieu (Décor). */
  characterCards: string[];
  locationCards: string[];
  elements: ScreenplayElement[];
  /** Index de l'élément en cours d'écriture : son texte incomplet ne compte pas comme un nom connu. */
  currentIndex: number;
  locale: string;
  /** Vocabulaire de la langue courante (i18n). */
  moments: string[];
  extensions: { text: string; hint: string }[];
  labels: {
    character: string;
    location: string;
    moment: string;
    interior: string;
    exterior: string;
    both: string;
    newCard: string;
    /** Avec {name}. */
    createCharacter: string;
    createLocation: string;
  };
}

export interface Suggestion {
  key: string;
  label: string;
  hint: string;
  /** Nouveau texte de l'élément si on choisit cette suggestion. */
  text?: string;
  /** Ou bien : créer une carte, sans toucher au texte. */
  create?: { type: "personnage" | "lieu"; title: string };
}

export interface SuggestResult {
  items: Suggestion[];
  /** Suggestion présélectionnée (Entrée la choisit), ou -1 : Entrée garde son rôle habituel. */
  active: number;
}

const NONE: SuggestResult = { items: [], active: -1 };
const MAX = 6;

/** Comparaison sans casse ni accents : « ines » retrouve « INÈS ». */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// Petits mots laissés en minuscules au milieu d'un titre : « MAISON DE LA MÈRE » → « Maison de la Mère ».
// Les noms de personnes ne gardent que les particules (« Jean de Florette ») : « Le Bris », « Le Goff »
// sont des noms de famille.
const PARTICLES = new Set(["de", "du", "des", "d", "of", "von", "van", "da", "di", "del", "della"]);
const SMALL_WORDS = new Set([
  ...PARTICLES,
  ...["la", "le", "les", "l", "un", "une", "et", "à", "au", "aux", "en", "sur", "sous", "dans", "chez", "pour", "par", "avec", "vers"],
  ...["the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "by", "with", "from", "into"],
]);

// Mots élidés devant une apostrophe : le mot qui suit garde sa majuscule (« l’École », « d’Artagnan », « O’Brien »).
const ELISIONS = new Set(["l", "d", "j", "m", "n", "s", "t", "c", "qu", "jusqu", "lorsqu", "puisqu", "o"]);

/** « LE GARDIEN » → « Le Gardien » : titre de la carte créée depuis un nom en majuscules. Un lieu
 *  (`place`) garde aussi les articles et prépositions en minuscules, sauf en tête. */
export function titleCase(name: string, locale: string, place = false): string {
  const small = place ? SMALL_WORDS : PARTICLES;
  const up = (w: string) => w.replace(/(^|[-,])(\p{L})/gu, (_m, before: string, letter: string) => before + letter.toLocaleUpperCase(locale));
  let first = true;
  return name
    .toLocaleLowerCase(locale)
    .split(/(\s+)/)
    .map((word) => {
      if (!word.trim()) return word;
      const isFirst = first;
      first = false;
      // Élision : « l'auberge », « d'Artagnan » ; le mot qui suit l'apostrophe prend sa majuscule.
      // Seulement après une vraie élision (et O’Brien) : « GRANDMOTHER'S » donne « Grandmother's ».
      const elided = /^(\p{L}+)(['’])(.+)$/u.exec(word);
      if (elided && ELISIONS.has(elided[1])) {
        const head = small.has(elided[1]) && !isFirst ? elided[1] : up(elided[1]);
        return head + elided[2] + up(elided[3]);
      }
      return small.has(word) && !isFirst ? word : up(word);
    })
    .join("");
}

const ARTICLES = new Set(["LE", "LA", "LES", "UN", "UNE", "DES", "THE", "A", "AN"]);

/** Noms proposés pour une réplique, les plus utilisés d'abord. */
function characterCandidates(data: SuggestData): string[] {
  const count = new Map<string, number>();
  const add = (name: string, n: number) => {
    if (name) count.set(name, (count.get(name) ?? 0) + n);
  };
  data.elements.forEach((el, index) => {
    if (el.type === "character" && index !== data.currentIndex) add(characterName(el.text).toLocaleUpperCase(data.locale), 1);
  });
  for (const title of data.characterCards) {
    const full = title.trim().toLocaleUpperCase(data.locale);
    // « Hugo Le Bris » : on propose aussi « HUGO », le nom d'usage dans un scénario.
    const first = full.split(/\s+/)[0];
    if (full.includes(" ") && first.length >= 3 && !ARTICLES.has(first)) add(first, 0);
    add(full, 0);
  }
  return sorted(count, data.locale);
}

function locationCandidates(data: SuggestData): string[] {
  const count = new Map<string, number>();
  data.elements.forEach((el, index) => {
    if (el.type !== "sceneHeading" || index === data.currentIndex) return;
    const { prefix, location } = headingParts(el.text);
    // Un en-tête libre (titre de carte) n'est pas un décor.
    if (prefix && location) count.set(location.toLocaleUpperCase(data.locale), (count.get(location.toLocaleUpperCase(data.locale)) ?? 0) + 1);
  });
  for (const title of data.locationCards) {
    const name = title.trim().toLocaleUpperCase(data.locale);
    if (name && !count.has(name)) count.set(name, 0);
  }
  return sorted(count, data.locale);
}

const sorted = (count: Map<string, number>, locale: string) =>
  [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale)).map(([name]) => name);

/** Vrai aussi pour un début de nom (« HUGO L », « INÈS ») : on ne propose pas de créer ce qui existe. */
export const matchesCharacter = (cardTitle: string, name: string) => fold(cardTitle).startsWith(fold(name));
const hasCharacterCard = (data: SuggestData, name: string) =>
  data.characterCards.some((title) => matchesCharacter(title, name));

const hasLocationCard = (data: SuggestData, location: string) =>
  data.locationCards.some((title) => fold(title) === fold(location));

const fill = (template: string, name: string) => template.replace("{name}", name);

export function suggest(type: string, text: string, data: SuggestData): SuggestResult {
  if (type === "character") return suggestCharacter(text, data);
  if (type === "sceneHeading") return suggestHeading(text, data);
  return NONE;
}

function suggestCharacter(text: string, data: SuggestData): SuggestResult {
  const typed = text.toLocaleUpperCase(data.locale).trim();

  // Extension en cours : « HUGO ( », « HUGO (V ».
  const open = typed.lastIndexOf("(");
  if (open !== -1) {
    const base = typed.slice(0, open).trim();
    const partial = typed.slice(open);
    if (!base || partial.includes(")")) return NONE;
    const items = data.extensions
      .filter((ext) => fold(ext.text).startsWith(fold(partial)))
      .map((ext) => ({ key: `ext:${ext.text}`, label: `${base} ${ext.text}`, hint: ext.hint, text: `${base} ${ext.text}` }));
    return { items, active: items.length > 0 ? 0 : -1 };
  }

  const names = characterCandidates(data).filter((name) => fold(name).startsWith(fold(typed)));
  const exact = names.find((name) => fold(name) === fold(typed));
  const items: Suggestion[] = names
    .filter((name) => name !== exact)
    .slice(0, MAX)
    .map((name) => ({ key: `name:${name}`, label: name, hint: data.labels.character, text: name }));

  // Un seul personnage possible : on propose aussi ses extensions.
  const only = exact ?? (names.length === 1 ? names[0] : undefined);
  if (only) {
    for (const ext of data.extensions) {
      items.push({ key: `ext:${ext.text}`, label: `${only} ${ext.text}`, hint: ext.hint, text: `${only} ${ext.text}` });
    }
  }

  if (typed.length >= 2 && !hasCharacterCard(data, typed)) {
    const title = titleCase(typed, data.locale);
    items.push({
      key: "create",
      label: fill(data.labels.createCharacter, title),
      hint: data.labels.newCard,
      create: { type: "personnage", title },
    });
  }

  // Nom déjà complet, ou rien de tapé : Entrée passe au dialogue comme d'habitude.
  const complete = typed === "" || exact !== undefined || items[0]?.text === undefined;
  return { items, active: complete ? -1 : 0 };
}

const PREFIXES = ["INT.", "EXT.", "INT./EXT."];
const HEADING_RE = /^(INT\.?\/EXT\.?|INT\.?|EXT\.?|EST\.?|I\/E\.?)\s+(.*)$/;

function suggestHeading(text: string, data: SuggestData): SuggestResult {
  const typed = text.toLocaleUpperCase(data.locale).replace(/^\s+/, "");
  const match = HEADING_RE.exec(typed);

  // 1. Le préfixe. Un en-tête libre (titre venu d'une carte) ne propose rien.
  if (!match) {
    const start = typed.trim();
    if (!/^[A-Z./]*$/.test(start)) return NONE;
    const hints = [data.labels.interior, data.labels.exterior, data.labels.both];
    const items = PREFIXES.map((prefix, i) => ({ key: `prefix:${prefix}`, label: prefix, hint: hints[i], text: `${prefix} ` })).filter(
      (item) => item.label.startsWith(start),
    );
    return { items, active: start !== "" && items.length > 0 ? 0 : -1 };
  }

  const [, prefix, rest] = match;
  const cut = rest.lastIndexOf(" - ");

  // 2. Le décor.
  if (cut === -1) {
    const query = fold(rest);
    const all = locationCandidates(data);
    const found = [
      ...all.filter((name) => fold(name).startsWith(query)),
      ...all.filter((name) => !fold(name).startsWith(query) && fold(name).includes(query)),
    ].slice(0, MAX);
    const items = found.map((name) => ({
      key: `location:${name}`,
      label: name,
      hint: data.labels.location,
      text: `${prefix} ${name} - `,
    }));
    const exact = found.some((name) => fold(name) === query);
    return { items, active: query !== "" && !exact && items.length > 0 ? 0 : -1 };
  }

  // 3. Le moment, et la carte du décor si elle n'existe pas encore.
  const location = rest.slice(0, cut).trim();
  const head = `${prefix} ${location} - `;
  const query = fold(rest.slice(cut + 3));
  const moments = data.moments.filter((moment) => fold(moment).startsWith(query) && fold(moment) !== query);
  const items: Suggestion[] = moments.map((moment) => ({
    key: `moment:${moment}`,
    label: moment,
    hint: data.labels.moment,
    text: head + moment,
  }));
  if (location && !hasLocationCard(data, location)) {
    const title = titleCase(location, data.locale, true);
    items.push({
      key: "create",
      label: fill(data.labels.createLocation, title),
      hint: data.labels.newCard,
      create: { type: "lieu", title },
    });
  }
  return { items, active: query !== "" && moments.length > 0 ? 0 : -1 };
}
