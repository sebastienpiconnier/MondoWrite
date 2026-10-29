// État global de MondoWrite (Zustand).
// Les nœuds React Flow portent directement les CardData : la toile EST le modèle.

import { isPhone } from "./components/usePhone";
import { capturedCard, fileCards } from "./inbox";
import { setWireField, wireFicheOf, type WireField } from "./wires";
import { applyReplace, type ReplaceInit, type ReplaceRequest, type ReplaceSnapshot } from "./replace";
import { headingOf, sceneBody, setSceneBody } from "./screenplay/sceneText";
import type { CharacterFilter } from "./review/filter";
import { copyBounds, copyText, linksWithin, pasteCopy, type CardCopy, type CopiedCard } from "./cardClipboard";
import { appendHtml, fountainElements, notesAreSceneText, sceneBodyHtml, sceneToNotes, textElements, textToHtml, withoutLeadingSynopsis } from "./cardText";
import { foldNovelNodes, foldNovelNotes, foldScreenplayNotes } from "./sceneNotes";
import { restoreCard, trashCard, type TrashedCard } from "./trash";
import { create } from "zustand";
import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type NodeChange } from "@xyflow/react";
import { type CardData, type CardType, type Frame, type ProjectKind } from "./types";
import { MEDIA_DIR, SCREENPLAY_FILE, conflictCopyPath, isConflictCopy, isProjectFilePath, deserialize, serialize, storage, type FileMap, type ProjectEntry } from "./storage";
import { hideProject, showProject, splitHidden } from "./storage/recents";
import { diffDisk, patchFiles, type FileConflict } from "./conflicts";
import { NO_FILTER, filterActive, hiddenCards, type CanvasFilter } from "./canvasFilter";
import { classifySaveError, type SaveErrorKind } from "./saveErrors";
import type { Screenplay, ScreenplayElement } from "./screenplay/model";
import { listScenes, sceneSynopsis, setSceneSynopsis } from "./screenplay/scenes";
import { screenplayWords } from "./screenplay/words";
import { defaultPaper, type Paper } from "./screenplay/layout";
import { useSettings } from "./settings";
import { bibleOrder } from "./bibleParts";
import { IMPORT_EXTENSIONS, projectFromFile } from "./import";
import { CARD_SIZE, firstFreeCell, placeCard, placeFrame, type Occupied } from "./placement";
import { clampCardWidth, documentExtension, imageExtension, isDocumentName, isMediaName } from "./media";
import { documentFiche, documentTitle } from "./documents";
import { removeMentions, renameMentions } from "./mentions";
import { countWords, isBlank, type Manuscript } from "./manuscript";
import { dayKey, readGoals, recordProgress, type Goals, type Progress } from "./stats";
import { isParked, placeAnswer } from "./assistant";
import { addQuestion, removeQuestion, setFicheField, type SheetField } from "./character";
import { EMPTY_PLAN, beatText, withKeys, isCustomBeat, type CustomTemplate, arrange, assignChapter, chapterOf, moveChapter, placeScene, planOrder, removeChapter, renameChapter, setTemplate, startChapter, stepScene, moveSceneTo, stepSceneInBook, type Plan, type PlanTemplate } from "./plan";
import { applyCustom, beatOf, customOf, placeSceneInBeat, screenplayPlan } from "./screenplay/template";
import { organize, reorderSlots } from "./organize";
import { toggleTask } from "./todos";
import { setPitchField, type Pitch, type PitchField } from "./pitch";
import type { Passage } from "./chutier";
import { DEFAULT_PRINT, type PrintOptions } from "./export/printOptions";
import { DEFAULT_BIBLE_EXPORT, type BibleExportState } from "./bibleExport";
import { DEFAULT_SCRIPT_PRINT, type ScriptPrint } from "./screenplay/export/scriptPrint";
import { hostOf, today } from "./research";
import { fetchImage, readPage } from "./web";
import type { Photo } from "./imageSources";
import { readFiche, sourceUrl } from "./character";
import { cardFromTextFile, clipFromText } from "./clip";
import { markHighlights } from "./markdownText";
import { markdownToHtml } from "./storage/markdown";
import { readTitleField, writeTitleField, type TitleField } from "./screenplay/titlePage";
import { appendScene, headingTitles, releaseCard, renameHeading } from "./screenplay/link";
import { fmt, getT } from "./i18n";
import { demoProject } from "./demo";
import { fileName } from "./screenplay/export";
import { claimLock, otherHolder, releaseLock } from "./projectLock";
import { endLoad, startLoad } from "./loadProgress";
import { CARD_WIDTH, CardNode, FRAME_PADDING, FRAME_SIZE, FrameNode, SaveStatus, View, boxes, firstScreenplay, frameBox, lockProps, newId, openProject, planScenes, titlesFromHeadings, toFrameNode, toNode, toProject, withHtml } from "./projectState";
export type { CardNode, FrameNode, View, SaveStatus } from "./projectState";
export { CARD_WIDTH, planScenes, unknownMeta } from "./projectState";


interface CosmosState {
  title: string;
  kind: ProjectKind;
  setKind: (kind: ProjectKind) => void;
  /** Plan d'un roman : gabarit choisi et scènes rangées dans ses cases (voir plan.ts). */
  plan: Plan;
  setPlanTemplate: (template: PlanTemplate) => void;
  /** Range une scène dans une case du plan (à la fin, ou à la position donnée) ; `beat` null la sort du plan. */
  placeInPlan: (id: string, beat: string | null, index?: number) => void;
  /**
   * Pose un gabarit de l'auteur (« Mes gabarits ») ou met à jour celui en place : `rows` dans l'ordre du récit,
   * avec la clé d'une case déjà là (ses scènes la suivent) ou sans clé pour une case nouvelle. Annulable.
   */
  setCustomTemplate: (name: string, rows: { key?: string; from?: string; label: string; hint?: string }[]) => void;
  /** Range une scène dans une case du gabarit, roman (plan) ou scénario (section du Fountain). Annulable. */
  placeInBeat: (id: string, beat: string, index?: number) => void;
  /** Monte ou descend une scène d'un cran dans le plan. Rend faux si elle ne peut pas bouger. */
  stepInPlan: (id: string, way: "up" | "down") => boolean;
  /** Scénario : le corps d'une scène (après son en-tête et son synopsis), écrit depuis sa carte agrandie. */
  setSceneText: (cardId: string, body: ScreenplayElement[]) => Screenplay | null;
  /** Scénario : le synopsis Fountain de la scène reliée à cette carte. */
  setCardSceneSynopsis: (cardId: string, text: string) => void;
  /** Volet du manuscrit : une scène avant ou après une autre (case et chapitre de la voisine). */
  moveBookScene: (id: string, target: string, side: "before" | "after") => boolean;
  /** Volet du manuscrit : un cran plus haut ou plus bas (au bord d'un chapitre, change de chapitre). */
  stepBookScene: (id: string, way: "up" | "down") => boolean;
  /** Crée une carte Scène et la range dans cette case du plan. */
  addPlanScene: (title: string, beat: string, chapterId?: string | null) => string;
  /**
   * Manuscrit, deux fois Entrée : une nouvelle scène juste après `afterId`, dans la même case du plan et le
   * même chapitre, avec le texte `html` (la suite de la scène coupée). Rend son identifiant.
   */
  splitScene: (afterId: string, html: string) => string | null;
  /** Coupe le récit : un nouveau chapitre commence à cette scène. Rend son identifiant. */
  startChapterAt: (sceneId: string) => string | null;
  /** Défait une coupure de scène : le texte de `fromId` revient à la fin de `intoId`, et sa carte part. */
  joinScenes: (fromId: string, intoId: string) => void;
  /** Range une scène dans un chapitre, ou l'en sort (null). */
  setSceneChapter: (sceneId: string, chapterId: string | null) => void;
  renamePlanChapter: (id: string, title: string) => void;
  /** Supprime un chapitre ; ses scènes rejoignent le chapitre précédent. */
  deletePlanChapter: (id: string) => void;
  /** Déplace un chapitre entier avant la scène `before` (null : à la fin du récit). */
  movePlanChapter: (id: string, before: string | null) => void;
  /** Range toutes les cartes du canevas en cadres (type, gabarit, chapitres) et relie les scènes. */
  organizeCanvas: () => void;
  /** Assistant personnage : ajoute la question (en gras) et la réponse au texte de la fiche. */
  /** Réponse à une question de l'assistant : le champ lié de la fiche s'il est vide, sinon les réponses rangées. */
  answerQuestion: (id: string, key: string, question: string, answer: string) => void;
  /** Modifie (ou efface, texte vide) une réponse rangée. */
  setReponse: (id: string, key: string, answer: string) => void;
  /** Assistant personnage, « Je ne sais pas encore » : crée une carte Question reliée au personnage. */
  parkQuestion: (id: string, question: string) => boolean;
  /** Retire une question gardée pour plus tard (répondue ailleurs, ou plus utile). */
  dropQuestion: (id: string, question: string) => void;
  /** Change un champ de la fiche d'un personnage (vide : retiré). */
  setFiche: (id: string, field: SheetField, value: string) => void;
  /** Ouvre la fiche d'une carte dans la Bible ; `assistant` : avec l'assistant ouvert. */
  openInBible: (id: string, assistant?: boolean) => void;
  /**
   * Range une source (lien, extrait, image collés ou déposés) dans la zone Recherche du canevas, créée au
   * besoin et agrandie si elle est pleine. Une seule étape d'historique. Rend l'identifiant de la carte.
   */
  /** Carte Lien, Image ou Extrait (type `source`), posée à `at` (point du canevas) ou au centre de la vue. */
  addResearchCard: (card: { title: string; html: string; fiche?: Record<string, string>; image?: string; fichier?: string; type?: CardType }, at?: { x: number; y: number }) => string;
  /** Un PDF déposé, collé ou choisi : une carte Document (le PDF et l'aperçu de sa première page dans medias/). */
  addDocument: (file: { name: string; data: Uint8Array }, at?: { x: number; y: number }) => Promise<string | null>;
  /** Le PDF d'une carte existante (Document encore vide, ou carte vide qui le devient). Rend faux en cas d'échec. */
  setCardDocument: (id: string, file: { name: string; data: Uint8Array }) => Promise<boolean>;
  /** L'auteur choisit un PDF : pour la carte `id`, sinon une nouvelle carte posée en `at`. */
  pickDocument: (id?: string, at?: { x: number; y: number }) => Promise<void>;
  /** Menu « Nouvelle carte » : l'auteur choisit une image de l'appareil, elle devient une carte Image. */
  pickImageCard: (at?: { x: number; y: number }) => Promise<void>;
  /** Carte Lien encore sans adresse : une adresse tapée dans son titre devient son lien. Rend vrai si c'est fait. */
  linkFromTitle: (id: string) => boolean;
  /** Où va la photo choisie dans la recherche de photos : une nouvelle carte Image, la galerie d'une fiche, ou l'image d'une carte. */
  photoTarget: { kind: "canvas"; at?: { x: number; y: number } } | { kind: "gallery"; id: string } | { kind: "card"; id: string } | null;
  openPhotos: (target: { kind: "canvas"; at?: { x: number; y: number } } | { kind: "gallery"; id: string } | { kind: "card"; id: string }) => void;
  /** Télécharge la photo choisie et la pose (carte Image créditée, ou galerie). Rend faux si le téléchargement échoue. */
  addPhoto: (photo: Photo) => Promise<boolean>;
  /** Carte Document ouverte dans la liseuse (fenêtre « document »). */
  documentCard: string | null;
  openDocument: (id: string) => void;
  /** Une image collée ou déposée devient une source illustrée de la zone Recherche. */
  addResearchImage: (file: { name: string; data: Uint8Array }, at?: { x: number; y: number }) => Promise<string | null>;
  /** Un lien ou un texte collé ou déposé devient une source de la zone Recherche (consultée aujourd'hui). */
  /** `image` : l'adresse est celle d'une image (glissée depuis une page), même sans extension. */
  addResearchClip: (text: string, at?: { x: number; y: number }, image?: boolean) => string | null;
  /** Carte Lien dont l'adresse mène à une image : téléchargée, elle en fait une carte Image (sinon la page est lue). */
  linkToImage: (id: string) => Promise<boolean>;
  /** Fichier texte déposé ou collé (.md, .txt) : une carte du type qu'il annonce (en-tête, en-tête de scène), sinon une Idée. */
  addTextFile: (fileName: string, text: string, at?: { x: number; y: number }) => string | null;
  /**
   * Coller dans une carte encore vide : une adresse web en fait la carte Lien (titre et image du site
   * arrivent ensuite), une image en fait la carte Image. Rend faux si la carte n'est pas vide ou si ce
   * qu'on colle n'est ni l'un ni l'autre (le collage suit alors son chemin normal).
   */
  turnIntoLink: (id: string, text: string) => boolean;
  /** Dernières cartes copiées (état de la session, jamais enregistré). */
  cardCopy: CardCopy | null;
  /** Copie ces cartes ; rend le texte lisible à mettre dans le presse-papiers du système. */
  copyCards: (ids: string[]) => string;
  /** Colle les dernières cartes copiées près de `at` (sinon à côté des originales) : une étape d'historique. */
  pasteCards: (at?: { x: number; y: number }) => string[];
  /** Copie puis colle aussitôt à côté (menu ⋯, Cmd/Ctrl + D). */
  duplicateCards: (ids: string[]) => string[];
  /** Texte collé sur une carte (pas dans un de ses champs) : il va dans la carte, à la fin, jamais dans une nouvelle carte. */
  pasteIntoCard: (id: string, text: string) => boolean;
  turnIntoImage: (id: string, file: { name: string; data: Uint8Array }) => Promise<boolean>;
  /**
   * Complète une source depuis sa page : titre (s'il n'est que le nom du site), auteur, publication, et
   * image du site si la carte n'en a pas. Ne remplace jamais ce que l'auteur a écrit. Hors historique.
   */
  completeSource: (id: string) => Promise<boolean>;
  /** Dernière source ajoutée par collage ou dépôt : le canevas l'annonce (« Voir »). */
  /** Montre la zone Recherche (créée au besoin). */
  /** Cadre à montrer sur le canevas (zone Recherche), puis remis à null. */
  focusFrame: string | null;
  clearFocusFrame: () => void;
  /** Fenêtre ouverte par-dessus l'app : raccourcis clavier ou « À propos ». */
  dialog: "shortcuts" | "about" | "trash" | "document" | "photos" | "card" | "replace" | "paperback" | "stats" | "scriptPdf" | "bibleExport" | "goto" | null;
  setDialog: (dialog: "shortcuts" | "about" | "trash" | "document" | "photos" | "card" | "replace" | "paperback" | "stats" | "scriptPdf" | "bibleExport" | "goto" | null) => void;
  /** Fenêtre « Rechercher et remplacer » : texte de départ, scène en cours, carte à renommer. */
  replaceInit: ReplaceInit | null;
  openReplace: (init?: Partial<ReplaceInit>) => void;
  /** Occurrences que trouverait ce remplacement (sans rien changer). */
  countReplace: (req: ReplaceRequest) => number;
  /** Remplace dans les textes et rend le nombre de remplacements ; « Annuler » (undoReplace) remet tout. */
  replaceText: (req: ReplaceRequest) => number;
  undoReplace: () => void;
  replaceUndo: ReplaceSnapshot | null;
  /**
   * États d'affichage du canevas, jamais enregistrés ni annulables : carte mise en avant (le reste estompé),
   * filtre, carte agrandie, menu d'une carte.
   */
  /** Scénario : filtre par personnage (« Ses scènes », « Ses répliques »). Affichage, jamais enregistré. */
  charFilter: CharacterFilter | null;
  setCharFilter: (filter: CharacterFilter | null) => void;
  spotlightId: string | null;
  setSpotlight: (id: string | null) => void;
  filter: CanvasFilter;
  /** Types masqués (filtre par type). La sélection des cartes masquées est retirée. */
  setFilterTypes: (types: CardType[]) => void;
  /** « Filtrer sur cette carte » : elle et ses voisines directes ; null l'enlève. */
  setFilterCard: (id: string | null) => void;
  /** « Tout afficher ». */
  clearFilter: () => void;
  /** Carte ouverte en grand (titre, texte, fiche, image), dans la fenêtre « card ». */
  expandedId: string | null;
  expandCard: (id: string | null) => void;
  /** Carte dont le menu (⋯, clic droit) est ouvert. */
  cardMenu: string | null;
  setCardMenu: (id: string | null) => void;
  /** Ouvre une scène dans le manuscrit (ou le scénario) : identifiant de sa carte, ou `SCENE_AT` + rang de son en-tête. */
  openInManuscript: (id: string) => void;
  /** Scène à montrer en arrivant dans le manuscrit, puis remise à null. */
  manuscriptTarget: string | null;
  clearManuscriptTarget: () => void;
  /** Coche ou décoche la n-ième case d'une carte ou d'une scène du manuscrit. */
  toggleTodo: (id: string, where: "card" | "manuscript", index: number) => void;
  /** Fiche à montrer en arrivant dans la Bible, puis remise à null. */
  bibleTarget: { id: string; assistant: boolean } | null;
  /** Demande au canevas de cadrer tout le projet (après un rangement). */
  fitRequest: number;
  clearBibleTarget: () => void;
  /** Crée une carte Question reliée aux cartes citées (alerte de cohérence gardée pour plus tard). */
  addQuestionAbout: (title: string, cardIds: string[]) => string;
  /** Manuscrit d'un roman : texte de chaque scène (HTML), par identifiant de carte Scène. */
  manuscript: Manuscript;
  setManuscriptText: (id: string, html: string) => void;
  goals: Goals;
  setGoals: (goals: Goals) => void;
  /** Couverture du projet (tête de la Bible) : tagline, logline, pastilles… Voir pitch.ts. */
  pitch: Pitch;
  /** Passages retirés du manuscrit, gardés au chutier (voir chutier.ts). */
  chutier: Passage[];
  addPassage: (passage: Passage) => void;
  removePassage: (id: string) => void;
  /** Clés de cosmos.json écrites par une version plus récente et inconnues ici : réécrites telles quelles. */
  metaKeep: Record<string, unknown>;
  setPitch: (key: PitchField, value: string) => void;
  /** Réglages du livre broché (fenêtre « Livre broché »), hors historique comme la couverture. */
  print: PrintOptions;
  setPrint: (patch: Partial<PrintOptions>) => void;
  /** Réglages de l'export PDF du scénario (`scriptPdf` de cosmos.json), hors historique comme `print`. */
  scriptPdf: ScriptPrint;
  setScriptPdf: (patch: Partial<ScriptPrint>) => void;
  /** Réglages de l'export de la Bible (`bibleExport` de cosmos.json), hors historique comme `print`. */
  bibleExport: BibleExportState;
  setBibleExport: (next: BibleExportState) => void;
  progress: Progress;
  /** Recrée la carte Scène d'un texte du manuscrit dont la carte a été supprimée. */
  restoreScene: (id: string) => void;
  /** Corbeille : cartes supprimées, restaurables (corbeille/<id>.md). */
  trash: TrashedCard[];
  /** Cartes qui viennent de partir à la corbeille (message « Annuler · Voir la corbeille »). */
  trashNotice: { count: number; title: string; at: number } | null;
  clearTrashNotice: () => void;
  /** Chapitre dont l'auteur demande la suppression : une fenêtre demande confirmation (rien n'est changé avant). */
  confirmChapter: string | null;
  askDeleteChapter: (id: string) => void;
  clearConfirmChapter: () => void;
  /** Remet une carte de la corbeille à sa place, avec ses fils et sa scène du scénario. */
  restoreFromTrash: (id: string) => void;
  /** Séquencier : met à la corbeille la scène du scénario qui commence à l'élément `start` (avec sa carte). */
  trashScreenplayScene: (start: number) => void;
  /** Supprime définitivement une carte de la corbeille (ou toutes, sans identifiant). */
  purgeTrash: (id?: string) => void;
  /** Renomme le projet (et la page de titre du scénario, si elle portait l'ancien titre). */
  setTitle: (title: string) => void;
  /** Format de page du scénario (estimation des pages, puis PDF). */
  paper: Paper;
  /** Faux tant que le format n'a pas été fixé (projet roman) : il n'est alors pas écrit dans cosmos.json. */
  paperChosen: boolean;
  setPaper: (paper: Paper) => void;
  /** Scénario : numéroter les scènes dans l'éditeur et les exports. */
  sceneNumbers: boolean;
  setSceneNumbers: (on: boolean) => void;
  /** Scénario : souligner les en-têtes de scène dans l'éditeur et les exports. */
  underlineHeadings: boolean;
  setUnderlineHeadings: (on: boolean) => void;
  /** Fils du canevas masqués : réglage du projet, enregistré dans cosmos.json, hors historique. */
  hideWires: boolean;
  setHideWires: (on: boolean) => void;
  /** Fils masqués : cartes dont on a rallumé les fils (affichage, jamais enregistré). */
  wiresShown: string[];
  toggleCardWires: (id: string) => void;
  /** Copies Markdown du projet dans markdown/ (réglage du projet, oui par défaut). */
  markdownCopies: boolean;
  setMarkdownCopies: (on: boolean) => void;
  /** Mode focus de l'éditeur de scénario : seule la feuille reste à l'écran. */
  focusMode: boolean;
  setFocusMode: (on: boolean) => void;
  nodes: CardNode[];
  edges: Edge[];
  /** Texte du scénario (scenario.fountain). null tant que le projet n'a jamais été un scénario. */
  screenplay: Screenplay | null;
  /** Le scénario tel qu'il est sur disque : tant qu'il n'a pas changé, le fichier n'est pas réécrit. */
  savedScreenplay: Screenplay | null;
  /**
   * Remplace le scénario. Les titres des cartes liées suivent leurs en-têtes.
   * `undoable` : le changement entre dans l'historique (séquencier). Sinon il vient de l'éditeur, qui a
   * son propre historique : celui du canevas est alors vidé, pour qu'annuler une carte n'efface jamais du texte.
   */
  setScreenplay: (screenplay: Screenplay, undoable?: boolean) => void;
  /**
   * Écrit un champ de la page de titre du scénario (une valeur vide le retire) et rend le scénario
   * obtenu. Le titre du projet suit quand il était le même ; le nom d'auteur est retenu sur l'appareil.
   */
  setTitlePageField: (field: TitleField, value: string) => Screenplay | null;
  /** Historique d'annulation : états précédents et états annulés (cartes, fils, scénario). */
  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;
  /** Montre une carte sur le canevas (résultat de recherche) : vue Canevas, carte centrée et sélectionnée. */
  revealCard: (id: string) => void;
  view: View;
  focusId: string | null;
  /** Carte qui vient d'être créée : son éditeur prend le focus dès qu'il est prêt. */
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
  status: SaveStatus;
  loaded: boolean;
  /** Accueil (choix du projet) ou projet ouvert. */
  screen: "home" | "project";
  /** Projets connus de cet appareil, pour l'accueil (sans les projets masqués). */
  projects: ProjectEntry[];
  /** Projets masqués de l'accueil : toujours là, réaffichables (réglage de l'appareil). */
  hiddenProjects: ProjectEntry[];
  /** Le dossier choisi à l'accueil ne contient pas de projet. */
  homeNotice: boolean;
  /** Au lancement : liste les projets et affiche l'accueil. */
  start: () => Promise<void>;
  /** Autre appareil qui a ouvert ce projet : lecture seule, rien n'est enregistré. */
  lockedBy: string | null;
  /** Reprend la main : relit le projet sur le disque et pose le verrou (les changements faits en lecture seule sont perdus). */
  takeOver: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  createProject: (options: { title: string; kind: ProjectKind }) => Promise<void>;
  /** Un fichier Fountain existant devient un nouveau projet scénario, avec ses cartes. */
  /** Accueil : un manuscrit (.docx, .md, .txt) ou un scénario (.fountain, .fdx) devient un nouveau projet. */
  importFile: () => Promise<void>;
  /** Mobile : ouvre un projet exporté en .zip (« Exporter une copie ») depuis Fichiers, en le copiant dans l'app. */
  importProjectZip: () => Promise<void>;
  /** Mobile : l'auteur choisit dans Fichiers le dossier cloud (OneDrive, Dropbox…) qui contient ses projets. */
  chooseCloudFolder: () => Promise<void>;
  /** Range dans `projets` les projets restés dans un doublon créé par iCloud (« projets 2 »), puis relit la liste. */
  gatherStrayProjects: () => Promise<void>;
  /** Mobile : revient à l'espace de l'app (le dossier cloud n'est pas touché). */
  leaveCloudFolder: () => Promise<void>;
  /** Case « Synchroniser les projets avec iCloud Drive » (iPhone, iPad, Mac), puis liste des projets relue. */
  setIcloud: (on: boolean) => Promise<void>;
  /** L'import n'a pas eu lieu : dossier déjà occupé par un projet, ou fichier sans scénario. */
  importNotice: "taken" | "empty" | null;
  /** Nouveau projet rempli avec l'exemple, pour découvrir l'app. */
  tryExample: () => Promise<void>;
  /** Visite guidée : étape affichée (0 à n-1), ou null. État d'affichage, jamais enregistré. */
  tour: number | null;
  setTour: (step: number | null) => void;
  /** Enregistre et revient à l'accueil. `force` : y revenir même si l'enregistrement a échoué. */
  closeProject: (force?: boolean) => Promise<void>;
  /** Masque un projet de la liste de l'accueil, sans toucher à ses fichiers. */
  hideProject: (id: string) => Promise<void>;
  /** Réaffiche un projet masqué. */
  showProject: (id: string) => Promise<void>;
  /** Supprime un projet pour de bon, après confirmation à l'accueil. Rend faux si la suppression a échoué. */
  deleteProject: (id: string) => Promise<boolean>;
  /** Le dossier du projet n'a pas pu être ouvert : un message, à l'accueil, invite à le choisir à nouveau. */
  openFailed: boolean;
  dismissOpenFailed: () => void;
  lastFiles: FileMap;

  /** Cadres de regroupement, affichés derrière les cartes. */
  frames: FrameNode[];
  /** Nouveau cadre : autour des cartes sélectionnées s'il y en a, sinon centré sur le point donné. */
  addFrame: (center: { x: number; y: number }) => string;
  updateFrame: (id: string, patch: { title: string }) => void;
  /** Verrouille ou déverrouille un cadre (« Organiser » n'y touche plus), une étape d'historique. */
  toggleFrameLock: (id: string) => void;
  /** Supprime le cadre ; les cartes qu'il contenait restent. */
  deleteFrame: (id: string) => void;
  onNodesChange: (changes: NodeChange<CardNode | FrameNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;

  /** `height` : hauteur à réserver quand on la connaît d'avance (carte qui va recevoir une image). */
  addCard: (pos: { x: number; y: number }, type?: CardType, height?: number) => string;
  /** Carte créée depuis une autre vue (Bible, scénario) : posée sur la première place libre, sans prendre le focus. */
  addTitledCard: (type: CardType, title: string) => string;
  /** Carnet : une capture (première ligne = titre) devient une carte à ranger. Rend son identifiant, ou null si vide. */
  captureCard: (type: CardType, text: string) => string | null;
  /** Ces cartes sont rangées : elles quittent « À ranger ». */
  fileInbox: (ids: string[]) => void;
  /** Tire un fil entre deux cartes s'il n'y en a pas, sinon retire celui (ou ceux) qui les relie. */
  toggleLink: (a: string, b: string) => void;
  /** Tire un fil étiqueté entre deux cartes, s'il n'y en a pas déjà un. */
  linkCards: (source: string, target: string, label: string) => void;
  updateCard: (id: string, patch: Partial<Omit<CardData, "id">>) => void;
  /** Élargit ou rétrécit une carte (clavier) ; la hauteur suit le contenu. */
  resizeCard: (id: string, delta: number) => void;
  /** Copie l'image dans medias/ et la pose sur la carte. Rend faux si ce n'est pas une image ou si la copie échoue. */
  setCardImage: (id: string, file: { name: string; data: Uint8Array }) => Promise<boolean>;
  /** Image déposée sur le canevas : une nouvelle carte la porte. */
  addImageCard: (pos: { x: number; y: number }, file: { name: string; data: Uint8Array }) => Promise<string | null>;
  /** Bouton de la carte : l'auteur choisit un fichier image. */
  pickCardImage: (id: string) => Promise<void>;
  /** Galerie d'une fiche : ajoute des photos (choisies ou déposées), en une étape d'historique. */
  addGalleryImages: (id: string, files?: { name: string; data: Uint8Array }[]) => Promise<number>;
  /** Retire une photo de la galerie (le fichier reste dans medias/, l'annulation la rend). */
  removeGalleryImage: (id: string, name: string) => void;
  /** Une photo de la galerie devient l'image principale (le portrait) ; l'ancienne rejoint la galerie. */
  useAsMainImage: (id: string, name: string) => void;
  deleteCard: (id: string) => void;
  /** Plusieurs cartes à la corbeille (sélection), une seule étape d'historique. */
  deleteCards: (ids: string[]) => void;
  /** Sélectionne toutes les cartes et tous les cadres (Ctrl ou Cmd + A). */
  selectAll: () => void;
  /** Plus rien de sélectionné (Échap, bouton de la barre de sélection). */
  clearSelection: () => void;
  /** Retire un fil (« Délier »), une étape d'historique. */
  removeLink: (id: string) => void;
  renameLink: (id: string, label: string) => void;
  /** Fiche d'un fil (lot 7) : un champ, vidé pour le retirer. */
  setWireFiche: (id: string, field: WireField, value: string) => void;

  setView: (view: View, focusId?: string | null) => void;
  /** Ouvre le projet sélectionné dans le stockage, ou démarre le projet d'exemple si l'emplacement est vide. */
  load: () => Promise<void>;
  openFolder: () => Promise<void>;
  save: () => Promise<void>;
  /**
   * Fichiers changés hors de l'app des deux côtés : la version du disque reste en place, celle de l'app
   * est écrite à côté (« … (MondoWrite).md »), jusqu'au choix de l'auteur. Jamais enregistré dans le projet.
   */
  conflicts: FileConflict[];
  /** Pourquoi le dernier enregistrement a échoué (null s'il a réussi), pour un message et des actions adaptés. */
  saveError: SaveErrorKind | null;
  /** Dossier introuvable ou refusé : l'auteur indique où est le projet maintenant (ordinateur), puis on enregistre. */
  relocateProject: () => Promise<void>;
  /** Dernier recours : tout le projet (textes et réglages) dans un .zip, là où l'auteur le choisit. */
  exportProjectCopy: () => Promise<boolean>;
  /** Tout le projet (textes, réglages, images et PDF) dans un .zip, à ouvrir sur un autre ordinateur par « Importer un projet ». */
  projectZip: () => Promise<{ name: string; extension: string; mime: string; data: Uint8Array } | null>;
  /** L'auteur choisit : sa version (elle remplace celle du disque) ou celle du disque (reprise dans l'app). */
  resolveConflict: (path: string, keep: "mine" | "disk") => Promise<void>;
  /**
   * Relit le dossier du projet (surveillance du dossier, retour dans la fenêtre) : ce qui a changé ailleurs
   * sans modification ici est repris ; ce qui a changé des deux côtés devient un conflit.
   */
  syncFromDisk: () => Promise<void>;
}

/** Ce qu'une annulation restaure. Les réglages du projet (titre, type, format) n'en font pas partie. */
export interface Snapshot {
  nodes: CardNode[];
  frames: FrameNode[];
  edges: Edge[];
  screenplay: Screenplay | null;
  plan: Plan;
  trash: TrashedCard[];
}

/** Hauteur réservée pour l'image d'une carte créée par dépôt (voir .card-image dans styles.css). */
const IMAGE_ROOM = 220;

/** Carte encore vide (ni titre, ni texte, ni image), Idée ou Lien/Image tout juste créé : elle peut devenir ce qu'on y colle. */
/** Espace laissé entre les cadres verrouillés et le reste du canevas rangé sous eux. */
const LOCKED_GAP = 120;
const insideBox = (x: number, y: number, b: { x: number; y: number; width: number; height: number }) =>
  x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

/**
 * Cartes tenues par un cadre verrouillé (leur centre est dedans) : elles ne bougent plus, ni à la main
 * ni par « Organiser ». On peut toujours les modifier, les relier ou les supprimer.
 */
/** Endroit du scénario sans carte : « @12 » vise l'élément au rang 12 (en-tête, note, page) ; un identifiant de carte n'a jamais de @. */
export const SCENE_AT = "@";

export function heldCardIds(nodes: CardNode[], frames: FrameNode[]): Set<string> {
  const locked = frames.filter((f) => f.data.locked).map(frameBox);
  if (locked.length === 0) return new Set();
  const sizes = boxes(nodes);
  return new Set(nodes.filter((_, i) => locked.some((f) => insideBox(sizes[i].x + sizes[i].width / 2, sizes[i].y + sizes[i].height / 2, f))).map((n) => n.id));
}

const isBlankCard = (card: CardData) =>
  !card.title.trim() && !card.image && !(card.html ?? "").replace(/<[^>]*>/g, "").trim() && ["idee", "lien", "image"].includes(card.type);

const HISTORY_LIMIT = 100;
/** Deux gestes de même nature rapprochés (lettres d'un titre, déplacement) ne font qu'une étape. */
const HISTORY_MERGE_MS = 800;

export const useCosmos = create<CosmosState>((set, get) => {
  const touch = () => set({ status: "modifie" });

  /**
   * Copie un PDF dans medias/ avec l'aperçu de sa première page, et lit ce qu'il dit de lui-même (titre,
   * auteur, année, pages). Un PDF que pdf.js ne sait pas lire (chiffré, abîmé) est gardé quand même, sans
   * aperçu. Rend null si ce n'est pas un PDF ou si la copie échoue.
   */
  const storeDocument = async (file: { name: string; data: Uint8Array }) => {
    if (!documentExtension(file.name)) return null;
    const base = newId();
    const fichier = `${base}.pdf`;
    try {
      await storage.writeMedia(fichier, file.data);
    } catch (err) {
      console.error(err);
      return null;
    }
    let info: { pages: number; title: string; author: string; year: string; thumbnail: Uint8Array | null } = { pages: 0, title: "", author: "", year: "", thumbnail: null };
    try {
      info = await (await import("./pdfDocument")).readPdf(file.data);
    } catch (err) {
      console.error(err);
    }
    let image: string | undefined;
    if (info.thumbnail) {
      try {
        await storage.writeMedia(`${base}.jpg`, info.thumbnail);
        image = `${base}.jpg`;
      } catch (err) {
        console.error(err);
      }
    }
    return { fichier, image, title: documentTitle(info.title, file.name), fiche: documentFiche(info) };
  };

  /**
   * Cartes `ids` à la corbeille, à partir de l'état donné : leurs fils et leur scène du scénario partent
   * avec elles, leurs mentions dans les autres cartes redeviennent du texte. Pas d'étape d'historique ici.
   */
  const toTrash = (ids: string[], from: { nodes: CardNode[]; edges: Edge[]; screenplay: Screenplay | null }) => {
    const gone = new Set(ids);
    let { screenplay } = from;
    const entries: TrashedCard[] = [];
    const date = dayKey(new Date());
    for (const id of ids) {
      const node = from.nodes.find((n) => n.id === id);
      if (!node) continue;
      const out = trashCard(node.data, { x: node.position.x, y: node.position.y, width: typeof node.style?.width === "number" ? node.style.width : undefined }, from.edges, screenplay, date);
      entries.push(out.entry);
      screenplay = out.screenplay;
    }
    let nodes = from.nodes.filter((n) => !gone.has(n.id));
    for (const id of ids) nodes = nodes.map((n) => withHtml(n, removeMentions(n.data.html, id)));
    const first = entries[0];
    return {
      nodes,
      edges: from.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
      screenplay,
      trash: [...entries, ...get().trash.filter((c) => !gone.has(c.id))],
      trashNotice: first ? { count: entries.length, title: first.title.trim(), at: Date.now() } : get().trashNotice,
    };
  };

  // Historique : chaque action qui change les cartes, les fils ou leur lien avec le scénario
  // appelle record() AVANT de modifier l'état.
  let lastTag = "";
  let lastAt = 0;
  const record = (tag = "") => {
    const now = Date.now();
    const merge = tag !== "" && tag === lastTag && now - lastAt < HISTORY_MERGE_MS;
    lastTag = tag;
    lastAt = now;
    if (merge) return;
    const { nodes, frames, edges, screenplay, plan, trash, past } = get();
    set({ past: [...past.slice(-(HISTORY_LIMIT - 1)), { nodes, frames, edges, screenplay, plan, trash }], future: [] });
  };
  const forgetHistory = () => {
    lastTag = "";
    if (get().past.length > 0 || get().future.length > 0) set({ past: [], future: [] });
  };
  /** Ordre du récit : celui du Plan (roman), celui du fichier Fountain (scénario), puis les scènes pas encore écrites. */
  const storyOrder = (nodes: CardNode[]): string[] => {
    const { plan, kind, screenplay } = get();
    const ids = planScenes(nodes);
    if (kind !== "scenario" || !screenplay) return planOrder(plan, ids);
    const known = new Set(ids);
    const linked = [...new Set(listScenes(screenplay.elements).map((s) => s.cardId ?? ""))].filter((id) => known.has(id));
    const written = new Set(linked);
    return [...linked, ...ids.filter((id) => !written.has(id))];
  };
  /**
   * Range tout le canevas (« Organiser »). `before` est appelé juste avant le changement (étape
   * d'historique) ; rien n'est appelé s'il n'y a rien à ranger.
   */
  const arrangeCanvas = (before: () => void) => {
    const { nodes, edges, plan, kind } = get();
    // Les cadres verrouillés restent tels quels, avec les cartes dont le centre est dedans. Tout le reste
    // se range, Liens, Images et Documents compris, sous ces cadres pour ne jamais les chevaucher.
    const locked = get().frames.filter((f) => f.data.locked).map(frameBox);
    const held = heldCardIds(nodes, get().frames);
    const arranged = nodes.filter((n) => !held.has(n.id));
    if (arranged.length === 0) return;
    const t = getT();
    const types = kind === "scenario" ? { ...t.types, ...t.scenario.types } : t.types;
    const sizes = boxes(arranged);
    // Un scénario a son plan dans le fichier Fountain : ses sections de gabarit font les cases.
    const story = kind === "scenario" ? screenplayPlan(get().screenplay?.elements ?? []) : plan;
    const result = organize({
      cards: arranged.map((n, i) => ({ id: n.id, type: n.data.type, width: sizes[i].width, height: sizes[i].height })),
      plan: story,
      sceneIds: kind === "scenario" ? storyOrder(arranged) : planScenes(arranged),
      labels: {
        groups: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, v.section])) as Record<CardType, string>,
        beat: (key) => beatText(key, t.plan.beats as Record<string, { label: string; hint: string }>, story.custom).label,
        chapter: (n, title) => (title ? fmt(t.chapters.numberedTitle, { n, title }) : fmt(t.chapters.numbered, { n })),
        continued: (label) => fmt(t.organize.continued, { label }),
        unplaced: t.plan.unplaced,
        story: types.scene.section,
        pages: t.organize.pages,
      },
      origin:
        locked.length > 0
          ? { x: Math.min(...locked.map((f) => f.x), ...sizes.map((b) => b.x)), y: Math.max(...locked.map((f) => f.y + f.height)) + LOCKED_GAP }
          : { x: Math.min(...sizes.map((b) => b.x)), y: Math.min(...sizes.map((b) => b.y)) },
      newId,
    });
    before();
    let nextEdges = edges;
    const linked = (a: string, b: string) => nextEdges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
    for (const [source, target] of result.sequence) {
      if (linked(source, target)) continue;
      nextEdges = addEdge({ id: newId(), source, target, sourceHandle: null, targetHandle: null, label: t.chapters.next, type: "floating" }, nextEdges);
    }
    const positions = result.positions;
    set({
      nodes: nodes.map((n) => {
        const at = positions.get(n.id);
        return at ? { ...n, position: at, selected: false } : n;
      }),
      // Les cadres d'avant se vidaient : ils sont remplacés par ceux du rangement, sauf les cadres verrouillés.
      frames: [...get().frames.filter((f) => f.data.locked).map((f) => ({ ...f, selected: false })), ...result.frames.map(toFrameNode)],
      edges: nextEdges,
    });
    touch();
  };
  /**
   * Le récit vient de changer d'ordre (Plan, Manuscrit, séquencier, liste des scènes) : le canevas suit, sans
   * passer par « Organiser » et dans la même étape d'historique que le déplacement. Un canevas déjà rangé
   * (des cadres du récit : cases, chapitres, « Scènes ») est rangé de nouveau ; sinon les scènes échangent
   * leurs places, et le reste du canevas ne bouge pas. Les cartes tenues par un cadre verrouillé restent.
   */
  const followStory = () => {
    const { nodes, frames } = get();
    const held = heldCardIds(nodes, frames);
    const t = getT();
    const sizes = boxes(nodes);
    const sceneIds = new Set(planScenes(nodes));
    const storyFrames = frames.filter((f) => {
      if (f.data.locked) return false;
      const box = frameBox(f);
      return nodes.some((n, i) => sceneIds.has(n.id) && insideBox(sizes[i].x + sizes[i].width / 2, sizes[i].y + sizes[i].height / 2, box));
    });
    const pattern = (s: string) => new RegExp(`^${s.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{n\}/g, "\\d+").replace(/\{title\}/g, ".+")}$`);
    const chapterTitle = [pattern(t.chapters.numbered), pattern(t.chapters.numberedTitle), pattern(fmt(t.organize.continued, { label: t.chapters.numbered }))];
    const own = get().kind === "scenario" ? customOf(get().screenplay?.elements ?? []) : get().plan.custom;
    const known = new Set([
      ...Object.values(t.plan.beats).map((b) => b.label),
      ...(own?.beats ?? []).map((b) => b.label),
      t.plan.unplaced,
      t.types.scene.section,
      t.scenario.types.scene?.section ?? t.types.scene.section,
    ]);
    const organized =
      storyFrames.length > 0 && storyFrames.every((f) => known.has(f.data.title) || chapterTitle.some((re) => re.test(f.data.title)));
    if (organized) return arrangeCanvas(() => {});
    const free = nodes.filter((n) => sceneIds.has(n.id) && !held.has(n.id));
    const moved = reorderSlots(
      free.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
      storyOrder(nodes),
    );
    if (moved.size === 0) return;
    set({ nodes: nodes.map((n) => (moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n)) });
  };
  /** Case d'avant → case nouvelle, pour les cases d'un gabarit de l'auteur nées d'un gabarit en place. */
  const fromMap = (rows: { from?: string; label: string }[], beats: CustomTemplate["beats"]): Map<string, string> => {
    const named = rows.filter((r) => r.label.trim());
    return new Map(named.flatMap((r, i) => (r.from && beats[i] ? [[r.from, beats[i].key] as [string, string]] : [])));
  };
  /**
   * Scènes lâchées à la main sur le canevas : celle qui tombe dans le cadre d'une case (posé par « Organiser »)
   * y est rangée, à la place que donne sa position parmi les scènes de la case (lecture de gauche à droite,
   * puis de haut en bas). Rien ne change si elle y était déjà à cette place.
   */
  const dropIntoBeats = (ids: Set<string>) => {
    const { nodes, frames, kind, screenplay, plan } = get();
    const beatFrames = frames.filter((f) => f.data.beat && !f.data.locked);
    if (beatFrames.length === 0) return;
    const held = heldCardIds(nodes, frames);
    const story = new Set(planScenes(nodes));
    const current = kind === "scenario" ? screenplayPlan(screenplay?.elements ?? []) : plan;
    const sizes = boxes(nodes);
    const center = new Map(nodes.map((n, i) => [n.id, { x: sizes[i].x + sizes[i].width / 2, y: sizes[i].y + sizes[i].height / 2, h: sizes[i].height, top: sizes[i].y + Math.min(40, sizes[i].height / 2) }]));
    for (const id of ids) {
      const c = center.get(id);
      if (!c || !story.has(id) || held.has(id)) continue;
      // On tient une carte par son en-tête : c'est lui qui dit dans quelle case elle tombe (une case vide
      // est moins haute qu'une scène).
      const frame = beatFrames.find((f) => insideBox(c.x, c.top, frameBox(f)));
      const beat = frame?.data.beat;
      if (!beat) continue;
      const before = (o: { x: number; y: number }) => (Math.abs(o.y - c.y) > c.h / 2 ? o.y < c.y : o.x < c.x);
      const others = (current.beats[beat] ?? []).filter((s) => s !== id && story.has(s));
      const index = others.filter((s) => {
        const o = center.get(s);
        return o ? before(o) : false;
      }).length;
      if ((current.beats[beat] ?? []).filter((s) => story.has(s)).indexOf(id) === index) continue;
      get().placeInBeat(id, beat, index);
    }
  };
  /** Cartes et cadres du canevas : une nouvelle carte ne se pose sur aucun d'eux. */
  const occupied = (nodes: CardNode[] = get().nodes, frames: FrameNode[] = get().frames): Occupied => ({ cards: boxes(nodes), frames: frames.map(frameBox) });
  const restore = (from: "past" | "future") => {
    const { past, future, nodes, frames, edges, screenplay, plan, trash } = get();
    const stack = from === "past" ? past : future;
    const target = stack[stack.length - 1];
    if (!target) return;
    lastTag = "";
    const here: Snapshot = { nodes, frames, edges, screenplay, plan, trash };
    set({
      past: from === "past" ? past.slice(0, -1) : [...past, here],
      future: from === "past" ? [...future, here] : future.slice(0, -1),
      nodes: target.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      frames: target.frames.map((f) => (f.selected ? { ...f, selected: false } : f)),
      edges: target.edges,
      screenplay: target.screenplay,
      plan: target.plan,
      trash: target.trash,
      trashNotice: null,
      pendingFocusId: null,
    });
    touch();
  };
  /** Adopte un projet lu sur disque. Rend faux si ces fichiers ne forment pas un projet. */
  const openFiles = (files: FileMap): boolean => {
    const project = deserialize(files);
    if (!project) return false;
    const { state, dirty } = openProject(project);
    set({
      ...state,
      lastFiles: files,
      conflicts: [],
      saveError: null,
      spotlightId: null,
      charFilter: null,
      wiresShown: [],
      filter: NO_FILTER,
      expandedId: null,
      cardMenu: null,
      screen: "project",
      view: "toile",
      focusId: null,
      openFailed: false,
      homeNotice: false,
      status: dirty ? "modifie" : "enregistre",
    });
    storage.remember({ title: state.title, kind: state.kind });
    return true;
  };
  // Dernier collage : le même collé deux fois de suite (deux événements pour un seul geste) ne fait qu'une carte.
  let lastPaste = { text: "", at: 0 };
  /** Fichiers du projet tel qu'il est à l'écran, comme ils seraient écrits (scénario inchangé : ses octets lus). */
  const currentFiles = (): FileMap => {
    const { screenplay, savedScreenplay, lastFiles: prev } = get();
    const files = serialize(toProject(get()));
    // Scénario inchangé depuis le disque : on garde le fichier tel quel, à l'octet près
    // (il peut venir d'un autre logiciel, que la sérialisation normaliserait).
    if (screenplay && screenplay === savedScreenplay && SCREENPLAY_FILE in prev) files[SCREENPLAY_FILE] = prev[SCREENPLAY_FILE];
    return files;
  };
  /**
   * Reprend dans le projet ouvert des fichiers changés hors de l'app (null : supprimé), sans toucher au reste :
   * le projet est relu à partir de ce qui est à l'écran, ces fichiers remplacés. L'historique d'annulation
   * repart de zéro (il ramènerait l'ancienne version).
   */
  const adoptDisk = (patch: Record<string, string | null>) => {
    if (Object.keys(patch).length === 0) return;
    const project = deserialize(patchFiles(currentFiles(), patch));
    if (!project) return;
    const { state } = openProject(project);
    const { screenplay, savedScreenplay, lastFiles } = get();
    set({
      ...state,
      // Scénario non repris : on garde l'objet à l'écran, et ce qu'il reste à enregistrer.
      ...(SCREENPLAY_FILE in patch ? {} : { screenplay, savedScreenplay }),
      lastFiles: patchFiles(lastFiles, patch),
    });
  };
  /** Pose un filtre : les cartes présentes forment sa base, celles qu'il masque ne restent pas sélectionnées. */
  const applyFilter = (next: CanvasFilter) => {
    if (!filterActive(next)) {
      set({ filter: NO_FILTER });
      return;
    }
    const filter = { ...next, base: get().nodes.map((n) => n.id) };
    const hidden = hiddenCards(get().nodes.map((n) => n.data), get().edges, filter);
    set({ filter, nodes: get().nodes.map((n) => (n.selected && hidden.has(n.id) ? { ...n, selected: false } : n)) });
  };
  /** Une relecture demandée pendant un enregistrement attend sa fin. */
  let syncing = false;
  let syncAgain = false;
  const refreshProjects = async () => {
    const { shown, hidden } = splitHidden(await storage.list().catch(() => []));
    set({ projects: shown, hiddenProjects: hidden });
  };

  return {
    title: "",
    kind: "roman",
    setTitle: (title) => {
      const { title: previous, screenplay } = get();
      const key = screenplay && Object.keys(screenplay.titlePage).find((k) => k.trim().toLowerCase() === "title");
      // La page de titre suit tant qu'elle portait le titre du projet ; un titre écrit à la main n'est pas touché.
      if (screenplay && key && title.trim() && screenplay.titlePage[key].trim() === previous.trim()) {
        forgetHistory(); // la page de titre change hors historique
        set({ title, screenplay: { ...screenplay, titlePage: { ...screenplay.titlePage, [key]: title.trim() } } });
      } else {
        set({ title });
      }
      touch();
    },
    setKind: (kind) => {
      // Le type de projet peut créer le scénario : l'historique d'avant ne vaut plus.
      forgetHistory();
      const { screenplay, title, nodes, paperChosen } = get();
      // Premier passage en scénario : un en-tête par carte Scène. Le retour en roman ne supprime rien.
      if (kind === "scenario" && !screenplay) set({ kind, screenplay: firstScreenplay(title, nodes) });
      else set({ kind });
      // Les notes des cartes Scène passent dans leur synopsis (fiche d'un roman, Fountain d'un scénario).
      if (kind !== "scenario") set({ nodes: foldNovelNodes(get().nodes) });
      else set(foldScreenplayNotes(get().nodes, get().screenplay));
      // Et un format de page : A4 si l'interface est en français, US Letter sinon.
      if (kind === "scenario" && !paperChosen) set({ paper: defaultPaper(useSettings.getState().lang), paperChosen: true });
      touch();
    },
    answerQuestion: (id, key, question, answer) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card) return;
      const patch = placeAnswer(card, key, answer);
      if (!patch) return;
      // Une question gardée pour plus tard, qui reçoit enfin sa réponse, quitte la liste.
      const questions = removeQuestion(card.questions, question);
      get().updateCard(id, questions === card.questions ? patch : { ...patch, questions });
    },
    setReponse: (id, key, answer) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card || (card.reponses?.[key] ?? "") === answer) return;
      record(`card:${id}:reponse:${key}`);
      const reponses = { ...(card.reponses ?? {}) };
      if (answer.trim()) reponses[key] = answer;
      else delete reponses[key];
      const next = Object.keys(reponses).length > 0 ? reponses : undefined;
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, reponses: next } } : n)) });
      touch();
    },
    parkQuestion: (id, question) => {
      const { nodes, edges } = get();
      const character = nodes.find((n) => n.id === id)?.data;
      if (!character || !question.trim() || isParked(nodes.map((n) => n.data), edges, id, question)) return false;
      // La question reste dans la carte du personnage : rien de plus sur le canevas.
      get().updateCard(id, { questions: addQuestion(character.questions, question) });
      return true;
    },
    dropQuestion: (id, question) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card) return;
      const questions = removeQuestion(card.questions, question);
      if (questions !== card.questions) get().updateCard(id, { questions });
    },
    setFiche: (id, field, value) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card || (card.fiche?.[field] ?? "") === value) return;
      // Les lettres d'un même champ tapées d'affilée ne font qu'une étape d'historique.
      record(`card:${id}:fiche:${field}`);
      const fiche = setFicheField(card.fiche, field, value);
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, fiche } } : n)) });
      touch();
    },
    openInBible: (id, assistant = false) => {
      if (!get().nodes.some((n) => n.id === id)) return;
      set({ view: "bible", bibleTarget: { id, assistant } });
    },
    bibleTarget: null,
    clearBibleTarget: () => set({ bibleTarget: null }),
    dialog: null,
    // Ouvrir la corbeille efface le message « mis à la corbeille » : on y est.
    setDialog: (dialog) => set({ dialog, ...(dialog === "trash" ? { trashNotice: null } : {}), ...(dialog !== "card" ? { expandedId: null } : {}) }),
    charFilter: null,
    setCharFilter: (charFilter) => set({ charFilter }),
    spotlightId: null,
    setSpotlight: (spotlightId) => set({ spotlightId: spotlightId && get().nodes.some((n) => n.id === spotlightId) ? spotlightId : null }),
    filter: NO_FILTER,
    setFilterTypes: (types) => applyFilter({ ...get().filter, types }),
    setFilterCard: (card) => applyFilter({ ...get().filter, card }),
    clearFilter: () => set({ filter: NO_FILTER }),
    expandedId: null,
    expandCard: (id) => {
      if (id && !get().nodes.some((n) => n.id === id)) return;
      set({ expandedId: id, dialog: id ? "card" : null, cardMenu: null });
    },
    cardMenu: null,
    setCardMenu: (cardMenu) => set({ cardMenu }),
    addResearchCard: ({ title, html, fiche, image, fichier, type = "idee" }, at) => {
      record();
      // Comme dans Milanote : la carte naît là où l'on colle ou dépose, sans cadre imposé. « Organiser » la
      // rangera plus tard dans le cadre de son type (Images, Liens, Idées en vrac).
      const size = { width: CARD_SIZE.width, height: image ? CARD_SIZE.height + IMAGE_ROOM : CARD_SIZE.height };
      const taken = occupied();
      const spot = at ? placeCard({ x: at.x - 20, y: at.y - 20 }, taken, size) : firstFreeCell(taken, size);
      const card: CardData = { id: newId(), type, title, html, ...(fiche && Object.keys(fiche).length > 0 ? { fiche } : {}), ...(image ? { image } : {}), ...(fichier ? { fichier } : {}) };
      // Scénario : une Scène qui arrive avec son en-tête entre aussitôt dans le texte, comme une carte titrée.
      const { screenplay, kind } = get();
      set({
        nodes: [...get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...toNode(card, spot.x, spot.y), selected: true }],
        ...(type === "scene" && title.trim() && kind === "scenario" && screenplay ? { screenplay: appendScene(screenplay, { id: card.id, title }) } : {}),
      });
      touch();
      return card.id;
    },
    addResearchImage: async (file, at) => {
      const ext = imageExtension(file.name);
      if (!ext) return null;
      const name = `${newId()}.${ext}`;
      try {
        await storage.writeMedia(name, file.data);
      } catch (err) {
        console.error(err);
        return null;
      }
      return get().addResearchCard({ type: "image", title: "", html: "", image: name, fiche: { consulte: today(useSettings.getState().lang) } }, at);
    },
    addDocument: async (file, at) => {
      const stored = await storeDocument(file);
      if (!stored) return null;
      const id = get().addResearchCard({ type: "document", title: stored.title, html: "", fichier: stored.fichier, ...(stored.image ? { image: stored.image } : {}), fiche: stored.fiche }, at);
      // La place libre la plus proche peut être hors de l'écran : on montre la carte.
      set({ focusId: id });
      return id;
    },
    setCardDocument: async (id, file) => {
      if (!get().nodes.some((n) => n.id === id)) return false;
      const stored = await storeDocument(file);
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!stored || !card) return false;
      record();
      // Rien de ce que l'auteur a écrit n'est remplacé : titre, image et champs déjà remplis restent.
      get().updateCard(id, {
        type: "document",
        fichier: stored.fichier,
        ...(card.title.trim() ? {} : { title: stored.title }),
        ...(card.image || !stored.image ? {} : { image: stored.image }),
        fiche: { ...stored.fiche, ...(card.fiche ?? {}) },
      });
      return true;
    },
    pickImageCard: async (at) => {
      const file = await storage.pickImage(getT().card.imageFiles).catch((err) => {
        console.error(err);
        return null;
      });
      if (!file) return;
      const id = await get().addResearchImage(file, at);
      if (id) set({ focusId: id });
    },
    linkFromTitle: (id) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card || card.type !== "lien" || card.fiche?.url) return false;
      const clip = clipFromText(card.title);
      if (!clip?.url) return false;
      get().updateCard(id, { title: clip.title, fiche: { ...(card.fiche ?? {}), url: clip.url, consulte: today(useSettings.getState().lang) } });
      void get().completeSource(id);
      return true;
    },
    pickDocument: async (id, at) => {
      const file = await storage.pickFile(getT().documents.pickLabel, ["pdf"]);
      if (!file) return;
      if (id) await get().setCardDocument(id, file);
      else await get().addDocument(file, at);
    },
    photoTarget: null,
    openPhotos: (target) => set({ photoTarget: target, dialog: "photos" }),
    replaceInit: null,
    replaceUndo: null,
    openReplace: (init = {}) => set({ replaceInit: { find: "", sceneId: null, renameId: null, ...init }, dialog: "replace", replaceUndo: null }),
    countReplace: (req) => applyReplace(get(), req).count,
    replaceText: (req) => {
      const before = get();
      const done = applyReplace(before, req);
      const renamed = req.renameId ? before.nodes.find((n) => n.id === req.renameId) : undefined;
      if (done.count === 0 && !renamed) return 0;
      // Ce qui change est gardé pour « Annuler » : le manuscrit n'est pas dans l'historique du canevas.
      set({
        replaceUndo: {
          manuscript: Object.fromEntries(Object.keys(done.manuscript).filter((id) => done.manuscript[id] !== before.manuscript[id]).map((id) => [id, before.manuscript[id] ?? ""])),
          screenplay: done.screenplay !== before.screenplay ? before.screenplay : undefined,
          html: Object.fromEntries(done.nodes.filter((n, i) => n !== before.nodes[i]).map((n) => [n.id, before.nodes.find((o) => o.id === n.id)!.data.html])),
          title: renamed ? { id: renamed.id, title: renamed.data.title } : undefined,
        },
      });
      record();
      set({ manuscript: done.manuscript, nodes: done.nodes });
      if (done.screenplay !== before.screenplay && done.screenplay) set({ screenplay: done.screenplay, nodes: titlesFromHeadings(get().nodes, done.screenplay) });
      // Renommer partout : la carte prend le nouveau nom (ses mentions suivent, comme pour tout renommage).
      if (renamed) get().updateCard(renamed.id, { title: req.replacement });
      touch();
      return done.count;
    },
    undoReplace: () => {
      const snap = get().replaceUndo;
      if (!snap) return;
      const manuscript = { ...get().manuscript };
      for (const [id, html] of Object.entries(snap.manuscript)) {
        if (html) manuscript[id] = html;
        else delete manuscript[id];
      }
      record();
      let nodes = get().nodes.map((n) => (n.id in snap.html ? withHtml(n, snap.html[n.id]) : n));
      if (snap.title) nodes = nodes.map((n) => (n.id === snap.title!.id ? { ...n, data: { ...n.data, title: snap.title!.title } } : n));
      if (snap.title) nodes = nodes.map((n) => withHtml(n, renameMentions(n.data.html, snap.title!.id, snap.title!.title)));
      set({ manuscript, nodes, replaceUndo: null });
      if (snap.screenplay !== undefined && snap.screenplay) set({ screenplay: snap.screenplay, nodes: titlesFromHeadings(get().nodes, snap.screenplay) });
      touch();
    },
    addPhoto: async (photo) => {
      const target = get().photoTarget;
      if (!target) return false;
      // La grande image d'abord ; si son hôte refuse (ou si elle est trop lourde), la suivante.
      let file: Awaited<ReturnType<typeof fetchImage>> = null;
      for (const url of photo.downloads) {
        file = await fetchImage(url).catch(() => null);
        if (file) break;
      }
      if (!file) return false;
      if (photo.source === "unsplash") void import("./imageSources").then((m) => m.trackChoice(photo, useSettings.getState().photos.keys.unsplash));
      if (target.kind === "gallery") return (await get().addGalleryImages(target.id, [file])) > 0;
      if (target.kind === "card") {
        if (!(await get().setCardImage(target.id, file))) return false;
        // Une carte Image sans référence reçoit le crédit de la photo (auteur, page, source et licence).
        const card = get().nodes.find((n) => n.id === target.id)?.data;
        if (card?.type === "image" && !card.fiche?.url) {
          get().updateCard(target.id, {
            fiche: { ...card.fiche, url: photo.page, ...(photo.author ? { auteur: photo.author } : {}), publication: photo.credit, consulte: today(useSettings.getState().lang) },
            ...(card.title.trim() ? {} : { title: photo.alt || (photo.author ? fmt(getT().photos.photoBy, { name: photo.author }) : "") }),
          });
        }
        return true;
      }
      const ext = imageExtension(file.name) ?? "jpg";
      const name = `${newId()}.${ext}`;
      try {
        await storage.writeMedia(name, file.data);
      } catch (err) {
        console.error(err);
        return false;
      }
      // Le crédit va dans la fiche de la carte (comme pour un lien) : auteur, page, source et licence.
      const t = getT().photos;
      const id = get().addResearchCard(
        {
          type: "image",
          title: photo.alt || (photo.author ? fmt(t.photoBy, { name: photo.author }) : ""),
          html: "",
          image: name,
          fiche: { url: photo.page, ...(photo.author ? { auteur: photo.author } : {}), publication: photo.credit, consulte: today(useSettings.getState().lang) },
        },
        target.at,
      );
      set({ focusId: id });
      return true;
    },
    documentCard: null,
    openDocument: (id) => {
      if (!get().nodes.find((n) => n.id === id)?.data.fichier) return;
      set({ documentCard: id, dialog: "document" });
    },
    addResearchClip: (text, at, image) => {
      const clip = clipFromText(text);
      if (!clip) return null;
      // Un seul geste qui arrive deux fois (collage et dépôt, ou deux écouteurs) : une seule carte.
      const now = Date.now();
      if (lastPaste.text === text.trim() && now - lastPaste.at < 1500) return null;
      lastPaste = { text: text.trim(), at: now };
      // Le même lien collé deux fois : on montre la carte existante au lieu d'en créer une autre.
      const same = clip.url ? get().nodes.find((n) => n.data.type === "lien" && n.data.fiche?.url === clip.url) : undefined;
      if (same) {
        set({ focusId: same.id });
        return same.id;
      }
      // Un lien : une carte Lien. Un en-tête de scène : une Scène. Un texte : une Idée qui le cite.
      const id = get().addResearchCard(
        clip.url
          ? { type: "lien", title: clip.title, html: "", fiche: { url: clip.url, consulte: today(useSettings.getState().lang) } }
          : { type: clip.type ?? "idee", title: clip.title, html: markdownToHtml(markHighlights(clip.markdown)) },
        at,
      );
      // L'adresse d'une image : la carte devient une Image si elle se télécharge, sinon elle reste un Lien.
      if (clip.url && (clip.image || image)) void get().linkToImage(id);
      // Un lien : le titre, l'auteur et l'image du site arrivent d'eux-mêmes, si la page se laisse lire.
      else if (clip.url) void get().completeSource(id);
      return id;
    },
    linkToImage: async (id) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      const url = card?.fiche?.url;
      if (!card || card.type !== "lien" || !url) return false;
      const file = await fetchImage(url).catch(() => null);
      let name: string | null = null;
      if (file) {
        name = `${newId()}.${imageExtension(file.name)}`;
        try {
          await storage.writeMedia(name, file.data);
        } catch (err) {
          console.error(err);
          name = null;
        }
      }
      if (!name) {
        void get().completeSource(id);
        return false;
      }
      // Hors historique, comme completeSource : le geste de l'auteur était le collage, déjà annulable d'un coup.
      const now = get().nodes.find((n) => n.id === id)?.data;
      if (!now || now.type !== "lien" || now.image) return false;
      const image = name;
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, type: "image" as const, image } } : n)) });
      touch();
      return true;
    },
    addTextFile: (fileName, text, at) => {
      const parsed = cardFromTextFile(fileName, text);
      if (!parsed) return null;
      const fiche = readFiche(parsed.fiche, parsed.type);
      return get().addResearchCard({ type: parsed.type, title: parsed.title, html: markdownToHtml(markHighlights(parsed.markdown)), ...(fiche ? { fiche } : {}) }, at);
    },
    cardCopy: null,
    copyCards: (ids) => {
      const chosen = new Set(ids);
      const { nodes, edges, manuscript, screenplay, kind } = get();
      const cards: CopiedCard[] = nodes
        .filter((n) => chosen.has(n.id))
        .map((n) => {
          const box = boxes([n])[0];
          const copied: CopiedCard = { data: structuredClone(n.data), x: n.position.x, y: n.position.y, width: box.width, height: box.height };
          if (n.data.type === "scene") {
            const at = screenplay && kind === "scenario" ? headingOf(screenplay.elements, n.id) : -1;
            if (screenplay && at >= 0) {
              copied.synopsis = sceneSynopsis(screenplay.elements, at);
              copied.body = structuredClone(sceneBody(screenplay.elements, at));
            } else if (manuscript[n.id]) copied.text = manuscript[n.id];
          }
          return copied;
        });
      if (cards.length === 0) return "";
      const copy: CardCopy = { cards, links: linksWithin(edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === "string" ? e.label : "" })), chosen), text: copyText(cards) || cards.map((c) => c.data.type).join(" ") };
      set({ cardCopy: copy });
      return copy.text;
    },
    pasteCards: (at) => {
      const copy = get().cardCopy;
      if (!copy || copy.cards.length === 0) return [];
      record();
      const bounds = copyBounds(copy.cards);
      // Sans endroit indiqué : juste à côté des cartes copiées. Le groupe garde sa disposition, sans chevaucher.
      const wanted = at ?? { x: bounds.x + 40, y: bounds.y + 40 };
      const origin = placeCard(wanted, occupied(), { width: bounds.width, height: bounds.height });
      const { cards, links } = pasteCopy(copy, origin, newId);
      let { screenplay, manuscript } = get();
      const { kind } = get();
      for (const c of cards) {
        if (c.data.type !== "scene") continue;
        // Roman : le texte de la scène vient avec elle (la copie n'est rangée ni dans le plan ni dans un chapitre).
        if (c.text) manuscript = { ...manuscript, [c.data.id]: c.text };
        // Scénario : une scène titrée entre à la fin du texte, avec son synopsis et son corps.
        if (screenplay && kind === "scenario" && c.data.title.trim()) {
          screenplay = appendScene(screenplay, { id: c.data.id, title: c.data.title });
          const head = headingOf(screenplay.elements, c.data.id);
          let elements = screenplay.elements;
          if (head >= 0 && c.synopsis) elements = setSceneSynopsis(elements, head, c.synopsis);
          if (head >= 0 && c.body?.length) elements = setSceneBody(elements, headingOf(elements, c.data.id), c.body);
          screenplay = { ...screenplay, elements };
        }
      }
      let edges = get().edges;
      for (const l of links) edges = addEdge({ id: newId(), source: l.source, target: l.target, sourceHandle: null, targetHandle: null, label: l.label ?? "", type: "floating" }, edges);
      set({
        nodes: [...get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...cards.map((c) => ({ ...toNode(c.data, c.x, c.y, c.width), selected: true }))],
        edges,
        manuscript,
        screenplay,
      });
      touch();
      return cards.map((c) => c.data.id);
    },
    duplicateCards: (ids) => {
      const keep = get().cardCopy;
      if (!get().copyCards(ids)) return [];
      const made = get().pasteCards();
      // Dupliquer ne remplace pas ce qu'on avait copié.
      set({ cardCopy: keep });
      return made;
    },
    pasteIntoCard: (id, text) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card || !text.trim()) return false;
      // Carte vide et adresse collée : la carte devient ce Lien (comme un collage dans son texte).
      if (get().turnIntoLink(id, text)) return true;
      const { screenplay, kind } = get();
      if (card.type === "scene") {
        const at = screenplay && kind === "scenario" ? headingOf(screenplay.elements, id) : -1;
        // Scénario : le texte s'ajoute au corps de la scène, en éléments Fountain.
        if (screenplay && at >= 0) {
          const body = [...sceneBody(screenplay.elements, at), ...fountainElements(text)];
          get().setSceneText(id, body);
          return true;
        }
        // Roman : à la fin du texte de la scène.
        if (kind !== "scenario") {
          get().setManuscriptText(id, appendHtml(get().manuscript[id], textToHtml(text)));
          return true;
        }
      }
      get().updateCard(id, { html: appendHtml(card.html, textToHtml(text)) });
      return true;
    },
    turnIntoLink: (id, text) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      const clip = clipFromText(text);
      if (!card || !clip?.url || !isBlankCard(card)) return false;
      get().updateCard(id, { type: "lien", title: clip.title, fiche: { ...(card.fiche ?? {}), url: clip.url, consulte: today(useSettings.getState().lang) } });
      void get().completeSource(id);
      return true;
    },
    turnIntoImage: async (id, file) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card || !isBlankCard(card) || !imageExtension(file.name)) return false;
      if (!(await get().setCardImage(id, file))) return false;
      get().updateCard(id, { type: "image", fiche: { consulte: today(useSettings.getState().lang) } });
      return true;
    },
    completeSource: async (id) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      const url = card ? sourceUrl(card) : null;
      if (!card || !url) return false;
      try {
        const info = await readPage(url);
        let image: string | undefined;
        if (info.image && !card.image) {
          const file = await fetchImage(info.image).catch(() => null);
          if (file) {
            image = `${newId()}.${imageExtension(file.name)}`;
            await storage.writeMedia(image, file.data);
          }
        }
        const host = hostOf(url);
        // La carte a pu changer pendant la lecture : on part de son état du moment.
        const now = get().nodes.find((n) => n.id === id)?.data;
        if (!now) return false;
        const fiche = { ...(now.fiche ?? {}) };
        if (!fiche.auteur && info.author) fiche.auteur = info.author;
        if (!fiche.publication && (info.site || info.published)) fiche.publication = [info.site, info.published].filter(Boolean).join(", ");
        const title = info.title && (!now.title.trim() || now.title.trim() === host) ? info.title : now.title;
        const patch: Partial<CardData> = { title, fiche, ...(image && !now.image ? { image } : {}) };
        set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) });
        touch();
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    },
    focusFrame: null,
    clearFocusFrame: () => set({ focusFrame: null }),
    openInManuscript: (id) => set({ view: "manuscrit", manuscriptTarget: id }),
    manuscriptTarget: null,
    clearManuscriptTarget: () => set({ manuscriptTarget: null }),
    toggleTodo: (id, where, index) => {
      if (where === "manuscript") {
        const html = get().manuscript[id];
        if (html) get().setManuscriptText(id, toggleTask(html, index));
        return;
      }
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card) return;
      const html = toggleTask(card.html, index);
      if (html !== card.html) get().updateCard(id, { html });
    },
    fitRequest: 0,
    addQuestionAbout: (title, cardIds) => {
      const { nodes, edges } = get();
      // Une seule étape d'historique pour la carte et ses fils.
      record();
      const card: CardData = { id: newId(), type: "question", title: title.trim(), html: "" };
      const spot = firstFreeCell(occupied(nodes));
      let next = edges;
      for (const target of new Set(cardIds)) {
        if (!nodes.some((n) => n.id === target)) continue;
        next = addEdge({ id: newId(), source: card.id, target, sourceHandle: null, targetHandle: null, label: "", type: "floating" }, next);
      }
      set({ nodes: [...nodes, toNode(card, spot.x, spot.y)], edges: next });
      touch();
      return card.id;
    },
    manuscript: {},
    setManuscriptText: (id, html) => {
      const manuscript = { ...get().manuscript };
      const before = manuscript[id] ?? "";
      const next = isBlank(html) ? "" : html;
      if (before === next) return;
      if (next) manuscript[id] = next;
      else delete manuscript[id];
      // Mots écrits aujourd'hui : le total du jour suit, à partir de la différence dans cette scène.
      const day = dayKey(new Date());
      const { progress } = get();
      const totalBefore = progress[day]?.end ?? Object.values(get().manuscript).reduce((sum, html) => sum + countWords(html), 0);
      const totalAfter = Math.max(0, totalBefore + countWords(next) - countWords(before));
      set({ manuscript, progress: recordProgress(progress, day, totalBefore, totalAfter) });
      touch();
    },
    goals: {},
    setGoals: (goals) => {
      set({ goals: readGoals(goals) });
      touch();
    },
    progress: {},
    pitch: {},
    chutier: [],
    addPassage: (passage) => {
      set({ chutier: [...get().chutier, passage] });
      touch();
    },
    removePassage: (id) => {
      if (!get().chutier.some((p) => p.id === id)) return;
      set({ chutier: get().chutier.filter((p) => p.id !== id) });
      touch();
    },
    metaKeep: {},
    setPitch: (key, value) => {
      const next = setPitchField(get().pitch, key, value);
      if (next === get().pitch) return;
      set({ pitch: next });
      touch();
    },
    print: DEFAULT_PRINT,
    setPrint: (patch) => {
      // Nettoyé à l'écriture (printToMeta) : ici, on garde la frappe telle quelle (espaces compris).
      const next = { ...get().print, ...patch };
      if (JSON.stringify(next) === JSON.stringify(get().print)) return;
      set({ print: next });
      touch();
    },
    scriptPdf: DEFAULT_SCRIPT_PRINT,
    setScriptPdf: (patch) => {
      const next = { ...get().scriptPdf, ...patch };
      if (JSON.stringify(next) === JSON.stringify(get().scriptPdf)) return;
      set({ scriptPdf: next });
      touch();
    },
    bibleExport: DEFAULT_BIBLE_EXPORT,
    setBibleExport: (next) => {
      if (JSON.stringify(next) === JSON.stringify(get().bibleExport)) return;
      set({ bibleExport: next });
      touch();
    },
    trash: [],
    trashNotice: null,
    clearTrashNotice: () => set({ trashNotice: null }),
    confirmChapter: null,
    askDeleteChapter: (id) => {
      if (get().plan.chapters?.some((c) => c.id === id)) set({ confirmChapter: id });
    },
    clearConfirmChapter: () => set({ confirmChapter: null }),
    restoreFromTrash: (id) => {
      const entry = get().trash.find((c) => c.id === id);
      if (!entry || get().nodes.some((n) => n.id === id)) return;
      record();
      const { nodes, edges, frames } = get();
      const out = restoreCard(entry, new Set(nodes.map((n) => n.id)), get().screenplay);
      // Sa place d'avant si elle est libre, sinon la première place libre à côté.
      const width = entry.trashed.width ?? CARD_WIDTH;
      const spot = placeCard({ x: entry.trashed.x, y: entry.trashed.y }, occupied(nodes, frames), { width, height: CARD_SIZE.height });
      set({
        nodes: [...nodes, toNode(out.card, spot.x, spot.y, entry.trashed.width)],
        edges: [...edges, ...out.links.filter((l) => !edges.some((e) => e.id === l.id)).map((l) => ({ ...l, type: "floating" }))],
        screenplay: out.screenplay,
        trash: get().trash.filter((c) => c.id !== id),
        focusId: id,
      });
      touch();
    },
    trashScreenplayScene: (start) => {
      const { screenplay, nodes } = get();
      const heading = screenplay?.elements[start];
      if (!screenplay || heading?.type !== "sceneHeading") return;
      if (heading.cardId && nodes.some((n) => n.id === heading.cardId)) return get().deleteCard(heading.cardId);
      // Scène sans carte : elle en reçoit une (comme toute scène écrite), qui part avec elle à la corbeille.
      record();
      const id = newId();
      const elements = screenplay.elements.slice();
      elements[start] = { ...heading, cardId: id };
      const spot = firstFreeCell(occupied(nodes));
      const card: CardData = { id, type: "scene", title: heading.text, html: "" };
      set(toTrash([id], { nodes: [...nodes, toNode(card, spot.x, spot.y)], edges: get().edges, screenplay: { ...screenplay, elements } }));
      touch();
    },
    purgeTrash: (id) => {
      const trash = id ? get().trash.filter((c) => c.id !== id) : [];
      if (trash.length === get().trash.length) return;
      record();
      set({ trash });
      touch();
    },
    restoreScene: (id) => {
      // Texte sans carte dont la carte est à la corbeille : elle revient telle qu'elle était.
      if (get().trash.some((c) => c.id === id)) return get().restoreFromTrash(id);
      if (get().nodes.some((n) => n.id === id) || !(id in get().manuscript)) return;
      record();
      const card: CardData = { id, type: "scene", title: "", html: "" };
      const spot = firstFreeCell(occupied());
      set({ nodes: [...get().nodes, toNode(card, spot.x, spot.y)] });
      touch();
    },
    plan: EMPTY_PLAN,
    setPlanTemplate: (template) => {
      const plan = setTemplate(get().plan, template);
      if (plan === get().plan) return;
      record();
      set({ plan });
      followStory();
      touch();
    },
    setCustomTemplate: (name, rows) => {
      const { kind, screenplay, plan } = get();
      if (kind === "scenario") {
        if (!screenplay) return;
        // Clés déjà prises dans le fichier : une case nouvelle n'en reprend jamais une.
        const used = screenplay.elements.flatMap((el) => (el.type === "section" ? [beatOf(el.text) ?? ""] : []));
        const beats = withKeys(rows, used);
        const next = applyCustom(screenplay, { name, beats }, fromMap(rows, beats));
        if (next !== screenplay) get().setScreenplay(next, true);
        return;
      }
      const used = [...Object.keys(plan.beats), ...(plan.custom?.beats.map((b) => b.key) ?? [])].filter(isCustomBeat);
      const custom: CustomTemplate = { name: name.trim(), beats: withKeys(rows, used) };
      if (custom.beats.length === 0) return;
      // Né du gabarit en place : chaque case nouvelle reprend les scènes de la case dont elle vient.
      const beatsOf = { ...plan.beats };
      for (const [old, key] of fromMap(rows, custom.beats)) if (plan.beats[old]?.length && !beatsOf[key]?.length) beatsOf[key] = [...plan.beats[old]];
      record();
      set({ plan: { ...plan, template: "perso", custom, beats: beatsOf } });
      followStory();
      touch();
    },
    placeInBeat: (id, beat, index) => {
      const { kind, screenplay } = get();
      if (kind !== "scenario") return get().placeInPlan(id, beat, index);
      if (!screenplay) return;
      const elements = placeSceneInBeat(screenplay.elements, id, beat, index);
      if (elements === screenplay.elements) return;
      get().setScreenplay({ ...screenplay, elements }, true);
    },
    placeInPlan: (id, beat, index) => {
      const plan = placeScene(get().plan, planScenes(get().nodes), id, beat, index);
      if (plan === get().plan) return;
      record();
      set({ plan });
      followStory();
      touch();
    },
    stepInPlan: (id, way) => {
      const plan = stepScene(get().plan, planScenes(get().nodes), id, way);
      if (plan === get().plan) return false;
      record();
      set({ plan });
      followStory();
      touch();
      return true;
    },
    moveBookScene: (id, target, side) => {
      const plan = moveSceneTo(get().plan, planScenes(get().nodes), id, target, side);
      if (plan === get().plan) return false;
      record();
      set({ plan });
      followStory();
      touch();
      return true;
    },
    stepBookScene: (id, way) => {
      const plan = stepSceneInBook(get().plan, planScenes(get().nodes), id, way);
      if (plan === get().plan) return false;
      record();
      set({ plan });
      followStory();
      touch();
      return true;
    },
    addPlanScene: (title, beat, chapterId) => {
      record();
      const card: CardData = { id: newId(), type: "scene", title, html: "" };
      const spot = firstFreeCell(occupied());
      const nodes = [...get().nodes, toNode(card, spot.x, spot.y)];
      let plan = placeScene(get().plan, planScenes(nodes), card.id, beat);
      // Sans chapitre précisé, la scène rejoint celui de la scène qui la précède dans le récit.
      let chapter = chapterId;
      if (chapter === undefined) {
        const order = planOrder(plan, planScenes(nodes));
        const before = order[order.indexOf(card.id) - 1];
        chapter = before ? (chapterOf(plan, before)?.id ?? null) : null;
      }
      if (chapter) plan = assignChapter(plan, card.id, chapter);
      set({ nodes, plan });
      touch();
      return card.id;
    },
    splitScene: (afterId, html) => {
      const { nodes, plan } = get();
      const after = nodes.find((n) => n.id === afterId);
      if (!after || after.data.type !== "scene") return null;
      record();
      const card: CardData = { id: newId(), type: "scene", title: "", html: "" };
      // Sur le canevas, juste sous la scène coupée : l'ordre par défaut (de haut en bas) reste juste.
      const [box] = boxes([after]);
      const spot = placeCard({ x: box.x, y: box.y + box.height + 24 }, occupied(nodes), { width: CARD_SIZE.width, height: CARD_SIZE.height });
      const next = [...nodes, toNode(card, spot.x, spot.y)];
      const ids = planScenes(next);
      const { beats } = arrange(plan, ids);
      const beat = beats.find((b) => b.ids.includes(afterId));
      let nextPlan = beat ? placeScene(plan, ids, card.id, beat.key, beat.ids.indexOf(afterId) + 1) : plan;
      const chapter = chapterOf(plan, afterId);
      if (chapter) nextPlan = assignChapter(nextPlan, card.id, chapter.id);
      const manuscript = { ...get().manuscript };
      if (!isBlank(html)) manuscript[card.id] = html;
      set({ nodes: next, plan: nextPlan, manuscript });
      touch();
      return card.id;
    },
    joinScenes: (fromId, intoId) => {
      const { nodes, manuscript } = get();
      if (!nodes.some((n) => n.id === fromId) || !nodes.some((n) => n.id === intoId)) return;
      const moved = manuscript[fromId] ?? "";
      const next = { ...manuscript };
      delete next[fromId];
      if (!isBlank(moved)) next[intoId] = isBlank(manuscript[intoId]) ? moved : `${manuscript[intoId]}${moved}`;
      set({ manuscript: next });
      get().deleteCard(fromId);
      // Une fusion n'est pas une suppression : pas de message « à la corbeille » (la fiche y reste, au cas où).
      set({ trashNotice: null });
    },
    startChapterAt: (sceneId) => {
      const id = newId();
      const plan = startChapter(get().plan, planOrder(get().plan, planScenes(get().nodes)), sceneId, id);
      if (plan === get().plan) return null;
      record();
      set({ plan });
      followStory();
      touch();
      return id;
    },
    setSceneChapter: (sceneId, chapterId) => {
      const plan = assignChapter(get().plan, sceneId, chapterId);
      if (plan === get().plan) return;
      record();
      set({ plan });
      followStory();
      touch();
    },
    renamePlanChapter: (id, title) => {
      const plan = renameChapter(get().plan, id, title);
      if (plan === get().plan) return;
      record(`chapter:${id}:title`);
      set({ plan });
      touch();
    },
    movePlanChapter: (id, before) => {
      const plan = moveChapter(get().plan, planScenes(get().nodes), id, before);
      if (plan === get().plan) return;
      record();
      set({ plan });
      followStory();
      touch();
    },
    deletePlanChapter: (id) => {
      const plan = removeChapter(get().plan, planOrder(get().plan, planScenes(get().nodes)), id);
      if (plan === get().plan) return;
      record();
      set({ plan });
      followStory();
      touch();
    },
    organizeCanvas: () => {
      // « Organiser » range tout le projet : le filtre et la mise en avant s'effacent d'abord.
      set({ filter: NO_FILTER, spotlightId: null });
      // Une seule étape d'historique : Ctrl/Cmd+Z remet le canevas tel qu'il était.
      arrangeCanvas(() => record());
      set({ view: "toile", fitRequest: Date.now() });
    },
    paper: "letter",
    paperChosen: false,
    setPaper: (paper) => {
      set({ paper, paperChosen: true });
      touch();
    },
    sceneNumbers: false,
    setSceneNumbers: (sceneNumbers) => {
      set({ sceneNumbers });
      touch();
    },
    underlineHeadings: false,
    setUnderlineHeadings: (underlineHeadings) => {
      set({ underlineHeadings });
      touch();
    },
    hideWires: false,
    setHideWires: (hideWires) => {
      // Masquer de nouveau repart de zéro : aucune carte n'a ses fils rallumés.
      set({ hideWires, wiresShown: [] });
      touch();
    },
    wiresShown: [],
    toggleCardWires: (id) => {
      const shown = get().wiresShown;
      set({ wiresShown: shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id] });
    },
    markdownCopies: true,
    setMarkdownCopies: (markdownCopies) => {
      set({ markdownCopies });
      touch();
    },
    focusMode: false,
    setFocusMode: (focusMode) => set({ focusMode }),
    nodes: [],
    edges: [],
    screenplay: null,
    savedScreenplay: null,
    setSceneText: (cardId, body) => {
      const { screenplay } = get();
      if (!screenplay) return null;
      const at = headingOf(screenplay.elements, cardId);
      const elements = setSceneBody(screenplay.elements, at, body);
      if (elements === screenplay.elements) return screenplay;
      // Comme l'éditeur de la vue Scénario : son propre historique, celui du canevas repart de zéro.
      const next = { ...screenplay, elements };
      get().setScreenplay(next);
      return next;
    },
    setCardSceneSynopsis: (cardId, text) => {
      const { screenplay } = get();
      if (!screenplay) return;
      const elements = setSceneSynopsis(screenplay.elements, headingOf(screenplay.elements, cardId), text);
      if (elements !== screenplay.elements) get().setScreenplay({ ...screenplay, elements }, true);
    },
    setScreenplay: (screenplay, undoable = false) => {
      if (undoable) record();
      else forgetHistory();
      const before = get().screenplay;
      // Mots écrits aujourd'hui : comme pour le manuscrit, le total du jour suit la différence de mots du scénario.
      const day = dayKey(new Date());
      const { progress } = get();
      const totalAfter = screenplayWords(screenplay);
      const totalBefore = progress[day]?.end ?? (before ? screenplayWords(before) : totalAfter);
      set({ screenplay, nodes: titlesFromHeadings(get().nodes, screenplay), progress: recordProgress(progress, day, totalBefore, totalAfter) });
      // Scènes déplacées (séquencier, liste des scènes) : le canevas suit l'ordre du fichier.
      const order = (sp: Screenplay | null) => (sp ? listScenes(sp.elements).map((s) => s.cardId ?? "").join(" ") : "");
      if (undoable && before && order(before) !== order(screenplay)) followStory();
      touch();
    },
    setTitlePageField: (field, value) => {
      const { screenplay, title } = get();
      if (!screenplay) return null;
      const before = readTitleField(screenplay.titlePage, field);
      let titlePage = writeTitleField(screenplay.titlePage, field, value);
      if (titlePage === screenplay.titlePage) return screenplay;
      // Premier nom d'auteur : la mention « Écrit par » se pose toute seule (on peut la changer ou l'effacer).
      if (field === "author" && !before && !readTitleField(titlePage, "credit")) {
        titlePage = writeTitleField(titlePage, "credit", getT().screenplay.titlePage.creditDefault);
      }
      if (field === "author") useSettings.getState().setAuthor(readTitleField(titlePage, "author"));
      const next = { ...screenplay, titlePage };
      const renamed = field === "title" && before.trim() === title.trim() && readTitleField(titlePage, "title") !== "";
      forgetHistory();
      set(renamed ? { screenplay: next, title: readTitleField(titlePage, "title") } : { screenplay: next });
      touch();
      return next;
    },
    past: [],
    future: [],
    undo: () => restore("past"),
    redo: () => restore("future"),
    revealCard: (id) => {
      if (!get().nodes.some((n) => n.id === id)) return;
      // Téléphone (Carnet) : pas de canevas, la carte s'ouvre dans la Bible.
      if (isPhone()) return get().openInBible(id);
      // La carte est mise en avant (les autres s'estompent) jusqu'au prochain clic sur le fond ou Échap.
      set({ view: "toile", focusId: id, spotlightId: id, nodes: get().nodes.map((n) => ({ ...n, selected: n.id === id })) });
    },
    view: "toile",
    focusId: null,
    pendingFocusId: null,
    clearPendingFocus: () => set({ pendingFocusId: null }),
    status: "enregistre",
    loaded: false,
    screen: "home",
    projects: [],
    hiddenProjects: [],
    homeNotice: false,

    start: async () => {
      await refreshProjects();
      set({ loaded: true, screen: "home" });
    },

    openProject: async (id) => {
      storage.select(id);
      set({ openFailed: false, homeNotice: false });
      const entry = get().projects.find((p) => p.id === id);
      startLoad(entry?.title || entry?.name || "");
      try {
        const files = await storage.readAll();
        // Dossier vidé ou déplacé depuis la dernière fois : on reste à l'accueil, avec un message.
        if (!files || !openFiles(files)) set({ homeNotice: true });
        else {
          // Déjà ouvert sur un autre appareil : lecture seule, avec un bandeau pour reprendre la main.
          const other = await otherHolder();
          if (other) set({ lockedBy: other });
          else {
            set({ lockedBy: null });
            await claimLock();
          }
        }
      } catch (err) {
        console.error(err);
        storage.forget();
        set({ openFailed: true });
      } finally {
        endLoad();
      }
    },

    createProject: async ({ title, kind }) => {
      if (!(await storage.create(title))) return;
      // L'emplacement choisi contient déjà un projet : on l'ouvre, on ne l'écrase pas.
      const existing = await storage.readAll().catch(() => null);
      if (existing && openFiles(existing)) return;
      void claimLock();
      const { state } = openProject({ meta: { version: 1, title, kind, layout: [], links: [] }, cards: [], screenplay: null });
      set({
        ...state,
        lastFiles: {},
        conflicts: [],
        saveError: null,
        spotlightId: null,
        charFilter: null,
        wiresShown: [],
        filter: NO_FILTER,
        expandedId: null,
        cardMenu: null,
        screen: "project",
        view: "toile",
        focusId: null,
        openFailed: false,
        homeNotice: false,
        status: "modifie",
      });
      await get().save();
    },

    importNotice: null,
    chooseCloudFolder: async () => {
      set({ importNotice: null, homeNotice: false, openFailed: false });
      if (await storage.cloud?.pick()) await refreshProjects();
    },
    gatherStrayProjects: async () => {
      await storage.gatherStray?.().catch(() => 0);
      await refreshProjects();
    },
    leaveCloudFolder: async () => {
      storage.cloud?.clear();
      await refreshProjects();
    },
    setIcloud: async (on) => {
      await storage.icloud?.set(on);
      await refreshProjects();
    },
    importProjectZip: async () => {
      set({ importNotice: null, homeNotice: false, openFailed: false });
      try {
        const picked = await storage.pickFile("ZIP", ["zip"]);
        if (!picked) return;
        const { unzipSync, strFromU8 } = await import("fflate");
        const entries = Object.entries(unzipSync(picked.data)).filter(([path]) => !path.endsWith("/") && !path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX"));
        // Un dossier zippé depuis le Finder ou l'Explorateur contient un dossier racine : on l'enlève.
        const roots = new Set(entries.map(([path]) => path.split("/")[0]));
        const prefix = roots.size === 1 && entries.every(([path]) => path.includes("/")) ? `${[...roots][0]}/` : "";
        const files: FileMap = {};
        const medias: [string, Uint8Array][] = [];
        for (const [path, data] of entries) {
          const name = path.slice(prefix.length);
          // Un .zip vient de n'importe où : seuls les fichiers d'un projet, aux noms sûrs, sont repris (jamais de « .. »).
          if (name.startsWith(`${MEDIA_DIR}/`)) {
            const media = name.slice(MEDIA_DIR.length + 1);
            if (isMediaName(media) || isDocumentName(media)) medias.push([media, data]);
          } else if (isProjectFilePath(name)) files[name] = strFromU8(data);
        }
        const imported = deserialize(files);
        if (!imported) {
          set({ homeNotice: true });
          return;
        }
        if (!(await storage.create(imported.meta.title))) return;
        // Ordinateur : le dossier choisi contient déjà un projet, on ne l'écrase jamais.
        if (await storage.readAll().catch(() => null)) {
          storage.forget();
          set({ importNotice: "taken" });
          return;
        }
        await storage.write(files, []);
        for (const [name, data] of medias) await storage.writeMedia(name, data);
        const written = await storage.readAll();
        if (!written || !openFiles(written)) set({ homeNotice: true });
      } catch (err) {
        console.error(err);
        storage.forget();
        set({ openFailed: true });
      }
    },

    importFile: async () => {
      set({ importNotice: null, homeNotice: false, openFailed: false });
      const t = getT();
      let file: { name: string; data: Uint8Array } | null = null;
      try {
        file = await storage.pickFile(t.home.fountainFiles, IMPORT_EXTENSIONS);
      } catch (err) {
        console.error(err);
        set({ importNotice: "empty" });
        return;
      }
      if (!file) return;
      const project = await projectFromFile(file, {
        fileName: file.name,
        locale: useSettings.getState().lang,
        linkLabel: t.screenplay.linkSetIn,
        newId,
      }).catch((err) => {
        console.error(err);
        return null;
      });
      if (!project) {
        set({ importNotice: "empty" });
        return;
      }
      if (!(await storage.create(project.meta.title))) return;
      // Jamais d'import par-dessus un projet existant : l'auteur choisit un dossier vide.
      if (await storage.readAll().catch(() => null)) {
        storage.forget();
        set({ importNotice: "taken" });
        return;
      }
      const { state } = openProject(project);
      set({
        ...state,
        savedScreenplay: null,
        lastFiles: {},
        conflicts: [],
        saveError: null,
        spotlightId: null,
        charFilter: null,
        wiresShown: [],
        filter: NO_FILTER,
        expandedId: null,
        cardMenu: null,
        screen: "project",
        view: "manuscrit",
        focusId: null,
        status: "modifie",
      });
      await get().save();
    },

    tryExample: async () => {
      // Créé d'office, sans dialogue : dossier cloud ou iCloud s'il y en a un, sinon Documents/MondoWrite (ordinateur).
      if (!(await storage.create(getT().demo.title, { auto: true }))) return;
      // Les gravures du conte, avant l'ouverture : les cartes les trouvent aussitôt dans medias/.
      // Un échec (quota du navigateur) laisse seulement les cartes sans image.
      try {
        const { demoMedia } = await import("./demoMedia");
        for (const [name, data] of demoMedia()) await storage.writeMedia(name, data);
      } catch (err) {
        console.error(err);
      }
      await get().load();
      if (get().screen === "project" && get().status === "modifie") await get().save();
      // Le projet d'exemple s'ouvre sur la visite guidée : c'est là qu'on découvre l'app.
      if (get().screen === "project") get().setTour(0);
    },
    tour: null,
    setTour: (tour) => set({ tour }),

    closeProject: async (force = false) => {
      if (!force) {
        // On retente aussi après un échec : la cause a pu disparaître (disque rebranché).
        if (get().status !== "enregistre") await get().save();
        // Toujours en échec : le projet reste à l'écran, un message propose de réessayer ou de quitter quand même.
        if (get().status === "erreur") return;
      }
      await releaseLock(get().lockedBy === null);
      await refreshProjects();
      set({ screen: "home", focusMode: false, lockedBy: null });
    },

    lockedBy: null,
    takeOver: async () => {
      try {
        const files = await storage.readAll();
        if (files) openFiles(files);
      } catch (err) {
        console.error(err);
        return;
      }
      set({ lockedBy: null });
      await claimLock();
    },

    hideProject: async (id) => {
      hideProject(id);
      await refreshProjects();
    },
    showProject: async (id) => {
      showProject(id);
      await refreshProjects();
    },
    deleteProject: async (id) => {
      let ok = true;
      try {
        await storage.deleteProject?.(id);
        showProject(id);
      } catch (err) {
        console.error(err);
        ok = false;
      }
      await refreshProjects();
      return ok;
    },
    openFailed: false,
    dismissOpenFailed: () => set({ openFailed: false }),
    lastFiles: {},

    frames: [],
    addFrame: (center) => {
      record();
      const chosen = get().nodes.filter((n) => n.selected);
      let frame: Frame;
      if (chosen.length > 0) {
        // Autour des cartes sélectionnées.
        const around = boxes(chosen);
        const left = Math.min(...around.map((b) => b.x)) - FRAME_PADDING.side;
        const top = Math.min(...around.map((b) => b.y)) - FRAME_PADDING.top;
        const right = Math.max(...around.map((b) => b.x + b.width)) + FRAME_PADDING.side;
        const bottom = Math.max(...around.map((b) => b.y + b.height)) + FRAME_PADDING.bottom;
        frame = { id: newId(), title: "", x: left, y: top, width: right - left, height: bottom - top };
      } else {
        // Sans sélection : un cadre vide, dans un espace libre près du centre de la vue (jamais sur des cartes ni un autre cadre).
        const spot = placeFrame({ x: Math.round(center.x - FRAME_SIZE.width / 2), y: Math.round(center.y - FRAME_SIZE.height / 2) }, occupied(), FRAME_SIZE);
        frame = { id: newId(), title: "", x: spot.x, y: spot.y, ...FRAME_SIZE };
      }
      set({ frames: [...get().frames.map((f) => ({ ...f, selected: false })), { ...toFrameNode(frame), selected: true }] });
      touch();
      return frame.id;
    },
    updateFrame: (id, patch) => {
      record(`frame:${id}:title`);
      set({ frames: get().frames.map((f) => (f.id === id ? { ...f, data: { ...f.data, ...patch } } : f)) });
      touch();
    },
    toggleFrameLock: (id) => {
      const frame = get().frames.find((f) => f.id === id);
      if (!frame) return;
      record();
      const locked = !frame.data.locked;
      const { locked: _old, ...rest } = frame.data;
      set({
        frames: get().frames.map((f) => (f.id === id ? { ...f, ...lockProps(locked), data: locked ? { ...rest, locked: true } : rest } : f)),
      });
      touch();
    },
    deleteFrame: (id) => {
      if (get().frames.find((f) => f.id === id)?.data.locked) return;
      record();
      set({ frames: get().frames.filter((f) => f.id !== id) });
      touch();
    },
    onNodesChange: (incoming) => {
      // Une carte tenue par un cadre verrouillé ne bouge pas (glisser, sélection multiple, flèches du clavier).
      const held = heldCardIds(get().nodes, get().frames);
      const changes = held.size > 0 ? incoming.filter((c) => !(c.type === "position" && held.has(c.id))) : incoming;
      if (changes.length === 0) return;
      const frameIds = new Set(get().frames.map((f) => f.id));
      const isFrame = (c: NodeChange<CardNode | FrameNode>) => "id" in c && frameIds.has(c.id);
      const frameChanges = changes.filter(isFrame) as NodeChange<FrameNode>[];
      const cardChanges = changes.filter((c) => !isFrame(c)) as NodeChange<CardNode>[];

      // Sélection et mesure ne modifient pas le projet, et n'entrent pas dans l'historique.
      const removed = cardChanges.filter((c) => c.type === "remove").map((c) => c.id);
      const widened = new Map<string, number>();
      for (const c of cardChanges) {
        if (c.type === "dimensions" && c.resizing !== undefined && c.dimensions) widened.set(c.id, c.dimensions.width);
      }
      const resized = widened.size > 0 || frameChanges.some((c) => c.type === "dimensions" && c.resizing !== undefined);
      const changed =
        resized || changes.some((c) => c.type === "position" || c.type === "remove") || cardChanges.some((c) => c.type === "dimensions");
      if (changes.some((c) => c.type === "remove")) record();
      else if (resized) record("resize");
      else if (changes.some((c) => c.type === "position")) record("move");

      // Un cadre qu'on déplace emmène les cartes qu'il contient (leur centre est dedans).
      // Pas quand on le redimensionne par le haut ou la gauche : sa position change, pas son contenu.
      let nodes = get().nodes;
      const frames = get().frames;
      const carried = new Map<string, { x: number; y: number }>();
      for (const change of frameChanges) {
        if (change.type !== "position" || !change.position) continue;
        if (frameChanges.some((c) => c.type === "dimensions" && c.id === change.id)) continue;
        const frame = get().frames.find((f) => f.id === change.id);
        if (!frame) continue;
        const box = frameBox(frame);
        const dx = change.position.x - box.x;
        const dy = change.position.y - box.y;
        if (dx === 0 && dy === 0) continue;
        nodes = nodes.map((n) => {
          const [card] = boxes([n]);
          const cx = card.x + card.width / 2;
          const cy = card.y + card.height / 2;
          const inside = cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
          return inside ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n;
        });
        // Et les cadres qu'il contient entièrement (un chapitre dans une case du gabarit).
        for (const inner of frames) {
          if (inner.id === frame.id || frameChanges.some((c) => "id" in c && c.id === inner.id)) continue;
          const b = frameBox(inner);
          if (b.x >= box.x && b.y >= box.y && b.x + b.width <= box.x + box.width && b.y + b.height <= box.y + box.height) {
            carried.set(inner.id, { x: b.x + dx, y: b.y + dy });
          }
        }
      }

      // Carte supprimée au clavier (Suppr) : même règle que le bouton ×, elle part à la corbeille.
      const trashed = removed.length > 0 ? toTrash(removed, { nodes, edges: get().edges, screenplay: get().screenplay }) : null;
      const { screenplay } = trashed ?? get();
      let nextNodes = applyNodeChanges(
        cardChanges.filter((c) => c.type !== "remove"),
        trashed ? trashed.nodes : nodes,
      );
      // Carnet : une carte posée à la main sur le canevas a trouvé sa place, elle quitte « À ranger ».
      const placed = new Set(cardChanges.flatMap((c) => (c.type === "position" && c.dragging === false ? [c.id] : [])));
      if (placed.size > 0) nextNodes = fileCards(nextNodes, placed);
      // Carte élargie par son bord : seule la largeur est retenue, la hauteur suit toujours le contenu.
      if (widened.size > 0) {
        nextNodes = nextNodes.map((n) => {
          const width = widened.get(n.id);
          if (width === undefined) return n;
          const { width: _w, height: _h, ...rest } = n;
          return { ...rest, style: { ...n.style, width: clampCardWidth(width) } };
        });
      }
      let nextFrames = frameChanges.length > 0 ? applyNodeChanges(frameChanges, frames) : frames;
      if (carried.size > 0) nextFrames = nextFrames.map((f) => (carried.has(f.id) ? { ...f, position: carried.get(f.id)! } : f));
      set({ nodes: nextNodes, frames: nextFrames, screenplay, ...(trashed ? { edges: trashed.edges, trash: trashed.trash, trashNotice: trashed.trashNotice } : {}) });
      if (changed) touch();
      // Une scène déposée dans le cadre d'une case du gabarit y est rangée, à la place où on l'a lâchée.
      if (placed.size > 0) dropIntoBeats(placed);
    },
    onEdgesChange: (changes) => {
      if (changes.some((c) => c.type === "remove")) record();
      set({ edges: applyEdgeChanges(changes, get().edges) });
      if (changes.some((c) => c.type === "remove")) touch();
    },
    onConnect: (c) => {
      record();
      // Les fils sont "flottants" : on ignore les points de connexion utilisés pour les tirer.
      const edge = { source: c.source, target: c.target, sourceHandle: null, targetHandle: null };
      // Carnet : une carte reliée a trouvé sa place, elle quitte « À ranger ».
      set({ edges: addEdge({ ...edge, id: newId(), label: "", type: "floating" }, get().edges), nodes: fileCards(get().nodes, new Set([c.source, c.target])) });
      touch();
    },

    addCard: (pos, type = "idee", height = CARD_SIZE.height) => {
      record();
      const card: CardData = { id: newId(), type, title: "", html: "" };
      // À l'endroit demandé s'il est libre, sinon juste à côté : deux cartes ne se chevauchent pas.
      const spot = placeCard(pos, occupied(), { width: CARD_SIZE.width, height });
      const node = { ...toNode(card, spot.x, spot.y), selected: true };
      set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node], pendingFocusId: card.id });
      touch();
      return card.id;
    },
    captureCard: (type, text) => {
      const card = capturedCard(newId(), type, text);
      if (!card) return null;
      record();
      const spot = firstFreeCell(occupied());
      set({ nodes: [...get().nodes, toNode(card, spot.x, spot.y)] });
      touch();
      return card.id;
    },
    fileInbox: (ids) => {
      const nodes = fileCards(get().nodes, new Set(ids));
      if (nodes === get().nodes) return;
      record();
      set({ nodes });
      touch();
    },
    addTitledCard: (type, title) => {
      record();
      const card: CardData = { id: newId(), type, title, html: "" };
      const spot = firstFreeCell(occupied());
      set({ nodes: [...get().nodes, toNode(card, spot.x, spot.y)] });
      touch();
      return card.id;
    },
    toggleLink: (a, b) => {
      const between = (e: Edge) => (e.source === a && e.target === b) || (e.source === b && e.target === a);
      if (!get().edges.some(between)) return get().linkCards(a, b, "");
      record();
      set({ edges: get().edges.filter((e) => !between(e)) });
      touch();
    },
    linkCards: (source, target, label) => {
      const linked = get().edges.some(
        (e) => (e.source === source && e.target === target) || (e.source === target && e.target === source),
      );
      if (linked || source === target) return;
      record();
      const edge = { source, target, sourceHandle: null, targetHandle: null };
      set({ edges: addEdge({ ...edge, id: newId(), label, type: "floating" }, get().edges), nodes: fileCards(get().nodes, new Set([source, target])) });
      touch();
    },
    updateCard: (id, patch) => {
      // Les lettres d'un titre ou d'un texte tapées d'affilée ne font qu'une étape d'historique.
      // Un changement de type ou d'image est toujours une étape à part.
      const keys = Object.keys(patch);
      const typed = keys.length === 1 && (keys[0] === "title" || keys[0] === "html");
      record(typed ? `card:${id}:${keys[0]}` : "");
      const before = get().nodes.find((n) => n.id === id)?.data;
      const leavesScene = before?.type === "scene" && patch.type !== undefined && patch.type !== "scene";
      let nodes = get().nodes.map((n) => {
        if (n.id !== id) return n;
        const data = { ...n.data, ...patch };
        // Type choisi par l'auteur : on oublie le type inconnu gardé d'une version plus récente.
        if (patch.type && data.keep?.type) {
          const { type: _type, ...rest } = data.keep;
          data.keep = Object.keys(rest).length > 0 ? rest : undefined;
        }
        return { ...n, data };
      });
      // Les mentions de cette carte, dans les autres, suivent son nouveau titre.
      const { title } = patch;
      if (typeof title === "string") nodes = nodes.map((n) => withHtml(n, renameMentions(n.data.html, id, title)));
      let { screenplay } = get();
      // Une Scène qui change de type garde son texte : synopsis et texte de la scène passent dans ses notes.
      // Roman : le texte quitte le manuscrit (il y revient si la carte redevient Scène). Scénario : le texte
      // reste aussi dans le fichier Fountain (releaseCard), la carte en garde une copie.
      if (leavesScene && before) {
        let synopsis = before.fiche?.synopsis;
        let text: string | undefined = get().manuscript[id];
        if (screenplay && get().kind === "scenario") {
          const at = headingOf(screenplay.elements, id);
          synopsis = at < 0 ? undefined : sceneSynopsis(screenplay.elements, at);
          text = at < 0 ? undefined : sceneBodyHtml(sceneBody(screenplay.elements, at));
        } else if (text) {
          const manuscript = { ...get().manuscript };
          delete manuscript[id];
          set({ manuscript });
        }
        const html = sceneToNotes(before.html, synopsis, text);
        if (html) nodes = nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, html } } : n));
      }
      // Roman : une carte qui devient Scène (ou une Scène qui reçoit des notes) range ses notes : un long texte
      // devient le texte de la scène (manuscrit), une ligne courte son synopsis.
      if (get().kind !== "scenario") nodes = nodes.map((n) => {
        if (n.id !== id) return n;
        if (n.data.type === "scene" && notesAreSceneText(n.data.html)) {
          const text = withoutLeadingSynopsis(n.data.html!, n.data.fiche?.synopsis);
          const current = get().manuscript[id] ?? "";
          // Déjà là (aller-retour annulé : le manuscrit n'est pas dans l'historique) : rien n'est doublé.
          if (!current.includes(text)) set({ manuscript: { ...get().manuscript, [id]: appendHtml(current, text) } });
          return { ...n, data: { ...n.data, html: "" } };
        }
        const data = foldNovelNotes(n.data);
        return data === n.data ? n : { ...n, data };
      });
      const card = nodes.find((n) => n.id === id)?.data;
      if (screenplay && card) {
        const linked = headingTitles(screenplay).has(id);
        // Une carte qui n'est plus une Scène quitte le scénario (son texte, s'il y en a, y reste).
        if (card.type !== "scene") screenplay = releaseCard(screenplay, id);
        // Scénario : une carte Scène qui reçoit un titre y entre aussitôt, à la suite des autres.
        else if (!linked && get().kind === "scenario") screenplay = appendScene(screenplay, { id, title: card.title });
        // Sinon son en-tête suit son titre.
        else if (typeof patch.title === "string") screenplay = renameHeading(screenplay, id, patch.title);
        // Scénario : un long texte dans les notes d'une Scène reliée devient le corps de sa scène (s'il est vide).
        if (get().kind === "scenario" && card.type === "scene" && notesAreSceneText(card.html)) {
          const at = headingOf(screenplay.elements, id);
          if (at >= 0 && sceneBody(screenplay.elements, at).length === 0) {
            const synopsis = sceneSynopsis(screenplay.elements, at);
            const body = textElements(withoutLeadingSynopsis(card.html!, synopsis));
            screenplay = { ...screenplay, elements: setSceneBody(screenplay.elements, at, body) };
            nodes = nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, html: "" } } : n));
          }
        }
        // Scénario : une Scène reliée à son en-tête range ses notes dans le synopsis de la scène.
        if (get().kind === "scenario" && card.type === "scene") {
          const folded = foldScreenplayNotes(nodes.filter((n) => n.id === id), screenplay);
          if (folded.screenplay !== screenplay || folded.nodes[0] !== nodes.find((n) => n.id === id)) {
            screenplay = folded.screenplay!;
            nodes = nodes.map((n) => (n.id === id ? folded.nodes[0] : n));
          }
        }
      }
      set({ nodes, screenplay });
      touch();
    },
    resizeCard: (id, delta) => {
      record(`card:${id}:width`);
      set({
        nodes: get().nodes.map((n) => {
          if (n.id !== id) return n;
          const width = typeof n.style?.width === "number" ? n.style.width : CARD_WIDTH;
          return { ...n, style: { ...n.style, width: clampCardWidth(width + delta) } };
        }),
      });
      touch();
    },
    setCardImage: async (id, file) => {
      const ext = imageExtension(file.name);
      if (!ext || !get().nodes.some((n) => n.id === id)) return false;
      // Un nom neuf dans medias/ : deux images du même nom ne s'écrasent pas, et annuler reste possible.
      const name = `${newId()}.${ext}`;
      try {
        await storage.writeMedia(name, file.data);
      } catch (err) {
        console.error(err);
        return false;
      }
      get().updateCard(id, { image: name });
      return true;
    },
    addImageCard: async (pos, file) => {
      if (!imageExtension(file.name)) return null;
      // La place de l'image est réservée d'avance, pour ne pas recouvrir une voisine une fois l'image affichée.
      const id = get().addCard(pos, "idee", CARD_SIZE.height + IMAGE_ROOM);
      set({ pendingFocusId: null });
      if (await get().setCardImage(id, file)) return id;
      // La copie a échoué : pas de carte vide laissée derrière.
      get().undo();
      return null;
    },
    pickCardImage: async (id) => {
      const file = await storage.pickImage(getT().card.imageFiles).catch((err) => {
        console.error(err);
        return null;
      });
      if (file) await get().setCardImage(id, file);
    },
    addGalleryImages: async (id, given) => {
      const files = (given ?? (await storage.pickImages(getT().card.imageFiles).catch(() => []))).filter((f) => imageExtension(f.name));
      const names: string[] = [];
      for (const file of files) {
        const name = `${newId()}.${imageExtension(file.name)}`;
        try {
          await storage.writeMedia(name, file.data);
          names.push(name);
        } catch (err) {
          console.error(err);
        }
      }
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card || names.length === 0) return 0;
      // Pas encore d'image principale : la première photo la devient.
      const [first, ...rest] = card.image ? [undefined, ...names] : names;
      get().updateCard(id, { ...(first ? { image: first } : {}), images: [...(card.images ?? []), ...rest] });
      return names.length;
    },
    removeGalleryImage: (id, name) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card?.images?.includes(name)) return;
      const images = card.images.filter((n) => n !== name);
      get().updateCard(id, { images: images.length > 0 ? images : undefined });
    },
    useAsMainImage: (id, name) => {
      const card = get().nodes.find((n) => n.id === id)?.data;
      if (!card?.images?.includes(name)) return;
      const images = card.images.map((n) => (n === name ? card.image : n)).filter((n): n is string => !!n);
      get().updateCard(id, { image: name, images: images.length > 0 ? images : undefined });
    },
    deleteCard: (id) => get().deleteCards([id]),
    deleteCards: (ids) => {
      const known = ids.filter((id) => get().nodes.some((n) => n.id === id));
      if (known.length === 0) return;
      record();
      // À la corbeille, pas effacées : les cartes, leurs fils et leurs scènes du scénario peuvent revenir.
      set(toTrash(known, get()));
      touch();
    },
    // La sélection est un état d'affichage : ni historique, ni projet « modifié ».
    selectAll: () => {
      // Les cartes masquées par un filtre ne sont pas choisies : Suppr ne doit toucher que ce qu'on voit.
      const hidden = hiddenCards(get().nodes.map((n) => n.data), get().edges, get().filter);
      set({
        nodes: get().nodes.map((n) => (hidden.has(n.id) ? (n.selected ? { ...n, selected: false } : n) : n.selected ? n : { ...n, selected: true })),
        frames: get().frames.map((f) => (f.selected ? f : { ...f, selected: true })),
      });
    },
    clearSelection: () =>
      set({
        nodes: get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        frames: get().frames.map((f) => (f.selected ? { ...f, selected: false } : f)),
      }),
    removeLink: (id) => {
      if (!get().edges.some((e) => e.id === id)) return;
      record();
      set({ edges: get().edges.filter((e) => e.id !== id) });
      touch();
    },
    renameLink: (id, label) => {
      record(`link:${id}`);
      set({ edges: get().edges.map((e) => (e.id === id ? { ...e, label } : e)) });
      touch();
    },
    setWireFiche: (id, field, value) => {
      const edge = get().edges.find((e) => e.id === id);
      if (!edge || (wireFicheOf(edge)?.[field] ?? "") === value) return;
      record(`link:${id}:fiche:${field}`);
      const fiche = setWireField(wireFicheOf(edge), field, value);
      set({ edges: get().edges.map((e) => (e.id === id ? { ...e, data: { ...(e.data ?? {}), fiche } } : e)) });
      touch();
    },

    setView: (view, focusId = null) => set({ view, focusId }),

    load: async () => {
      let files: FileMap | null = null;
      let failed = false;
      try {
        files = await storage.readAll();
      } catch (err) {
        // Dossier mémorisé illisible (accès refusé, disque absent) : l'app s'ouvre quand même,
        // et l'auteur choisit à nouveau son dossier. Sans cela, elle resterait sur « Ouverture… ».
        console.error(err);
        storage.forget();
        failed = true;
      }
      // Après un échec, on reste à l'accueil : l'auteur choisit à nouveau son dossier.
      if (failed) {
        set({ loaded: true, openFailed: true, screen: "home" });
        return;
      }
      const { state, dirty } = openProject((files && deserialize(files)) || demoProject());
      set({
        ...state,
        lastFiles: files ?? {},
        conflicts: [],
        saveError: null,
        spotlightId: null,
        charFilter: null,
        wiresShown: [],
        filter: NO_FILTER,
        expandedId: null,
        cardMenu: null,
        loaded: true,
        screen: "project",
        view: "toile",
        focusId: null,
        openFailed: false,
        homeNotice: false,
        status: files !== null && !dirty ? "enregistre" : "modifie",
      });
      if (files) storage.remember({ title: state.title, kind: state.kind });
    },

    openFolder: async () => {
      if (!(await storage.pickFolder())) return;
      try {
        const files = await storage.readAll();
        // Un dossier sans projet ne s'ouvre pas : pour en démarrer un, c'est « Nouveau projet ».
        if (!files || !openFiles(files)) set({ homeNotice: true, openFailed: false });
      } catch (err) {
        console.error(err);
        storage.forget();
        set({ openFailed: true });
      }
    },

    save: async () => {
      // Projet ouvert sur un autre appareil : on ne touche à rien sur le disque.
      if (get().lockedBy) return;
      if (storage.canPickFolder && !storage.location()) {
        if (!(await storage.pickFolder())) return;
        // Le dossier choisi contient déjà un projet : on l'ouvre, on ne l'écrase jamais
        // avec ce qui est à l'écran (le projet d'exemple, le plus souvent).
        const existing = await storage.readAll().catch(() => null);
        if (existing && openFiles(existing)) return;
      }
      const { screenplay } = get();
      const files = currentFiles();
      const prev = get().lastFiles;
      // Fichiers en conflit : la version du disque n'est pas touchée tant que l'auteur n'a pas choisi.
      const held = new Set(get().conflicts.map((c) => c.path));
      const changed: FileMap = {};
      for (const [path, content] of Object.entries(files)) if (prev[path] !== content && !held.has(path)) changed[path] = content;
      let removed = Object.keys(prev).filter((path) => !(path in files) && !held.has(path));
      set({ status: "enregistrement" });
      try {
        // Garde-fou : juste avant d'écrire, on relit ce qu'on va remplacer ou supprimer. Un fichier changé
        // hors de l'app depuis notre dernière lecture n'est jamais écrasé.
        let conflicts = get().conflicts;
        if (storage.readFiles) {
          const targets = [...Object.keys(changed), ...removed];
          const disk = targets.length > 0 ? await storage.readFiles(targets) : {};
          const diff = diffDisk(targets, prev, files, disk);
          const skip = new Set([...Object.keys(diff.settled), ...diff.conflicts]);
          for (const path of skip) delete changed[path];
          removed = removed.filter((path) => !skip.has(path));
          const added: FileConflict[] = diff.conflicts.map((path) => ({ path, copy: path in files ? conflictCopyPath(path) : null, mine: files[path] ?? null }));
          // La version de l'app, à côté de celle du disque ; tenue à jour si l'auteur continue d'écrire.
          conflicts = [...conflicts, ...added].map((c) => {
            const mine = files[c.path] ?? null;
            if (!c.copy || mine === null || (mine === c.mine && !added.includes(c))) return c;
            changed[c.copy] = mine;
            return { ...c, mine };
          });
        }
        await storage.write(changed, removed);
        // Ce que le disque contient maintenant. Un fichier en conflit garde sa dernière version connue.
        let known = files;
        for (const c of conflicts) known = patchFiles(known, { [c.path]: prev[c.path] ?? null });
        // Si l'auteur a modifié quelque chose pendant l'écriture, on reste "modifié".
        set({
          lastFiles: known,
          savedScreenplay: screenplay,
          conflicts,
          saveError: null,
          status: get().status === "enregistrement" ? "enregistre" : get().status,
        });
        storage.remember({ title: get().title, kind: get().kind });
        // Copies Markdown (markdown/) : après l'enregistrement, sans jamais le retarder ni le faire échouer.
        if (storage.copies) {
          const snapshot = get();
          const { lang, author, bibleSections } = useSettings.getState();
          void import("./markdownCopies").then((m) =>
            m.syncCopies(() => m.buildCopies(snapshot, { t: getT(), lang, author }, bibleOrder(bibleSections)), snapshot.markdownCopies),
          );
        }
      } catch (err) {
        console.error(err);
        set({ status: "erreur", saveError: classifySaveError(err) });
      }
      if (syncAgain) {
        syncAgain = false;
        void get().syncFromDisk();
      }
    },

    saveError: null,
    relocateProject: async () => {
      const known = get().lastFiles;
      if (!(await storage.pickFolder())) return;
      // Le dossier déplacé, retrouvé : on enregistre par-dessus comme avant (les fichiers changés ailleurs restent
      // protégés). Un dossier vide reçoit tout le projet.
      const existing = await storage.readAll().catch(() => null);
      set({ lastFiles: existing ? known : {}, status: "modifie" });
      await get().save();
    },
    projectZip: async () => {
      const { zip } = await import("./export/zip");
      const entries: { path: string; data: string | Uint8Array }[] = Object.entries(currentFiles()).map(([path, data]) => ({ path, data }));
      // Images, galeries et PDF des cartes : les fichiers de medias/ voyagent avec le projet.
      const names = new Set<string>();
      for (const node of get().nodes) {
        const d = node.data as { image?: string; fichier?: string; images?: string[] };
        for (const name of [d.image, d.fichier, ...(d.images ?? [])]) if (name) names.add(name);
      }
      for (const name of names) {
        const bytes = await storage.readMedia(name).catch(() => null);
        if (bytes) entries.push({ path: `${MEDIA_DIR}/${name}`, data: bytes });
      }
      return { name: `${fileName(get().title, "mondowrite")}.zip`, extension: "zip", mime: "application/zip", data: zip(entries) };
    },
    exportProjectCopy: async () => {
      try {
        const file = await get().projectZip();
        return file ? await storage.saveAs(file, "ZIP") : false;
      } catch (err) {
        console.error(err);
        return false;
      }
    },

    conflicts: [],
    resolveConflict: async (path, keep) => {
      const conflict = get().conflicts.find((c) => c.path === path);
      if (!conflict) return;
      try {
        if (keep === "mine") {
          const mine = currentFiles()[path] ?? null;
          await storage.write(mine === null ? {} : { [path]: mine }, [...(mine === null ? [path] : []), ...(conflict.copy ? [conflict.copy] : [])]);
          set({ lastFiles: patchFiles(get().lastFiles, { [path]: mine }) });
        } else {
          const disk = storage.readFiles ? await storage.readFiles([path]) : {};
          adoptDisk({ [path]: disk[path] ?? null });
          if (conflict.copy) await storage.write({}, [conflict.copy]);
        }
        set({ conflicts: get().conflicts.filter((c) => c.path !== path) });
      } catch (err) {
        console.error(err);
        set({ status: "erreur" });
      }
    },

    syncFromDisk: async () => {
      if (get().screen !== "project") return;
      if (syncing || get().status === "enregistrement") {
        syncAgain = true;
        return;
      }
      syncing = true;
      try {
        const disk = await storage.readAll();
        // Dossier disparu (disque débranché) : rien à reprendre ; l'enregistrement suivant le signalera.
        if (!disk) return;
        const known = get().lastFiles;
        const held = new Set(get().conflicts.map((c) => c.path));
        // Les copies de conflit ne font pas partie du projet : elles attendent le choix de l'auteur.
        const paths = [...new Set([...Object.keys(known), ...Object.keys(disk)])].filter((p) => !held.has(p) && !isConflictCopy(p));
        const diff = diffDisk(paths, known, currentFiles(), disk);
        if (Object.keys(diff.settled).length > 0) set({ lastFiles: patchFiles(get().lastFiles, diff.settled) });
        adoptDisk(diff.adopt);
        // Changé des deux côtés : l'enregistrement met la version de l'app à côté et prévient l'auteur.
        if (diff.conflicts.length > 0) {
          set({ status: "modifie" });
          syncing = false;
          await get().save();
        }
      } catch (err) {
        console.error(err);
      } finally {
        syncing = false;
      }
    },
  };
});
