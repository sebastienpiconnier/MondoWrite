// Exemple de roman interactif « Le Puits » : fichiers du projet fabriqués par scripts/examples/build-puits.mjs
// (src/assets/examples/puits.<langue>.json), chargés seulement quand l'auteur ouvre l'exemple.

import type { FileMap } from "../storage/paths";

export interface StoryExample {
  title: string;
  files: FileMap;
}

/** Fichiers de l'exemple dans la langue de l'interface (anglais), sinon en français. */
export async function puitsExample(lang: string): Promise<StoryExample> {
  void lang; // la version anglaise n'est pas encore là
  const data = (await import("../assets/examples/puits.fr.json")).default;
  return { title: data.title, files: data.files as FileMap };
}
