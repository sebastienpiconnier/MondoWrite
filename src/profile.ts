// Profil de l'auteur : prénom, nom, nom de plume et coordonnées. Saisi une fois sur la page des projets,
// gardé sur l'appareil (réglage, jamais dans un projet), repris par chaque nouveau projet : page de titre
// du scénario (auteur, contact), page de garde du manuscrit exporté. Fonctions pures.

export interface AuthorProfile {
  firstName: string;
  lastName: string;
  /** Nom de plume : le nom signé sur les œuvres, s'il diffère du nom civil. */
  penName: string;
  email: string;
  phone: string;
  /** Adresse postale, sur plusieurs lignes. */
  address: string;
  /** Parcours, en quelques lignes (Bible v2, lot 6 : page « L'auteur » du dossier envoyé). */
  bio: string;
  /** Filmographie ou publications, une œuvre par ligne. */
  works: string;
}

export const PROFILE_FIELDS = ["firstName", "lastName", "penName", "email", "phone", "address", "bio", "works"] as const satisfies readonly (keyof AuthorProfile)[];

export const EMPTY_PROFILE: AuthorProfile = { firstName: "", lastName: "", penName: "", email: "", phone: "", address: "", bio: "", works: "" };

/** `lines` : nombre de lignes gardées (0 : une seule ligne, espaces resserrés). */
const clean = (value: unknown, max: number, lines = 0) => {
  if (typeof value !== "string") return "";
  const text = lines > 0 ? value.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, lines).join("\n") : value.replace(/\s+/g, " ").trim();
  return text.slice(0, max);
};

/** Nettoie un profil (saisi ou relu) ; tout champ absent ou d'un mauvais type devient vide. */
export function cleanProfile(raw: unknown): AuthorProfile {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    firstName: clean(p.firstName, 80),
    lastName: clean(p.lastName, 80),
    penName: clean(p.penName, 120),
    email: clean(p.email, 160),
    phone: clean(p.phone, 40),
    address: clean(p.address, 400, 6),
    bio: clean(p.bio, 1500, 12),
    works: clean(p.works, 1500, 30),
  };
}

/**
 * Profil relu des réglages. Avant le profil, l'appareil ne gardait qu'un « nom d'auteur » :
 * il devient le nom de plume (c'est le nom signé), sans rien perdre.
 */
export function readProfile(raw: unknown, legacyAuthor: unknown): AuthorProfile {
  const profile = cleanProfile(raw);
  if (raw === undefined && typeof legacyAuthor === "string" && legacyAuthor.trim()) return { ...profile, penName: clean(legacyAuthor, 120) };
  return profile;
}

/** Nom civil : « Prénom Nom ». */
export const legalName = (p: AuthorProfile) => [p.firstName, p.lastName].filter(Boolean).join(" ");

/** Nom signé sur les œuvres (page de titre, exports) : le nom de plume s'il y en a un, sinon le nom civil. */
export const authorName = (p: AuthorProfile) => p.penName || legalName(p);

/** Le profil a de quoi remplir une page de titre. */
export const hasProfile = (p: AuthorProfile) => PROFILE_FIELDS.some((f) => p[f] !== "");

/**
 * Coordonnées, une ligne par information, dans l'ordre d'usage d'une page de titre (scénario) ou d'une
 * page de garde de manuscrit : nom civil (quand il diffère du nom signé), adresse, téléphone, courriel.
 */
export function contactLines(p: AuthorProfile): string[] {
  const legal = legalName(p);
  return [...(legal && legal !== authorName(p) ? [legal] : []), ...(p.address ? p.address.split("\n") : []), p.phone, p.email].filter(Boolean);
}

/**
 * Le nom tapé ailleurs (page de titre d'un scénario) met le profil à jour : le nom civil s'il est
 * identique, sinon le nom de plume. Rend le même objet quand rien ne change. Un champ vidé ne touche à
 * rien : effacer l'auteur d'une page de titre ne doit pas effacer le nom de l'appareil.
 */
export function withAuthorName(p: AuthorProfile, name: string): AuthorProfile {
  const typed = clean(name, 120);
  if (typed === "" || typed === authorName(p)) return p;
  if (typed === legalName(p)) return p.penName ? { ...p, penName: "" } : p;
  return { ...p, penName: typed };
}
