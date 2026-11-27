// Trouver les personnages du texte (#172) : l'IA lit les scènes par paquets et propose les personnages qu'elle y
// trouve (nom, autres noms, scènes, faits cités). Fonctions pures, testées (cast.test.ts).
// Règle du produit : l'IA propose, l'auteur décide. Tout ce qui revient du modèle passe par `parseCast` : un nom qui
// n'est pas écrit dans le paquet est écarté, une proposition sans passage retrouvé mot pour mot (`quoteIn`) aussi,
// une scène n'est gardée que si son texte nomme le personnage, et jamais de rôle (principal, secondaire : un choix de
// l'auteur). La consigne est recopiée dans docs/prompts-ia.md (section « Trouver les personnages ») : la tenir à jour.

import type { CardData, ProjectKind } from "../types";
import { namesOf } from "../manuscript";
import { foldName, similarNames } from "../review/names";
import { extractJson, language, type Prompt } from "./tasks";
import { quoteIn } from "./structure";

/** Une scène lue : sa carte (ou « #3 » pour une scène de scénario sans carte), son titre, son texte en paragraphes. */
export interface CastScene {
  id: string;
  title: string;
  paragraphs: string[];
  /** Scénario : noms de ceux qui parlent (éléments personnage). Absent pour un roman (l'IA le dit). */
  speakers?: string[];
}

/** Une scène dans un paquet : sa référence pour l'IA (« s3 », propre à la lecture) et son texte. */
export interface CastPacketScene extends CastScene {
  ref: string;
  text: string;
}
export interface CastPacket {
  scenes: CastPacketScene[];
  /** Ce que reçoit l'IA : chaque scène précédée de sa référence entre crochets. */
  text: string;
}

/** Taille d'un paquet, en caractères, et nombre de paquets lus au plus. */
export const CAST_PACKET = 9000;
export const CAST_MAX_PACKETS = 15;
/** Faits qu'une lecture peut proposer pour une fiche nouvelle : jamais le rôle, ni une interprétation. */
export const CAST_FIELDS = ["genre", "age", "metier", "origine", "apparence"] as const;
export type CastField = (typeof CAST_FIELDS)[number];
/** Autres noms gardés au plus par personnage. */
export const CAST_VARIANTS = 6;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const oneLine = (s: string, max: number) => {
  const line = s
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^["«“]\s*|\s*["»”]$/g, "")
    .trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};
/** Repli d'un texte pour chercher un nom : minuscules, sans accents, apostrophes droites. */
const foldWords = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Le texte (replié) nomme-t-il ce nom (replié), en mot entier ? Un trait d'union lie deux mots. */
const names = (text: string, name: string) => !!name && new RegExp(`(?<![\\p{L}\\p{N}]-?)${escape(name)}(?!-?[\\p{L}\\p{N}])`, "u").test(text);
/** Clé d'un nom pour comparer deux propositions (casse, accents, tirets). */
export const castKey = (name: string) => foldName(name);

/** Les scènes en paquets d'au plus `size` caractères ; une scène trop longue est abrégée, jamais coupée en deux. */
export function castPackets(scenes: CastScene[], size = CAST_PACKET): CastPacket[] {
  const out: CastPacket[] = [];
  let current: CastPacketScene[] = [];
  let length = 0;
  const flush = () => {
    if (current.length === 0) return;
    out.push({ scenes: current, text: current.map((s) => `[${s.ref}] ${s.title}\n${s.text}`.trim()).join("\n\n") });
    current = [];
    length = 0;
  };
  scenes.forEach((scene, i) => {
    let text = scene.paragraphs.join("\n");
    if (!text.trim()) return;
    if (text.length > size) text = text.slice(0, size);
    const ref = `s${i + 1}`;
    const cost = text.length + scene.title.length + ref.length + 6;
    if (current.length > 0 && length + cost > size) flush();
    current.push({ ...scene, ref, text });
    length += cost;
  });
  flush();
  return out;
}

/** Un personnage déjà dans la Bible, tel que l'IA le reçoit. */
export interface KnownCharacter {
  name: string;
  others: string[];
}
export const knownCharacters = (cards: CardData[]): KnownCharacter[] =>
  cards
    .filter((c) => c.type === "personnage" && c.title.trim())
    .map((c) => ({
      name: c.title.trim(),
      others: (c.fiche?.surnoms ?? "")
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    }));

export function castPrompt(packet: CastPacket, known: KnownCharacter[], fields: { key: CastField; label: string }[], lang: string, kind: ProjectKind): Prompt {
  return {
    system:
      `You help a writer find the characters of their own ${kind === "scenario" ? "screenplay" : "novel"}. You read excerpts of scenes; each scene starts with its reference in brackets, like [s3]. ` +
      `List every character of the excerpts: a person, or a named animal or creature, who acts, speaks or is named. Not places, objects, groups, nor an unnamed narrator. ` +
      `Characters already in the writer's story bible are listed in "known": include them too, under their known name, so the writer can link them to these scenes. ` +
      `For each character: "name", the fullest name the excerpts use, copied as written; "variants", the other ways the excerpts name the same person (first name alone, nickname, a title such as "the Wolf"), copied as written; ` +
      `"scenes", the references of the scenes where the character is present or named, each with "speaks": true only if the character speaks in that scene; ` +
      `"quote", the exact words of the excerpts (5 to 30 words, copied word for word) where the name appears; ` +
      `"facts", only what the excerpts state clearly for the fields listed in "fields", each with "field" (the key as given), "value" (a short note in ${language(lang)}, a few words) and "quote" (the exact words that state it). ` +
      `Never guess, never infer, never invent. Never say whether a character is main or secondary, nor judge them. ` +
      `Answer with a JSON object only: {"characters": [{"name": "", "variants": [], "scenes": [{"ref": "s1", "speaks": false}], "quote": "", "facts": [{"field": "", "value": "", "quote": ""}]}]}. If there is no character, answer {"characters": []}.`,
    user: JSON.stringify({
      known: known.map((k) => (k.others.length ? { name: k.name, also: k.others } : { name: k.name })),
      fields: fields.map((f) => ({ key: f.key, meaning: f.label })),
      excerpts: packet.text,
    }),
  };
}

export interface CastFact {
  field: CastField;
  value: string;
  /** Passage du texte de l'auteur qui le dit, tel qu'il l'a écrit. */
  quote: string;
}
export interface CastPresence {
  /** Carte Scène (ou « #3 », scène sans carte). */
  id: string;
  /** Parle dans la scène (case cochée d'office) ; sinon seulement nommé (décochée). */
  speaks: boolean;
}
export interface CastProposal {
  name: string;
  variants: string[];
  /** Passage où le nom paraît, tel que l'auteur l'a écrit. */
  quote: string;
  scenes: CastPresence[];
  facts: CastFact[];
}

const listOf = (v: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v).find(Array.isArray) : null;
  return Array.isArray(list) ? list.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
};

/** Noms d'une proposition, repliés pour la recherche dans le texte. */
const foldedNames = (all: string[]) => [...new Set(all.map(foldWords).filter((n) => n.length >= 2))];

/** Un nom de ceux qui parlent (scénario, en capitales) est-il celui-ci ? Égal replié, ou au prénom près. */
const speakerIs = (speaker: string, all: string[]) => {
  const s = foldName(speaker);
  return all.some((n) => {
    const f = foldName(n);
    return f === s || f.split(" ")[0] === s || s.split(" ")[0] === f;
  });
};

/**
 * Réponse relue pour un paquet : un nom écrit dans le paquet, une citation retrouvée qui le contient (sinon la
 * proposition est écartée et comptée), des scènes du paquet qui le nomment (celles que l'IA oublie sont ajoutées),
 * des faits cités pour les seuls champs demandés. `parle` vient du texte dans un scénario, de l'IA dans un roman.
 */
export function parseCast(reply: string, packet: CastPacket, fields: readonly CastField[] = CAST_FIELDS): { items: CastProposal[]; rejected: number } {
  const allowed = new Set<string>(fields);
  const scenes = packet.scenes.map((s) => ({ ...s, folded: foldWords(s.text) }));
  const whole = foldWords(packet.text);
  const byRef = new Map(scenes.map((s) => [s.ref, s]));
  const items: CastProposal[] = [];
  let rejected = 0;
  for (const item of listOf(extractJson(reply))) {
    const name = oneLine(str(item.name), 80);
    if (!name || !names(whole, foldWords(name))) {
      if (name) rejected++;
      continue;
    }
    const variants: string[] = [];
    for (const v of Array.isArray(item.variants) ? item.variants : []) {
      const variant = oneLine(str(v), 80);
      if (!variant || variants.length >= CAST_VARIANTS || !names(whole, foldWords(variant))) continue;
      if ([name, ...variants].some((n) => castKey(n) === castKey(variant))) continue;
      variants.push(variant);
    }
    const all = [name, ...variants];
    const folded = foldedNames(all);
    const inScene = (s: (typeof scenes)[number]) => folded.some((n) => names(s.folded, n)) || !!s.speakers?.some((sp) => speakerIs(sp, all));
    // Le passage : retrouvé dans une scène, et il nomme le personnage.
    let quote = "";
    for (const s of scenes) {
      const q = quoteIn(s.text, str(item.quote), 260);
      if (q && folded.some((n) => names(foldWords(q), n))) {
        quote = q;
        break;
      }
    }
    if (!quote) {
      rejected++;
      continue;
    }
    const said = new Map<string, boolean>();
    for (const raw of Array.isArray(item.scenes) ? item.scenes : []) {
      const ref = typeof raw === "string" ? raw.trim() : raw && typeof raw === "object" ? str((raw as Record<string, unknown>).ref) : "";
      const speaks = !!raw && typeof raw === "object" && (raw as Record<string, unknown>).speaks === true;
      if (byRef.has(ref)) said.set(ref, (said.get(ref) ?? false) || speaks);
    }
    const presence: CastPresence[] = [];
    for (const s of scenes) {
      if (!inScene(s)) continue;
      const speaks = s.speakers ? s.speakers.some((sp) => speakerIs(sp, all)) : (said.get(s.ref) ?? false);
      presence.push({ id: s.id, speaks });
    }
    const facts: CastFact[] = [];
    for (const f of listOf(item.facts)) {
      const field = str(f.field) as CastField;
      const value = oneLine(str(f.value), 160);
      if (!allowed.has(field) || !value || facts.some((x) => x.field === field)) continue;
      const q = scenes.map((s) => quoteIn(s.text, str(f.quote), 260)).find(Boolean);
      if (!q) {
        rejected++;
        continue;
      }
      facts.push({ field, value, quote: q });
    }
    items.push({ name, variants, quote, scenes: presence, facts });
  }
  return { items, rejected };
}

const sameCharacter = (a: CastProposal, b: CastProposal) => {
  const keys = new Set([a.name, ...a.variants].map(castKey));
  return [b.name, ...b.variants].some((n) => keys.has(castKey(n)));
};

/** Propositions d'un paquet ajoutées aux précédentes : un même personnage (un nom en commun) n'a qu'une ligne. */
export function mergeCast(acc: CastProposal[], next: CastProposal[]): CastProposal[] {
  const out = acc.map((p) => ({ ...p }));
  for (const p of next) {
    const at = out.findIndex((x) => sameCharacter(x, p));
    if (at < 0) {
      out.push(p);
      continue;
    }
    const x = out[at];
    // Le nom le plus complet l'emporte (« Inès Morvan » plutôt qu'« Inès ») ; l'autre devient un autre nom.
    const name = p.name.length > x.name.length && foldWords(p.name).includes(foldWords(x.name)) ? p.name : x.name;
    const variants: string[] = [];
    for (const v of [x.name, ...x.variants, p.name, ...p.variants]) {
      if (variants.length >= CAST_VARIANTS || castKey(v) === castKey(name) || variants.some((n) => castKey(n) === castKey(v))) continue;
      variants.push(v);
    }
    const scenes = [...x.scenes];
    for (const s of p.scenes) {
      const same = scenes.findIndex((y) => y.id === s.id);
      if (same < 0) scenes.push(s);
      else if (s.speaks && !scenes[same].speaks) scenes[same] = { ...scenes[same], speaks: true };
    }
    const facts = [...x.facts];
    for (const f of p.facts) if (!facts.some((y) => y.field === f.field)) facts.push(f);
    out[at] = { name, variants, quote: x.quote, scenes, facts };
  }
  return out;
}

/**
 * Ce que la proposition est pour le projet : un personnage nouveau ; un personnage déjà dans la Bible (même nom,
 * prénom ou surnom) ; un nom proche d'une fiche (une lettre d'écart, même prénom), à ajouter peut-être comme
 * surnom ; ou le nom d'une autre carte (lieu, objet, groupe…), écarté.
 */
export type CastMatch = { kind: "new" } | { kind: "known"; id: string } | { kind: "close"; id: string } | { kind: "other" };

export function matchCast(p: Pick<CastProposal, "name" | "variants">, cards: CardData[]): CastMatch {
  const mine = [p.name, ...p.variants];
  const folded = new Set(mine.map((n) => foldWords(n).trim()));
  const characters = cards.filter((c) => c.type === "personnage" && c.title.trim());
  // Le titre entier d'abord : « Inès » qui est le prénom de deux fiches va à celle qui s'appelle « Inès ».
  const byTitle = characters.find((c) => folded.has(foldWords(c.title).trim()));
  if (byTitle) return { kind: "known", id: byTitle.id };
  const byName = characters.find((c) => namesOf(c).some((n) => folded.has(n)));
  if (byName) return { kind: "known", id: byName.id };
  if (cards.some((c) => c.type !== "personnage" && c.type !== "scene" && c.title.trim() && folded.has(foldWords(c.title).trim()))) return { kind: "other" };
  const first = (s: string) => foldName(s).split(" ")[0];
  const close = characters.find((c) => {
    const theirs = [c.title, ...(c.fiche?.surnoms ?? "").split(/[,;]/).filter((s) => s.trim())];
    return mine.some((n) => theirs.some((o) => similarNames(n, o) || (first(n).length >= 3 && first(n) === first(o))));
  });
  return close ? { kind: "close", id: close.id } : { kind: "new" };
}

/** Noms de la proposition que la fiche ne connaît pas encore (ni titre, ni prénom, ni surnom). */
export function newNames(p: Pick<CastProposal, "name" | "variants">, card: CardData): string[] {
  const known = new Set(namesOf(card));
  const out: string[] = [];
  for (const n of [p.name, ...p.variants]) {
    const f = foldWords(n).trim();
    if (f && !known.has(f) && !out.some((o) => castKey(o) === castKey(n))) out.push(n);
  }
  return out;
}

/** Surnoms d'une fiche (« Ninou, la petite ») avec ceux-ci en plus, sans doublon ni le titre de la fiche. */
export function addNicknames(current: string | undefined, add: string[], title = ""): string {
  const list = (current ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const keys = new Set([...list, title].filter(Boolean).map(castKey));
  for (const n of add) {
    const name = n.trim();
    if (!name || keys.has(castKey(name))) continue;
    keys.add(castKey(name));
    list.push(name);
  }
  return list.join(", ");
}
