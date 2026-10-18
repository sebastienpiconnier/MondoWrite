// Couche de stockage. Le format est le même partout : un "dossier projet"
//   cosmos.json        positions, fils, titre du projet
//   cartes/<id>.md     une carte par fichier, Markdown + frontmatter
//   scenario.fountain  texte du scénario (projets scénario uniquement)
//   corbeille/<id>.md  cartes supprimées, restaurables
//
// - Tauri sur ordinateur (macOS, Windows, Linux) : un dossier par projet, choisi par l'auteur.
// - Tauri sur mobile (iOS, Android) : un dossier par projet dans l'espace privé de l'app.
// - Navigateur (npm run dev) : les mêmes fichiers simulés dans localStorage, une clé par projet.
// Plusieurs projets : le stockage en liste les connus (écran d'accueil) et travaille sur celui qu'on sélectionne.

import type { Project, ProjectMeta } from "../types";
import { cardToFile, fileToCard, htmlToMarkdown, markdownToHtml } from "./markdown";
import { isCardId } from "../mentions";
import { browserStorage } from "./browser";
import { tauriStorage } from "./tauri";
import { CARDS_DIR, MANUSCRIPT_DIR, META_FILE, SCREENPLAY_FILE, TRASH_DIR, cardPath, isConflictCopy, manuscriptPath, trashPath, type FileMap } from "./paths";
import { parse as parseScreenplay } from "../screenplay/parse";
import { serialize as serializeScreenplay } from "../screenplay/serialize";
import { isTauri } from "../platform";
import type { ProjectKind } from "../types";
import type { ProjectEntry } from "./recents";

export * from "./paths";
export type { ProjectEntry } from "./recents";

export interface Storage {
  kind: "browser" | "tauri";
  /** L'auteur peut choisir où est son projet (faux sur mobile et dans le navigateur). */
  canPickFolder: boolean;
  /** Mobile : pas de choix de dossier possible, on importe un projet exporté en .zip (Fichiers : iCloud Drive, OneDrive, Dropbox…). */
  canImportZip: boolean;
  /** iPhone et iPad : synchronisation des projets par iCloud Drive (absent ailleurs). */
  icloud?: { available(): Promise<boolean>; enabled(): boolean; set(on: boolean): Promise<void> };
  /** Nom du dossier projet choisi (null dans le navigateur, sur mobile, ou si rien n'est choisi). */
  location(): string | null;
  /** Demande un dossier à l'auteur (Tauri uniquement). Renvoie false si annulé. */
  pickFolder(): Promise<boolean>;
  /** Projets connus de cet appareil, les plus récemment ouverts d'abord. */
  list(): Promise<ProjectEntry[]>;
  /** Choisit le projet sur lequel portent readAll, write et location. */
  select(id: string): void;
  /**
   * Prépare l'emplacement d'un nouveau projet et le sélectionne : dialogue de dossier sur ordinateur,
   * nouvel emplacement privé ailleurs. Renvoie false si l'auteur annule.
   */
  create(): Promise<boolean>;
  /** Inscrit le projet sélectionné en tête de la liste, avec son titre et son type. */
  remember(info: { title: string; kind: ProjectKind }): void;
  /** Retire un projet de la liste, sans toucher à ses fichiers. */
  unlist(id: string): void;
  /**
   * Import : l'auteur choisit un fichier texte, qui est lu sans être modifié.
   * `label` décrit le format dans le dialogue. Renvoie null si l'auteur annule.
   */
  pickTextFile(label: string, extensions: string[]): Promise<{ name: string; text: string } | null>;
  readAll(): Promise<FileMap | null>;
  /** Oublie le dossier mémorisé (il n'a pas pu être lu) : l'auteur le choisira à nouveau. */
  forget(): void;
  /** Copie une image dans le dossier medias/ du projet sélectionné. */
  writeMedia(name: string, data: Uint8Array): Promise<void>;
  /** Adresse affichable (blob: ou data:) d'une image de medias/, ou null si le fichier manque. */
  mediaUrl(name: string): Promise<string | null>;
  /** Octets d'un fichier de medias/ (le PDF d'une carte Document), ou null s'il manque. */
  readMedia(name: string): Promise<Uint8Array | null>;
  /** L'auteur choisit un fichier (un PDF à importer). Renvoie null s'il annule. */
  pickFile(label: string, extensions: string[]): Promise<{ name: string; data: Uint8Array } | null>;
  /** L'auteur choisit une image (bouton d'une carte). Renvoie null s'il annule. */
  pickImage(label: string): Promise<{ name: string; data: Uint8Array } | null>;
  /** Plusieurs images d'un coup (galerie d'une fiche). Liste vide si l'auteur annule. */
  pickImages(label: string): Promise<{ name: string; data: Uint8Array }[]>;
  /** Écrit les fichiers donnés et supprime ceux listés dans `removed`. */
  write(files: FileMap, removed: string[]): Promise<void>;
  /**
   * Contenu actuel sur le disque des fichiers texte donnés (ceux qui manquent sont absents du résultat) :
   * relu juste avant d'écrire, pour ne jamais écraser une modification faite hors de l'app.
   */
  readFiles?(paths: string[]): Promise<FileMap>;
  /**
   * Surveille le dossier du projet (app de bureau) : `onChange` est appelé, après un délai anti-rebond,
   * quand un fichier y change, que ce soit l'app ou un autre logiciel. Rend la fonction qui arrête.
   */
  watch?(onChange: () => void): Promise<() => void>;
  /**
   * Export : l'auteur choisit où enregistrer (ordinateur, mobile) ou le fichier est téléchargé (navigateur).
   * `label` décrit le format dans le dialogue. Renvoie false si l'auteur annule.
   */
  saveAs(file: SavedFile, label: string): Promise<boolean>;
  /** Copies Markdown du dossier projet (markdown/) : absent dans le navigateur, où il n'y a pas de dossier à lire. */
  copies?: CopyStore;
}

/** Fichiers de markdown/ du projet sélectionné. Chemins relatifs à markdown/ (« bible.md », « versions/2026-10-11/bible.md »). */
export interface CopyStore {
  /** Projet sélectionné (pour savoir quand les copies connues ne valent plus). */
  key(): string | null;
  /** Contenu actuel des fichiers donnés (ceux qui manquent sont absents du résultat). */
  read(names: string[]): Promise<FileMap>;
  /** Écrit des fichiers (dossiers créés au besoin) et en supprime d'autres. */
  write(files: FileMap, removed: string[]): Promise<void>;
  /** Jours des versions gardées (noms des dossiers de versions/). */
  versions(): Promise<string[]>;
  /** Supprime des versions entières. */
  removeVersions(days: string[]): Promise<void>;
}

/** Fichier produit par un export. */
export interface SavedFile {
  name: string;
  extension: string;
  mime: string;
  data: Uint8Array;
}

export { isTauri };

export const storage: Storage = isTauri() ? tauriStorage : browserStorage;

export function serialize(project: Project): FileMap {
  const files: FileMap = { [META_FILE]: JSON.stringify(project.meta, null, 2) };
  for (const card of project.cards) files[cardPath(card.id)] = cardToFile(card);
  // Corbeille : une carte n'y est écrite qu'avec sa ligne `corbeille:` (sinon elle reviendrait comme carte).
  for (const card of project.trash ?? []) if (card.trashed) files[trashPath(card.id)] = cardToFile(card);
  // Un projet roman n'a pas de scénario : le fichier n'est jamais créé pour lui.
  if (project.screenplay) files[SCREENPLAY_FILE] = serializeScreenplay(project.screenplay);
  // Manuscrit : un fichier par scène écrite. Une scène sans texte n'a pas de fichier.
  for (const [id, html] of Object.entries(project.manuscript ?? {})) {
    const text = htmlToMarkdown(html);
    if (text) files[manuscriptPath(id)] = `${text}\n`;
  }
  return files;
}

export function deserialize(files: FileMap): Project | null {
  const raw = files[META_FILE];
  if (!raw) return null;
  const meta = JSON.parse(raw) as ProjectMeta;
  const cards = Object.entries(files)
    // Une copie de conflit (« … (MondoWrite).md ») n'est jamais une carte : elle porte le même identifiant.
    .filter(([path]) => path.startsWith(`${CARDS_DIR}/`) && path.endsWith(".md") && !isConflictCopy(path))
    .map(([, text]) => fileToCard(text))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const live = new Set(cards.map((c) => c.id));
  const trash = Object.entries(files)
    .filter(([path]) => path.startsWith(`${TRASH_DIR}/`) && path.endsWith(".md") && !isConflictCopy(path))
    .map(([, text]) => fileToCard(text))
    .filter((c): c is NonNullable<typeof c> => c !== null && !!c.trashed && !live.has(c.id));
  const screenplay = SCREENPLAY_FILE in files ? parseScreenplay(files[SCREENPLAY_FILE]) : null;
  const manuscript: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith(`${MANUSCRIPT_DIR}/`) || !path.endsWith(".md")) continue;
    const id = path.slice(MANUSCRIPT_DIR.length + 1, -3);
    const html = isCardId(id) ? markdownToHtml(text.replace(/\r\n/g, "\n")).trim() : "";
    if (html) manuscript[id] = html;
  }
  return { meta, cards, screenplay, manuscript, ...(trash.length > 0 ? { trash } : {}) };
}
