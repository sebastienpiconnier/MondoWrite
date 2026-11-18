// Exemple de roman interactif « Le Puits » : fichiers du projet fabriqués par scripts/examples/build-puits.mjs
// (src/assets/examples/puits.<langue>.json), chargés seulement quand l'auteur ouvre l'exemple.

import type { FileMap } from "../storage/paths";

export interface StoryExample {
  title: string;
  files: FileMap;
}

/** Fichiers de l'exemple dans la langue de l'interface : français pour le français, anglais pour toute autre langue. */
export async function puitsExample(lang: string): Promise<StoryExample> {
  const data = lang === "fr" ? (await import("../assets/examples/puits.fr.json")).default : (await import("../assets/examples/puits.en.json")).default;
  return { title: data.title, files: data.files as FileMap };
}
