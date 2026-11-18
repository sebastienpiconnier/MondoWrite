// Images de l'exemple « Le Puits » (gravures générées pour l'exemple, prompts dans docs/exemple-puits-images.md),
// chargées seulement à sa création : hors du paquet de démarrage. En `?inline` (adresses data:), sans requête réseau,
// comme les gravures du Petit Chaperon rouge (demoMedia.ts).

import cour from "../assets/examples/puits/puits-01-cour.jpg?inline";
import lanterne from "../assets/examples/puits/puits-02-lanterne.jpg?inline";
import echelle from "../assets/examples/puits/puits-03-echelle.jpg?inline";
import niche from "../assets/examples/puits/puits-04-niche.jpg?inline";
import paul from "../assets/examples/puits/puits-05-paul.jpg?inline";
import matin from "../assets/examples/puits/puits-06-matin.jpg?inline";
import carnet from "../assets/examples/puits/puits-07-carnet.jpg?inline";
import courDEnBas from "../assets/examples/puits/puits-08-cour-d-en-bas.jpg?inline";
import celuiQuiBoit from "../assets/examples/puits/puits-09-celui-qui-boit.jpg?inline";
import couverture from "../assets/examples/puits/puits-10-couverture.jpg?inline";

const IMAGES: Record<string, string> = {
  "puits-01-cour.jpg": cour,
  "puits-02-lanterne.jpg": lanterne,
  "puits-03-echelle.jpg": echelle,
  "puits-04-niche.jpg": niche,
  "puits-05-paul.jpg": paul,
  "puits-06-matin.jpg": matin,
  "puits-07-carnet.jpg": carnet,
  "puits-08-cour-d-en-bas.jpg": courDEnBas,
  "puits-09-celui-qui-boit.jpg": celuiQuiBoit,
  "puits-10-couverture.jpg": couverture,
};

/** Octets d'une adresse data: en base64. */
function bytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Fichiers à écrire dans medias/ : nom → octets. */
export function puitsMedia(): [string, Uint8Array][] {
  return Object.entries(IMAGES).map(([name, url]) => [name, bytes(url)]);
}
