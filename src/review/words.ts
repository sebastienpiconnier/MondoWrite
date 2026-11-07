// Fréquence des mots et répétitions proches (#21), pour l'onglet « Vérifier » du Manuscrit : les mots les plus
// employés (hors mots outils et noms propres) et un même mot revenu à quelques mots d'intervalle dans un
// paragraphe. Signaler, jamais corriger. Fonctions pures, sans IA ni réseau.

/** Mots outils de chaque langue (articles, pronoms, prépositions, auxiliaires, mots de liaison courants). */
const STOP: Record<"fr" | "en" | "es", string> = {
  fr: `a ai aie aient aies ait alors as au aucun aucune aupres auquel aura aurai auraient aurais aurait auras aurez auriez aurions aurons auront aussi autre autres aux avaient avais avait avant avec avez aviez avions avoir avons ayant ayez ayons bien c ca car ce ceci cela celle celles celui cependant certes ces cet cette ceux chaque chez ci comme comment d dans de des deja depuis dessous dessus deux devant doit donc dont du elle elles en encore entre es est et etaient etais etait etant ete etes etiez etions etre eu eue eues eurent eus eut eux fait faire fais faisait font fois furent fut ici il ils j jamais je jusqu jusque l la laquelle le lequel les lesquels leur leurs lui m ma mais me meme memes mes moi mon n ne ni non nos notre nous on ont ou par parce pas peu peut peuvent plus pour pourquoi puis puisque qu quand que quel quelle quelles quels qui quoi rien s sa sans se sera serai seraient serais serait seront ses si sien soi soient sois soit sommes son sont sous suis sur ta tandis te tes toi ton tous tout toute toutes tres tu un une unes uns va vais vers voila vont vos votre vous vu y deja dit dire dis disait fut ete etait avait aussi encore autant tant tellement trop toujours jamais souvent ainsi alors apres avant pendant depuis vraiment juste comme cela cet celle oui non`,
  en: `a about above after again against all am an and any are aren as at be because been before being below between both but by can cannot could did didn do does doesn doing don down during each few for from further had hadn has hasn have haven having he her here hers herself him himself his how i if in into is isn it its itself just let me more most my myself no nor not now of off on once only or other ought our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn we were weren what when where which while who whom why will with won would you your yours yourself yourselves said says say like back still even also one could would might must shall upon into onto just got get gets went go goes going come came yes no oh well`,
  es: `a al algo algunas algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era erais eran eras eres es esa esas ese eso esos esta estaba estaban estado estais estamos estan estar estas este esto estos estoy fue fueron fui fuimos ha habia habian han has hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otras otro otros para pero poco por porque que quien quienes se sea ser si sido siempre sin sobre sois solo somos son soy su sus tambien tanto te tenia tenian tengo ti tiene tienen todo todos tu tus un una uno unos vosotros y ya dijo dice decir asi aun aunque luego pues entonces despues ahora bien hacia mientras tan tal vez cada`,
};
const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(/\s+/).filter(Boolean))])) as Record<keyof typeof STOP, Set<string>>;

/** Mots outils de la langue (sa première partie : « fr-CA » → fr) ; une langue sans liste prend l'anglais. */
export function stopwordsFor(lang: string): Set<string> {
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return base in STOP_SETS ? STOP_SETS[base as keyof typeof STOP] : STOP_SETS.en;
}

/** Mot replié pour comparer : minuscules, sans accents (les listes de mots outils sont écrites sans). */
const foldCache = new Map<string, string>();
export function foldWord(w: string, lang: string): string {
  const key = `${lang}\u0000${w}`;
  let folded = foldCache.get(key);
  if (folded === undefined) {
    folded = w.toLocaleLowerCase(lang).normalize("NFD").replace(/\p{M}+/gu, "");
    if (foldCache.size > 50000) foldCache.clear();
    foldCache.set(key, folded);
  }
  return folded;
}

/** Forme commune d'un mot pour compter : « mains » et « main », « regards » et « regard » vont ensemble. */
export function stemWord(folded: string): string {
  return folded.length > 4 && /[sx]$/.test(folded) && !/(ss|us|is)$/.test(folded) ? folded.slice(0, -1) : folded;
}

/** Les mots d'un texte, avec leur place : lettres, apostrophes et traits d'union internes ; l'élision (« l’ombre ») est retirée. */
// Les mots d'un même texte ne sont découpés qu'une fois : « Vérifier » est recalculé à chaque changement du
// manuscrit, mais seule la scène qu'on écrit change.
const cache = new Map<string, { word: string; at: number }[]>();
const CACHE_MAX = 4000;
export function wordsOf(text: string): { word: string; at: number }[] {
  const known = cache.get(text);
  if (known) return known;
  const out = splitWords(text);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(text, out);
  return out;
}
function splitWords(text: string): { word: string; at: number }[] {
  const out: { word: string; at: number }[] = [];
  for (const m of text.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*/gu)) {
    let word = m[0];
    let at = m.index ?? 0;
    const elided = /^(?:[ldjmnstc]|qu|jusqu|lorsqu|puisqu|quoiqu)['’](?=\p{L})/iu.exec(word);
    if (elided) {
      word = word.slice(elided[0].length);
      at += elided[0].length;
    }
    out.push({ word, at });
  }
  return out;
}

/** Au moins autant de lettres pour compter : les mots très courts sont presque tous des mots outils. */
export const MIN_LETTERS = 4;
/** Fréquence : seulement à partir de ce nombre de mots dans le manuscrit (avant, rien ne ressort vraiment). */
export const FREQUENT_MIN_TOTAL = 1500;
/** Fréquence : les mots les plus employés montrés, et le nombre d'emplois sous lequel on ne montre rien. */
export const FREQUENT_TOP = 8;
export const FREQUENT_MIN_COUNT = 8;
/** Répétition proche : deux fois le même mot à moins de ce nombre de mots, dans un même paragraphe. */
export const REPEAT_WINDOW = 25;
/** Répétitions montrées au plus, par scène et en tout (au-delà, la liste ne sert plus). */
export const REPEAT_PER_SCENE = 6;
export const REPEAT_MAX = 60;

/**
 * Noms propres : les mots des titres des cartes (personnages, lieux…), et les mots écrits avec une capitale
 * au moins quatre fois sur cinq hors d'un début de phrase. Repliés.
 */
export function properNouns(texts: string[], cardTitles: string[], lang: string): Set<string> {
  const names = new Set<string>();
  for (const title of cardTitles) for (const { word } of wordsOf(title)) names.add(foldWord(word, lang));
  const seen = new Map<string, { caps: number; total: number }>();
  for (const text of texts) {
    for (const { word, at } of wordsOf(text)) {
      // Début de phrase, de ligne ou de réplique : la capitale y est obligatoire, elle ne dit rien.
      if (/(^|[.!?…«»“”"—–:\n-])\s*$/.test(text.slice(Math.max(0, at - 4), at))) continue;
      const key = foldWord(word, lang);
      const s = seen.get(key) ?? { caps: 0, total: 0 };
      s.total++;
      if (/^\p{Lu}/u.test(word)) s.caps++;
      seen.set(key, s);
    }
  }
  for (const [key, s] of seen) if (s.total >= 2 && s.caps / s.total >= 0.8) names.add(key);
  return names;
}

/** Mot qui compte : assez long, pas un mot outil, pas un nom propre. */
const counts = (folded: string, stop: Set<string>, names: Set<string>) => folded.length >= MIN_LETTERS && !stop.has(folded) && !names.has(folded) && !/\d/.test(folded);

/**
 * Les mots les plus employés du manuscrit (#21) : forme la plus fréquente de chaque mot, son nombre d'emplois, et
 * le total des mots. Vide sous `FREQUENT_MIN_TOTAL` mots ou si aucun mot n'atteint `FREQUENT_MIN_COUNT`.
 */
export function frequentWords(texts: string[], lang: string, names: Set<string>): { words: { word: string; count: number }[]; total: number } {
  const stop = stopwordsFor(lang);
  const tally = new Map<string, { count: number; forms: Map<string, number> }>();
  let total = 0;
  for (const text of texts) {
    for (const { word } of wordsOf(text)) {
      total++;
      const folded = foldWord(word, lang);
      if (!counts(folded, stop, names)) continue;
      const stem = stemWord(folded);
      const entry = tally.get(stem) ?? { count: 0, forms: new Map() };
      entry.count++;
      const form = word.toLocaleLowerCase(lang);
      entry.forms.set(form, (entry.forms.get(form) ?? 0) + 1);
      tally.set(stem, entry);
    }
  }
  if (total < FREQUENT_MIN_TOTAL) return { words: [], total };
  const words = [...tally.values()]
    .filter((e) => e.count >= FREQUENT_MIN_COUNT)
    .map((e) => ({ word: [...e.forms].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], lang))[0][0], count: e.count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, lang))
    .slice(0, FREQUENT_TOP);
  return { words, total };
}

export interface Repeat {
  /** Le mot tel qu'écrit la seconde fois. */
  word: string;
  /** Place de la première et de la seconde occurrence dans le texte. */
  first: number;
  second: number;
  /** Nombre de mots entre les deux. */
  gap: number;
}

/**
 * Répétitions proches dans un texte (#21) : un même mot (même forme commune) revenu à moins de `REPEAT_WINDOW`
 * mots, dans un même paragraphe (une ligne de `text`). Une répétition par mot et par paragraphe ; au plus `limit`.
 */
export function nearRepeats(text: string, lang: string, names: Set<string>, limit = REPEAT_PER_SCENE): Repeat[] {
  const stop = stopwordsFor(lang);
  const out: Repeat[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const words = wordsOf(line);
    const last = new Map<string, number>();
    const done = new Set<string>();
    words.forEach(({ word, at }, i) => {
      if (out.length >= limit) return;
      const folded = foldWord(word, lang);
      if (!counts(folded, stop, names)) return;
      const stem = stemWord(folded);
      const prev = last.get(stem);
      if (prev !== undefined && i - prev <= REPEAT_WINDOW && !done.has(stem)) {
        done.add(stem);
        out.push({ word, first: offset + words[prev].at, second: offset + at, gap: i - prev - 1 });
      }
      last.set(stem, i);
    });
    offset += line.length + 1;
  }
  return out;
}
