// Garder sa place en changeant de vue (#144). La scène où l'on écrivait suit : en quittant le Manuscrit ou le
// Scénario, le canevas et le Plan (séquencier) montrent et choisissent sa carte ; en y revenant, le curseur
// retrouve sa place. Si l'on a choisi une autre scène entre-temps (une seule carte Scène choisie sur le canevas,
// une ligne de scène qui a le focus dans le Plan), c'est elle qui s'ouvre. La position est celle que relève déjà
// « Reprendre là où j'en étais » (resume.ts, relevée à chaque changement de vue) : rien de plus n'est gardé.

import type { View } from "./projectState";
import type { Spot } from "./resume";

export type PlaceAction =
  /** Ouvrir la vue d'écriture sur cette scène, au curseur gardé s'il y en a un. */
  | { kind: "open"; scene: string; caret?: { el?: number; offset: number } }
  /** Canevas : centrer et choisir la carte de la scène. */
  | { kind: "canvas"; scene: string }
  /** Plan ou séquencier : montrer la ligne de la scène. */
  | { kind: "plan"; scene: string };

export interface SwitchInput {
  from: View;
  to: View;
  /** Position relevée en quittant la vue d'avant (scène, élément, place). */
  spot: Spot | null;
  /** Scène choisie dans la vue qu'on quitte (canevas, Plan), s'il y en a une seule. */
  picked: string | null;
  /** Une cible est déjà demandée (recherche, « Aller à », un clic sur une scène) : elle l'emporte. */
  targetPending: boolean;
  /** La scène existe encore (carte Scène, ou `@` + rang d'un en-tête du scénario). */
  exists: (scene: string) => boolean;
}

/** Ce qu'il faut faire en arrivant dans une vue (pur) ; rien quand il n'y a pas de scène à suivre. */
export function placeOnSwitch({ from, to, spot, picked, targetPending, exists }: SwitchInput): PlaceAction | null {
  if (from === to) return null;
  if (to === "manuscrit") {
    if (targetPending) return null;
    if (picked && picked !== spot?.scene && exists(picked)) return { kind: "open", scene: picked };
    // Sans place relevée (curseur dans une autre scène que celle qu'on lisait), la scène s'ouvre à son début :
    // une place 0 tomberait sur le repère de la scène, que le livre compte encore dans la précédente.
    if (spot?.scene && exists(spot.scene)) return spot.offset === undefined ? { kind: "open", scene: spot.scene } : { kind: "open", scene: spot.scene, caret: { el: spot.el, offset: spot.offset } };
    return null;
  }
  // Seulement en quittant la vue d'écriture : passer du Plan au canevas ne déplace pas la vue du canevas.
  if (from !== "manuscrit") return null;
  // Une scène sans carte (`@` + rang) n'a ni carte ni ligne à montrer.
  const scene = spot?.scene;
  if (!scene || scene.startsWith("@") || !exists(scene)) return null;
  if (to === "toile") return { kind: "canvas", scene };
  if (to === "plan") return { kind: "plan", scene };
  return null;
}
