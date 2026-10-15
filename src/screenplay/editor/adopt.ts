// Ce qui vient d'être écrit dans le scénario alimente le canevas : un en-tête de scène validé
// (suivi d'un autre élément) reçoit sa carte Scène et la carte de son décor, reliées par un fil ;
// un personnage qui parle reçoit sa carte Personnage. Rien n'est créé en double.
// Seuls les éléments écrits dans cette session sont concernés (attribut « known » absent) : une carte
// supprimée exprès n'est pas recréée, et un fichier venu d'ailleurs n'est pas transformé en cartes d'office.

import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { characterName, headingParts } from "../scenes";
import { fold, matchesCharacter, titleCase } from "./autocomplete";

export interface AdoptHost {
  /** Crée une carte sur le canevas et rend son identifiant. */
  addCard: (type: "scene" | "personnage" | "lieu", title: string) => string;
  /** Titres des cartes Personnage existantes (relus à chaque appel). */
  characterCards: () => string[];
  /** Cartes Décor existantes (relues à chaque appel). */
  locationCards: () => { id: string; title: string }[];
  /** Tire le fil « se passe à » entre une scène et son décor. */
  linkSceneToLocation: (sceneId: string, locationId: string) => void;
  locale: string;
}

/** Meta de la transaction qui pose les liens : ce n'est pas une frappe, rien à reconvertir pour elle. */
export const ADOPT_META = "cosmos:adopt";

/** Rend le document mis à jour, ou null s'il n'y avait rien à adopter. */
export function adoptNew(editor: Editor, host: AdoptHost): PMNode | null {
  const { doc } = editor.state;
  const tr = editor.state.tr;
  doc.forEach((node, offset, index) => {
    const type = node.type.name;
    const text = node.textContent.trim();
    if ((type !== "sceneHeading" && type !== "character") || node.attrs.known || text === "") return;
    const next = index + 1 < doc.childCount ? doc.child(index + 1).type.name : null;
    if (type === "sceneHeading" && next) {
      // Un en-tête encore seul en fin de texte est peut-être en cours de frappe : on attend la suite.
      const cardId = (node.attrs.cardId as string | null) || host.addCard("scene", text);
      tr.setNodeMarkup(offset, null, { ...node.attrs, cardId, known: true });
      // Son décor : seulement pour un en-tête standard (INT., EXT.…), un titre libre n'en désigne pas.
      const { prefix, location } = headingParts(text);
      if (prefix && location) {
        const place =
          host.locationCards().find((card) => fold(card.title) === fold(location))?.id ??
          host.addCard("lieu", titleCase(location.toLocaleUpperCase(host.locale), host.locale, true));
        host.linkSceneToLocation(cardId, place);
      }
    }
    if (type === "character" && (next === "dialogue" || next === "parenthetical")) {
      const name = characterName(text);
      if (name && !host.characterCards().some((title) => matchesCharacter(title, name))) {
        host.addCard("personnage", titleCase(name, host.locale));
      }
      tr.setNodeMarkup(offset, null, { ...node.attrs, known: true });
    }
  });
  if (!tr.docChanged) return null;
  editor.view.dispatch(tr.setMeta("addToHistory", false).setMeta(ADOPT_META, true));
  return editor.state.doc;
}
