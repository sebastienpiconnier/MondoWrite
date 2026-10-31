// Lecture à voix haute (Scénario et Manuscrit) : ce qui se lit, par qui, et quelle voix du système pour chacun.
// Fonctions pures, testées ; le moteur (synthèse vocale du système) est dans components/useReader.ts.
// Les voix diffèrent d'un appareil à l'autre : le choix des voix est un réglage de l'appareil, jamais du projet.

import { characterName } from "./screenplay/scenes";
import { foldName } from "./review/names";

/** Un bloc du document (nœud de premier niveau de l'éditeur) : son type et son texte. */
export interface ReadNode {
  type: string;
  text: string;
}

/** Ce qu'on lit : le rang du bloc (pour le surligner), qui parle (null : le narrateur) et quoi. */
export interface Utterance {
  index: number;
  speaker: string | null;
  text: string;
}

export interface ReadingSettings {
  /** Voix du narrateur (identifiant `voiceURI` du système), "" : la première de la langue. */
  narrator: string;
  /** Voix de chaque personnage, par nom replié (« INÈS » et « Inès » ont la même). */
  voices: Record<string, string>;
  /** Vitesse, de 0,5 à 2 (1 : normale). */
  rate: number;
  /** Lire aussi les didascalies (« (bas) »), par le narrateur. */
  parentheticals: boolean;
}

export const DEFAULT_READING: ReadingSettings = { narrator: "", voices: {}, rate: 1, parentheticals: false };

export function readReading(raw: unknown): ReadingSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voices: Record<string, string> = {};
  if (r.voices && typeof r.voices === "object") {
    for (const [k, v] of Object.entries(r.voices as Record<string, unknown>)) if (typeof v === "string" && v && k.length <= 80) voices[k] = v.slice(0, 200);
  }
  const rate = typeof r.rate === "number" && Number.isFinite(r.rate) ? Math.min(2, Math.max(0.5, r.rate)) : 1;
  return { narrator: typeof r.narrator === "string" ? r.narrator.slice(0, 200) : "", voices, rate, parentheticals: r.parentheticals === true };
}

const PREFIXES: Record<string, Record<string, string>> = {
  fr: { "INT./EXT.": "Intérieur, extérieur", "EXT./INT.": "Extérieur, intérieur", "I/E": "Intérieur, extérieur", INT: "Intérieur", EXT: "Extérieur", EST: "Établissement" },
  en: { "INT./EXT.": "Interior, exterior", "EXT./INT.": "Exterior, interior", "I/E": "Interior, exterior", INT: "Interior", EXT: "Exterior", EST: "Establishing" },
};

/** Un en-tête lu comme une phrase : « INT. PHARE - NUIT » → « Intérieur. Phare. Nuit. » */
export function spokenHeading(text: string, lang: string): string {
  const words = PREFIXES[lang] ?? PREFIXES.en;
  const m = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.*)$/i.exec(text.trim());
  const key = m ? m[1].toUpperCase().replace(/\s+/g, "").replace(/\.$/, "") : "";
  const prefix = m ? (words[key] ?? words[`${key}.`] ?? words[key.replace(/\./g, "")] ?? "") : "";
  const rest = (m ? m[2] : text).replace(/#[^#]*#\s*$/, "").trim();
  const sentence = (s: string) => {
    const lower = s.trim().toLocaleLowerCase(lang);
    return lower ? `${lower[0].toLocaleUpperCase(lang)}${lower.slice(1)}` : "";
  };
  return [prefix, ...rest.split(/\s+[-–—]\s+/)].map(sentence).filter(Boolean).join(". ") + ".";
}

/**
 * Scénario : le narrateur lit en-têtes (en phrase), action et transitions ; chaque réplique est lue par la voix
 * de son personnage, une phrase à la fois. Les didascalies seulement sur demande ; notes (même au milieu d'une
 * ligne), texte mis de côté, synopsis et sections jamais.
 */
export function screenplayUtterances(nodes: ReadNode[], from: number, lang: string, parentheticals = false): Utterance[] {
  const out: Utterance[] = [];
  let speaker: string | null = null;
  // Le personnage d'une réplique qui commence avant le point de départ.
  for (let i = from - 1; i >= 0; i--) {
    const t = nodes[i].type;
    if (t === "character") {
      speaker = characterName(nodes[i].text);
      break;
    }
    if (t !== "dialogue" && t !== "parenthetical") break;
  }
  nodes.forEach((node, index) => {
    if (index < from) return;
    const text = unspoken(node.text);
    if (node.type === "character") speaker = characterName(text);
    if (!text) return;
    const say = (who: string | null, what: string) => {
      for (const part of sentences(what, lang)) out.push({ index, speaker: who, text: part });
    };
    if (node.type === "sceneHeading") out.push({ index, speaker: null, text: spokenHeading(text, lang) });
    else if (node.type === "action" || node.type === "transition") say(null, text);
    else if (node.type === "dialogue") say(speaker, text);
    else if (node.type === "parenthetical" && parentheticals) say(null, text.replace(/^\(|\)$/g, ""));
  });
  return out;
}

/** Ce qui ne se dit pas : notes [[…]] et texte mis de côté /* … *\/ (avec l'espace qui les précède). */
const unspoken = (text: string) =>
  text
    .replace(/\s*\[\[[\s\S]*?\]\]/g, "")
    .replace(/\s*\/\*[\s\S]*?\*\//g, "")
    .trim();

/** Au-delà, Chromium coupe parfois une énonciation (vers 15 s) : une phrase plus longue est découpée. */
const MAX_SPOKEN = 200;

/**
 * Un texte en phrases, pour lire une phrase à la fois (surlignage, pause, reprise) ; une phrase trop longue est
 * coupée à une virgule, un point-virgule ou deux-points, sinon à une espace, jamais au milieu d'un mot.
 */
export function sentences(text: string, lang: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  let parts: string[];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(lang, { granularity: "sentence" });
    parts = [...segmenter.segment(clean)].map((s) => s.segment.trim()).filter(Boolean);
  } else {
    parts = clean.split(/(?<=[.!?…]+[»”"’)]*)\s+/u).filter(Boolean);
  }
  return parts.flatMap((part) => {
    const out: string[] = [];
    let rest = part;
    while (rest.length > MAX_SPOKEN) {
      const head = rest.slice(0, MAX_SPOKEN + 1);
      const cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
      const at = cut > MAX_SPOKEN / 3 ? cut + 1 : head.lastIndexOf(" ");
      if (at <= 0) break;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
    return out;
  });
}

/** Roman : le narrateur lit chaque paragraphe (titres compris), phrase par phrase, à partir du bloc `from`. */
export function proseUtterances(nodes: ReadNode[], from: number, lang = "fr"): Utterance[] {
  return nodes.flatMap((node, index) =>
    index >= from && node.text.trim() && node.type !== "sceneMark" ? sentences(node.text, lang).map((text) => ({ index, speaker: null, text })) : [],
  );
}

/** Une voix du système, ce qu'on en garde. */
export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
}

/** Les voix de la langue (« fr-FR », « fr-CA » pour fr), sinon toutes. */
export const voicesFor = (voices: VoiceInfo[], lang: string) => {
  const same = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  return same.length > 0 ? same : voices;
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * La voix d'un personnage : celle choisie par l'auteur si elle existe sur cet appareil, sinon une voix de la langue
 * tirée de son nom (toujours la même pour lui), autre que celle du narrateur quand c'est possible.
 */
export function voiceForSpeaker(name: string | null, voices: VoiceInfo[], settings: ReadingSettings, lang: string): VoiceInfo | null {
  const pool = voicesFor(voices, lang);
  if (pool.length === 0) return null;
  const narrator = voices.find((v) => v.uri === settings.narrator) ?? pool[0];
  if (name === null) return narrator;
  const chosen = settings.voices[foldName(name)];
  const found = chosen ? voices.find((v) => v.uri === chosen) : undefined;
  if (found) return found;
  const others = pool.filter((v) => v.uri !== narrator.uri);
  const choices = others.length > 0 ? others : pool;
  return choices[hash(foldName(name)) % choices.length];
}
