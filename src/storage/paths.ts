// Chemins du format de projet, partagés par tous les stockages.
export type FileMap = Record<string, string>;

export const META_FILE = "cosmos.json";
export const CARDS_DIR = "cartes";
export const cardPath = (id: string) => `${CARDS_DIR}/${id}.md`;
/** Manuscrit d'un roman : le texte de chaque scène, dans un fichier au nom de sa carte. */
export const MANUSCRIPT_DIR = "manuscrit";
export const manuscriptPath = (id: string) => `${MANUSCRIPT_DIR}/${id}.md`;
/** Corbeille : les cartes supprimées, au même format (plus une ligne `corbeille:`), restaurables. */
export const TRASH_DIR = "corbeille";
export const trashPath = (id: string) => `${TRASH_DIR}/${id}.md`;
/** Dossiers de fichiers Markdown lus à l'ouverture d'un projet. */
export const TEXT_DIRS = [CARDS_DIR, MANUSCRIPT_DIR, TRASH_DIR];
/** Images des cartes, copiées dans le projet. */
export const MEDIA_DIR = "medias";
/** Texte du scénario (Fountain). Absent des projets roman. */
export const SCREENPLAY_FILE = "scenario.fountain";
/**
 * Copies Markdown lisibles hors de l'app (manuscrit, bible, canevas), réécrites à chaque enregistrement et
 * jamais relues. Une version par jour dans versions/AAAA-MM-JJ/. Hors de TEXT_DIRS, exprès.
 */
export const COPIES_DIR = "markdown";

/**
 * Conflit avec une modification faite hors de l'app : la version de MondoWrite est écrite à côté du
 * fichier, sous ce nom (« cartes/k3x9 (MondoWrite).md »), et jamais relue comme une carte.
 */
export const CONFLICT_MARK = " (MondoWrite)";
export const conflictCopyPath = (path: string) => path.replace(/(\.[^./]+)?$/, (ext) => `${CONFLICT_MARK}${ext}`);
export const isConflictCopy = (path: string) => /\(MondoWrite\)(\.[^./]+)?$/.test(path);
export const VERSIONS_DIR = "versions";

/**
 * Chemin qu'un projet peut contenir, relatif à son dossier : cosmos.json, scenario.fountain ou un .md de cartes/,
 * manuscrit/, corbeille/. Tout le reste (« .. », sous-dossiers, autres fichiers) est refusé : un .zip importé
 * ne doit rien écrire hors du projet.
 */
export const isProjectFilePath = (path: string) =>
  path === META_FILE || path === SCREENPLAY_FILE || TEXT_DIRS.some((dir) => new RegExp(`^${dir}/[^/\\\\.][^/\\\\]*\\.md$`).test(path) && !path.includes(".."));
