// Dossier iCloud de l'app (conteneur partagé par le Mac, l'iPhone et l'iPad) : ce qu'on lit de son état. Fonctions pures.
//
// iCloud renomme un dossier quand deux appareils en créent un du même nom avant de s'être synchronisés : un Mac qui créait
// `projets` vide pendant que celui de l'iPhone n'était pas encore arrivé a ainsi fait naître « projets 2 », qui garde les
// vrais projets pendant que l'app lit le dossier vide (octobre 2026, 1.3.2). Le Mac ne crée donc plus ce dossier de
// lui-même, et l'accueil propose de ranger les projets d'un tel doublon.

/** Doublons créés par iCloud à côté de `projets` : « projets 2 », « projets 3 »… */
export const isStrayFolder = (name: string, base = "projets") => new RegExp(`^${base} \\d+$`).test(name);

/** Noms de dossiers doublons, du plus petit numéro au plus grand. */
export const strayFolders = (names: readonly string[], base = "projets") =>
  names.filter((n) => isStrayFolder(n, base)).sort((a, b) => Number(a.slice(base.length + 1)) - Number(b.slice(base.length + 1)));

/**
 * État des projets iCloud vus du Mac : « ok » (le dossier des projets est là), « waiting » (le dossier iCloud de l'app
 * est là, pas encore celui des projets : iCloud ne l'a pas encore apporté, on attend sans rien créer), « gone » (plus de
 * dossier iCloud de l'app : iCloud Drive coupé ou autre compte).
 */
export function macIcloudState(docsExists: boolean, projectsExists: boolean): "ok" | "waiting" | "gone" {
  if (projectsExists) return "ok";
  return docsExists ? "waiting" : "gone";
}

/** Nom libre pour un projet rangé dans `projets` quand ce nom y est déjà pris : « Titre (2) », « Titre (3) »… */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} (${i})`)) return `${name} (${i})`;
}
