// Phrase d'accueil en tête de la page des projets : bonjour (selon l'heure), le prénom s'il est connu, puis une
// question ou un encouragement tiré des projets (celui qu'on a ouvert en dernier, depuis quand). Une phrase
// courte. Le choix entre les tournures dépend du jour et du moment, pas d'un tirage à chaque affichage : la
// phrase ne change pas sous les yeux, mais varie d'un jour à l'autre. Fonction pure.

import { fmt } from "./i18n";
import type { Messages } from "./i18n/fr";
import type { ProjectEntry } from "./storage/recents";

type GreetingMessages = Messages["home"]["greeting"];
export type DayPart = "morning" | "afternoon" | "evening" | "night";

const DAY = 24 * 60 * 60 * 1000;
/** Titre cité au plus (un titre plus long est coupé, la phrase reste courte). */
const MAX_TITLE = 42;

/** Moment de la journée : matin de 5 h à midi, après-midi jusqu'à 18 h, soir jusqu'à 23 h, puis la nuit. */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

/** Une tournure parmi plusieurs, la même toute la journée pour un moment donné. */
const pick = (list: readonly string[], seed: number) => list[Math.abs(seed) % list.length];

const shortTitle = (title: string) => (title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1).trimEnd()}…` : title);

/** Jours pleins entre deux dates, au calendrier (hier = 1, même si c'était il y a deux heures). */
function daysBetween(then: number, now: Date): number {
  const a = new Date(then);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(now) - start(a)) / DAY);
}

export function greeting(g: GreetingMessages, now: Date, firstName: string, projects: readonly ProjectEntry[]): string {
  const part = dayPart(now.getHours());
  const seed = now.getFullYear() * 400 + now.getMonth() * 32 + now.getDate() + ["morning", "afternoon", "evening", "night"].indexOf(part) * 7;
  const name = firstName.trim();
  const hello = fmt(pick(name ? g.hello[part] : g.helloAnon[part], seed), { name });

  const last = [...projects].filter((p) => p.openedAt > 0).sort((a, b) => b.openedAt - a.openedAt)[0];
  let follow: string;
  if (projects.length === 0) follow = pick(g.first, seed);
  else if (!last) follow = pick(g.free, seed);
  else {
    const title = shortTitle((last.title ?? "").trim() || last.name);
    const days = daysBetween(last.openedAt, now);
    if (days >= 7) follow = fmt(pick(g.back, seed), { title, days });
    else if (part === "night") follow = fmt(pick(g.night, seed), { title });
    else if (days === 0) follow = fmt(pick(g.again, seed), { title });
    // Une fois sur trois, l'invitation générale plutôt que le dernier projet.
    else follow = seed % 3 === 0 ? pick(g.free, seed) : fmt(pick(g.resume, seed), { title });
  }
  return `${hello} ${follow}`;
}
