// Branchement de « Garder sa place » (#144, keepPlace.ts) sur le store : appelé par App à chaque changement de
// vue, après le relevé de la position (captureSpot). Les gestes d'affichage (centrer, choisir, montrer la ligne)
// partent après le rendu : la vue d'arrivée n'est pas encore là quand la vue change.

import { placeOnSwitch } from "../keepPlace";
import { readSpot, type Spot } from "../resume";
import { storage } from "../storage";
import { SCENE_AT, useCosmos, type CosmosState } from "../store";
import type { View } from "../projectState";
import { revealPlanRow } from "./revealRow";
import { episodeAt, episodeOfCard } from "../screenplay/series";

const shown = (v: View): View => (v === "carnet" ? "toile" : v);

/** Scène choisie dans la vue qu'on quitte : une seule carte Scène sur le canevas, ou la ligne qui a le focus. */
function pickedIn(view: View, s: CosmosState): string | null {
  if (view === "toile") {
    const chosen = s.nodes.filter((n) => n.selected);
    return chosen.length === 1 && chosen[0].data.type === "scene" ? chosen[0].id : null;
  }
  if (view === "plan") {
    const row = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>(".sequencer [data-scene]") : null;
    return row?.dataset.scene ?? null;
  }
  return null;
}

// Place quittée dans la vue d'écriture pendant cette séance du projet. La position de « Reprendre » vient aussi
// des séances d'avant : à l'ouverture d'un projet, la vue d'écriture s'ouvre comme avant (série : tout le
// scénario), seul le bouton « Reprendre là où j'en étais » y remet le curseur.
let left: Spot | null = null;

/** Un projet vient de s'ouvrir : rien n'a encore été quitté. */
export function forgetPlace() {
  left = null;
}

export function keepPlace(s: CosmosState, prev: CosmosState) {
  const from = shown(prev.view);
  const to = shown(s.view);
  const scenario = s.kind === "scenario";
  const spot = readSpot(storage.current?.() ?? "");
  if (from === "manuscrit") left = spot;
  const action = placeOnSwitch({
    from,
    to,
    spot: to === "manuscrit" ? left : spot,
    // La vue qu'on quitte est encore affichée : sa sélection se lit maintenant.
    picked: pickedIn(from, prev),
    // « Écrire l'épisode » (série) choisit l'épisode en même temps que la vue : c'est lui qu'on veut voir.
    targetPending: !!s.manuscriptTarget || s.currentEpisode !== prev.currentEpisode,
    exists: (id) => {
      const known = id.startsWith(SCENE_AT)
        ? scenario && Number(id.slice(SCENE_AT.length)) < (s.screenplay?.elements.length ?? 0)
        : s.nodes.some((n) => n.id === id && n.data.type === "scene");
      if (!known || !scenario || !s.currentEpisode || to !== "manuscrit") return known;
      // Série, un épisode ouvert : on ne quitte pas l'épisode pour une scène d'un autre.
      const full = s.screenplay;
      const episode = id.startsWith(SCENE_AT) ? episodeAt(full, Number(id.slice(SCENE_AT.length))) : episodeOfCard(full, id);
      return !episode || episode === s.currentEpisode;
    },
  });
  if (!action) return;
  queueMicrotask(() => {
    const st = useCosmos.getState();
    if (shown(st.view) !== to) return;
    if (action.kind === "open") st.openInManuscript(action.scene, undefined, action.caret);
    else if (action.kind === "canvas") {
      // Centrée (focusId, comme « Voir sur le canevas ») et choisie, sans estomper les autres cartes.
      if (!st.focusId) useCosmos.setState({ focusId: action.scene, nodes: st.nodes.map((n) => (n.selected === (n.id === action.scene) ? n : { ...n, selected: n.id === action.scene })) });
    } else {
      // La ligne n'existe qu'une fois le Plan dessiné : quelques images d'attente.
      let tries = 0;
      const show = () => {
        if (shown(useCosmos.getState().view) !== "plan") return;
        if (!revealPlanRow(action.scene, false) && tries++ < 20) requestAnimationFrame(show);
      };
      requestAnimationFrame(show);
    }
  });
}
