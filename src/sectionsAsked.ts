// « Ce texte a N sections : les lire comme actes et séquences ? » (#155) : demandé une fois par projet, sur cet
// appareil. Un réglage de l'appareil, jamais du projet (rien n'est écrit dans le projet sans un clic).

const KEY = "mondowrite.sections.asked";
const LIMIT = 200;

function read(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** La question a déjà été posée (réponse donnée) pour ce projet. */
export const sectionsAsked = (project: string): boolean => read().includes(project);

/** Ne plus la poser pour ce projet. */
export function markSectionsAsked(project: string): void {
  const list = read().filter((x) => x !== project);
  list.push(project);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-LIMIT)));
  } catch {
    // Stockage refusé : elle reviendra à la prochaine ouverture.
  }
}
