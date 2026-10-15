// Import d'un fichier Fountain existant : il devient un projet scénario, avec ses cartes.
// Une carte Scène par en-tête (reliée par [[cosmos:id]]), une carte Personnage par nom qui parle,
// une carte Décor par lieu, et un fil « se passe à » entre chaque scène et son décor.
// Fonction pure : le fichier d'origine n'est jamais modifié, le projet en garde une copie.

import type { CardData, CardLayout, Link, Project } from "../types";
import { titleCase } from "./editor/autocomplete";
import { parse } from "./parse";
import type { Screenplay } from "./model";
import { characterName, headingParts } from "./scenes";

export interface ImportOptions {
  /** Nom du fichier importé : sert de titre si la page de titre n'en donne pas. */
  fileName: string;
  locale: string;
  /** Étiquette du fil scène → décor (i18n). */
  linkLabel: string;
  newId: () => string;
}

const COLUMNS = 5;
const STEP_X = 280;
const STEP_Y = 200;

export function importFountain(source: string, options: ImportOptions): Project {
  return importScreenplayModel(parse(source), options);
}

/** Un scénario déjà lu (Fountain, ou Final Draft par fdxImport.ts) → le projet. */
export function importScreenplayModel(screenplay: Screenplay, options: ImportOptions): Project {
  const upper = (s: string) => s.toLocaleUpperCase(options.locale);

  const titleKey = Object.keys(screenplay.titlePage).find((key) => key.trim().toLowerCase() === "title");
  const title =
    (titleKey ? screenplay.titlePage[titleKey].replace(/\s+/g, " ").trim() : "") ||
    options.fileName.replace(/\.[^.]+$/, "").trim();

  const characters = new Map<string, CardData>();
  const locations = new Map<string, CardData>();
  const scenes: CardData[] = [];
  const links: Link[] = [];

  const elements = screenplay.elements.map((el) => {
    if (el.type === "character") {
      const name = upper(characterName(el.text));
      if (name && !characters.has(name)) {
        characters.set(name, { id: options.newId(), type: "personnage", title: titleCase(name, options.locale), html: "" });
      }
      return el;
    }
    if (el.type !== "sceneHeading") return el;

    // Le synopsis Fountain qui suit l'en-tête (« = … ») reste dans le scénario : c'est celui de la carte.
    const card: CardData = { id: options.newId(), type: "scene", title: el.text, html: "" };
    scenes.push(card);

    const { prefix, location } = headingParts(el.text);
    if (prefix && location) {
      const key = upper(location);
      let place = locations.get(key);
      if (!place) {
        place = { id: options.newId(), type: "lieu", title: titleCase(key, options.locale, true), html: "" };
        locations.set(key, place);
      }
      links.push({ id: options.newId(), source: card.id, target: place.id, label: options.linkLabel });
    }
    // Un lien venu d'un autre projet MondoWrite ne vaut pas ici : la scène reçoit sa nouvelle carte.
    return { ...el, cardId: card.id };
  });

  // Sur le canevas : les personnages, puis les décors, puis les scènes dans l'ordre du scénario.
  const layout: CardLayout[] = [];
  let row = 0;
  for (const group of [[...characters.values()], [...locations.values()], scenes]) {
    group.forEach((card, i) => {
      layout.push({ id: card.id, x: 80 + (i % COLUMNS) * STEP_X, y: 80 + (row + Math.floor(i / COLUMNS)) * STEP_Y });
    });
    row += Math.ceil(group.length / COLUMNS);
  }

  return {
    meta: { version: 1, title, kind: "scenario", layout, links },
    cards: [...characters.values(), ...locations.values(), ...scenes],
    screenplay: { ...screenplay, elements },
  };
}
