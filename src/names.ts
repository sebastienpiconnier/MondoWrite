// Annuaire de noms de personnages (#17), hors ligne. Fonctions pures : tirage avec graine, filtres de genre,
// exclusion des noms déjà portés dans le projet. Les listes (src/assets/names/<pays>.json, fabriquées par
// scripts/names/build.mjs d'après les fichiers de données de Faker, MIT) sont chargées à la demande.
// Les listes de Faker n'ont ni fréquence ni époque : le tirage est uniforme. Un pays qui a un registre officiel
// (src/assets/names/registers/<pays>.json, fabriqué par scripts/names/build-insee.mjs) tire au prorata des
// naissances, et peut se limiter à une décennie. Aucun nom n'est jamais associé à un caractère ni à une origine.

export interface NameList {
  /** Prénoms féminins, masculins, sans genre, et noms de famille. */
  f: string[];
  m: string[];
  x: string[];
  l: string[];
}

export type Gender = "any" | "f" | "m";
export type NameKind = "full" | "first" | "last";

/** Pays livrés (code ISO, jamais traduit). */
export const NAME_COUNTRIES = [
  "FR", "BE", "CH", "CA", "US", "GB", "IE", "AU", "ES", "MX", "IT", "DE", "AT", "NL", "PT", "PL", "SE", "DK", "NO", "FI", "CZ", "HU", "RO", "TR", "RU", "UA", "JP", "KR", "CN", "IL", "IR", "ID",
] as const;
export type Country = (typeof NAME_COUNTRIES)[number];

/** Pays dont les listes de Faker sont les mêmes que celles d'un autre : un seul fichier. */
const SAME_FILE: Partial<Record<string, string>> = { GB: "US", IE: "US", CA: "FR" };

/** Fichier de données d'un pays, ou null s'il n'y en a pas (VN, par exemple, n'a pas de liste utilisable). */
export function dataFileFor(country: string): string | null {
  const c = SAME_FILE[country] ?? country;
  return (FILES as readonly string[]).includes(c) ? c : null;
}
const FILES = ["FR", "BE", "CH", "US", "AU", "ES", "MX", "IT", "DE", "AT", "NL", "PT", "PL", "SE", "DK", "NO", "FI", "CZ", "HU", "RO", "TR", "RU", "UA", "JP", "KR", "CN", "IL", "IR", "ID"] as const;

/** Pays de départ selon la langue de l'interface (le premier choix de l'auteur reste à lui). */
export function countryForLang(lang: string): Country {
  const base = lang.split("-")[0];
  const region = lang.split("-")[1]?.toUpperCase();
  if (region && (NAME_COUNTRIES as readonly string[]).includes(region) && dataFileFor(region)) return region as Country;
  const byLang: Record<string, Country> = { fr: "FR", en: "US", es: "ES", it: "IT", de: "DE", nl: "NL", pt: "PT", pl: "PL", sv: "SE", da: "DK", nb: "NO", fi: "FI", cs: "CZ", hu: "HU", ro: "RO", tr: "TR", ru: "RU", uk: "UA", ja: "JP", ko: "KR", zh: "CN", he: "IL", fa: "IR", id: "ID" };
  return byLang[base] ?? "US";
}

/** Registre officiel d'un pays : pour chaque nom, le nombre de naissances par tranche de `step` ans depuis `from`. */
export interface NameRegister {
  from: number;
  step: number;
  f: [string, number[]][];
  m: [string, number[]][];
  /** Noms de famille, quand le registre en a. */
  l?: [string, number[]][];
}

const registers = import.meta.glob("./assets/names/registers/*.json", { import: "default" }) as Record<string, () => Promise<NameRegister>>;
const loadedRegisters = new Map<string, Promise<NameRegister | null>>();

/** Charge le registre d'un pays, ou null s'il n'en a pas (alors seules les listes sans époque servent). */
export function loadRegister(country: string): Promise<NameRegister | null> {
  const load = registers[`./assets/names/registers/${country}.json`];
  if (!load) return Promise.resolve(null);
  let p = loadedRegisters.get(country);
  if (!p) {
    p = load().catch(() => null);
    loadedRegisters.set(country, p);
  }
  return p;
}

/** Décennies (ou tranches) que couvre un registre, de la plus ancienne à la plus récente. */
export function registerEras(reg: NameRegister): number[] {
  const n = Math.max(...[...reg.f, ...reg.m, ...(reg.l ?? [])].map(([, c]) => c.length), 0);
  return Array.from({ length: n }, (_, i) => reg.from + i * reg.step);
}

/** Décennie de naissance (début de tranche) pour un âge à une année donnée, ou null s'il ne s'en tire rien. */
export function eraForAge(age: string | undefined, year: number, reg: NameRegister): number | null {
  const m = age?.match(/\d{1,3}/);
  if (!m) return null;
  const born = year - Number(m[0]);
  const eras = registerEras(reg);
  if (!eras.length || born < eras[0] || born >= eras[eras.length - 1] + reg.step) return null;
  return eras[Math.floor((born - reg.from) / reg.step)];
}

const loaded = new Map<string, Promise<NameList>>();
const files = import.meta.glob("./assets/names/*.json", { import: "default" }) as Record<string, () => Promise<NameList>>;

/** Charge la liste d'un pays à la demande. Rejette si le pays n'a pas de liste. */
export function loadNames(country: string): Promise<NameList> {
  const file = dataFileFor(country);
  const load = file && files[`./assets/names/${file}.json`];
  if (!load) return Promise.reject(new Error("no-names"));
  let p = loaded.get(file);
  if (!p) {
    p = load();
    p.catch(() => loaded.delete(file));
    loaded.set(file, p);
  }
  return p;
}

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même tirage (tests, « D'autres »). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Comparaison sans casse ni accents. */
export const foldName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Prénoms possibles pour un genre : « Tous » contient aussi les prénoms sans genre. */
export function firstNames(list: NameList, gender: Gender): string[] {
  if (gender === "f") return [...list.f, ...list.x];
  if (gender === "m") return [...list.m, ...list.x];
  return [...new Set([...list.f, ...list.m, ...list.x])];
}

export interface PickRequest {
  list: NameList;
  gender: Gender;
  kind: NameKind;
  count: number;
  /** Titres des cartes du projet : un prénom ou un nom déjà porté n'est pas proposé. */
  taken: string[];
  rand: () => number;
  /** Registre du pays (facultatif) : tirage au prorata des naissances. */
  register?: NameRegister | null;
  /** Début de la décennie voulue (facultatif, avec un registre) ; sinon toutes les époques. */
  era?: number | null;
}

/** Mots d'un titre, repliés : « Inès Morvan » → ["ines", "morvan"]. */
const tokens = (title: string) => foldName(title).split(/[\s-]+/).filter(Boolean);

function draw(pool: string[], count: number, rand: () => number): string[] {
  const left = [...pool];
  const out: string[] = [];
  while (out.length < count && left.length) out.push(left.splice(Math.floor(rand() * left.length), 1)[0]);
  return out;
}

/** Naissances d'un nom dans une tranche (null : toutes). */
function births(counts: number[], reg: NameRegister, era: number | null | undefined): number {
  if (era == null) return counts.reduce((a, b) => a + b, 0);
  return counts[Math.floor((era - reg.from) / reg.step)] ?? 0;
}

/** Noms d'un registre avec leur poids, un nom présent des deux côtés (unisexe) comptant pour la somme. */
function weighted(rows: [string, number[]][][], reg: NameRegister, era: number | null | undefined): [string, number][] {
  const sum = new Map<string, number>();
  for (const part of rows) for (const [name, counts] of part) sum.set(name, (sum.get(name) ?? 0) + births(counts, reg, era));
  return [...sum].filter(([, w]) => w > 0);
}

function drawWeighted(pool: [string, number][], count: number, rand: () => number): string[] {
  const left = [...pool];
  let total = left.reduce((a, [, w]) => a + w, 0);
  const out: string[] = [];
  while (out.length < count && left.length) {
    let r = rand() * total;
    let i = 0;
    while (i < left.length - 1 && r >= left[i][1]) r -= left[i++][1];
    out.push(left[i][0]);
    total -= left[i][1];
    left.splice(i, 1);
  }
  return out;
}

/** Tire `count` noms. Aucun doublon, aucun prénom ni nom déjà porté par une carte du projet. */
export function pickNames({ list, gender, kind, count, taken, rand, register, era }: PickRequest): string[] {
  const used = new Set(taken.flatMap(tokens));
  const free = (names: string[]) => names.filter((n) => !tokens(n).some((t) => used.has(t)));
  const freeW = (names: [string, number][]) => names.filter(([n]) => !tokens(n).some((t) => used.has(t)));
  const firstW = register && (register.f.length || register.m.length) ? freeW(weighted(gender === "f" ? [register.f] : gender === "m" ? [register.m] : [register.f, register.m], register, era)) : null;
  const lastW = register?.l?.length ? freeW(weighted([register.l], register, era)) : null;
  const pickFirst = (n: number) => (firstW ? drawWeighted(firstW, n, rand) : draw(free(firstNames(list, gender)), n, rand));
  const pickLast = (n: number) => (lastW ? drawWeighted(lastW, n, rand) : draw(free(list.l), n, rand));
  if (kind === "first") return pickFirst(count);
  if (kind === "last") return pickLast(count);
  const f = pickFirst(count);
  const l = pickLast(count);
  return f.slice(0, Math.min(f.length, l.length)).map((first, i) => `${first} ${l[i]}`);
}
