// Assistant externe par MCP, écriture (#62, lot 3, docs/plan-mcp.md) : les demandes du serveur `--mcp` sont
// appliquées ici, dans l'app ouverte, par les actions du store. Tout ce que l'assistant écrit est marqué « IA »
// (champs `ia` d'une carte, `<span data-ia>` d'un texte, note [[ia]] du Fountain), noté dans `ia-journal.md`, et fait
// une seule étape d'annulation. Avant de remplacer le texte d'une scène, une version en est gardée.
// La première partie (résolution, marques, Fountain) est pure et testée ; `applyMcpRequest` agit sur le store.

import type { Messages } from "./i18n";
import { CARD_TYPES, type CardData, type CardType, type ProjectKind } from "./types";
import { vocab } from "./vocab";
import { ARC_TYPES, CARD_REF_FIELDS, CHOICE_FIELDS, SCENE_STATUSES, isCardRefField, sheetFields } from "./character";
import { IA_TYPES, withIaField } from "./atelier";
import { markdownToHtml } from "./storage/markdown";
import { newId } from "./projectState";
import { parse } from "./screenplay/parse";
import type { Screenplay, ScreenplayElement } from "./screenplay/model";
import { headingOf, sceneBody, setSceneBody } from "./screenplay/sceneText";
import { synopsisEnd } from "./screenplay/scenes";
import { blocks, moveBlock } from "./screenplay/sequence";
import { foldName } from "./names";
import { countWords } from "./manuscript";

/** Une demande du serveur (fichier `req-<id>.json` de la file). */
export interface McpRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  /** Nom du client MCP (Claude Desktop…), pour le journal. */
  client?: string;
}

export interface McpAnswer {
  ok: boolean;
  text: string;
}

const fold = (s: string) => foldName(s).replace(/[’‘]/g, "'").replace(/\s+/g, " ");
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim();

// ---------- Résolution (pur) ----------

/** Une carte par son identifiant, son titre exact (sans casse ni accents), puis un titre qui le contient. */
export function findCard<T extends Pick<CardData, "id" | "title">>(cards: readonly T[], wanted: string): T | null {
  const w = wanted.trim();
  if (!w) return null;
  const f = fold(w);
  return cards.find((c) => c.id === w) ?? cards.find((c) => fold(c.title) === f) ?? (f.length >= 3 ? cards.find((c) => fold(c.title).includes(f)) : undefined) ?? null;
}

/** Noms anglais courants des types, pour une IA qui ne connaît pas les clés de MondoWrite. */
const ENGLISH_TYPES: Record<string, CardType> = {
  idea: "idee", character: "personnage", place: "lieu", location: "lieu", setting: "lieu", scene: "scene", plot: "intrigue", subplot: "intrigue",
  storyline: "intrigue", group: "groupe", faction: "groupe", object: "objet", item: "objet", prop: "objet", event: "evenement", rule: "regle",
  secret: "secret", theme: "theme", question: "question", link: "lien", episode: "episode",
};

/** Types qu'on ne crée pas par l'assistant : ils demandent un fichier (image, PDF). */
const NO_CREATE: ReadonlySet<CardType> = new Set(["image", "document"]);

/** Type d'une carte d'après sa clé, son libellé (dans la langue de l'interface) ou son nom anglais. */
export function cardTypeOf(wanted: string, t: Messages, kind: ProjectKind): CardType | null {
  const f = fold(wanted);
  if (!f) return null;
  const types = vocab(t, kind).types;
  const byKey = CARD_TYPES.find((type) => type === f);
  if (byKey) return byKey;
  const byLabel = CARD_TYPES.find((type) => fold(types[type].label) === f || fold(types[type].section) === f);
  return byLabel ?? ENGLISH_TYPES[f.replace(/s$/, "")] ?? ENGLISH_TYPES[f] ?? null;
}

/** Valeurs permises d'un champ à choix, avec leurs libellés : la valeur écrite est toujours la clé. */
function choicesOf(key: string, t: Messages): Record<string, string> | null {
  if (key in CHOICE_FIELDS) {
    const labels = (t.fiche.values as Record<string, Record<string, string>>)[key] ?? {};
    return Object.fromEntries((CHOICE_FIELDS as Record<string, readonly string[]>)[key].map((v) => [v, labels[v] ?? v]));
  }
  if (key === "statut") return Object.fromEntries(SCENE_STATUSES.map((v) => [v, t.sceneStatus.values[v]]));
  if (key === "arcType") return Object.fromEntries(ARC_TYPES.map((v) => [v, t.character.arcTypes[v]]));
  if (key === "principal") return { oui: "oui" };
  return null;
}

export interface FieldsResult {
  /** Clés de la fiche → valeurs telles qu'elles s'écrivent dans le fichier. */
  fiche: Record<string, string>;
  /** Ce qui n'a pas pu entrer dans la fiche (champ inconnu, valeur hors liste), à dire à l'IA. */
  refused: string[];
}

/**
 * Champs donnés par l'IA (par clé ou par libellé) → champs de la fiche d'une carte de ce type. Un champ à choix
 * n'accepte qu'une de ses valeurs (clé ou libellé) ; un champ-référence (point de vue…) prend le titre d'une carte
 * du bon type et garde son identifiant.
 */
export function resolveFields(type: CardType, fields: unknown, t: Messages, cards: readonly CardData[]): FieldsResult {
  const out: FieldsResult = { fiche: {}, refused: [] };
  if (!fields || typeof fields !== "object") return out;
  const keys = sheetFields(type) as readonly string[];
  const labels: Record<string, string> = { ...t.character.fields, ...t.fiche.fields, ...((t.fiche.typeLabels as Record<string, Record<string, string>>)[type] ?? {}) };
  for (const [name, raw] of Object.entries(fields as Record<string, unknown>)) {
    const value = str(raw);
    const f = fold(name);
    const key = keys.find((k) => fold(k) === f) ?? keys.find((k) => labels[k] && fold(labels[k]) === f);
    if (!key) {
      out.refused.push(name);
      continue;
    }
    if (!value) {
      out.fiche[key] = "";
      continue;
    }
    const choices = choicesOf(key, t);
    if (choices) {
      const fv = fold(value);
      const pick = Object.entries(choices).find(([k, label]) => fold(k) === fv || fold(label) === fv)?.[0];
      if (pick) out.fiche[key] = pick;
      else out.refused.push(`${name} (${Object.values(choices).join(", ")})`);
      continue;
    }
    if (isCardRefField(key)) {
      const target = findCard(cards.filter((c) => c.type === CARD_REF_FIELDS[key]), value);
      if (target) out.fiche[key] = target.id;
      else out.refused.push(`${name} : ${value}`);
      continue;
    }
    out.fiche[key] = value;
  }
  return out;
}

/** Markdown de l'IA → HTML d'un éditeur, chaque paragraphe marqué « IA » (une seule marque pour tout le passage). */
export function iaHtml(md: string, markId: string = newId()): string {
  // Sans les retours entre blocs que laisse le Markdown (ceux de l'éditeur n'en ont pas).
  const html = markdownToHtml(md.replace(/\r\n/g, "\n")).replace(/(<\/(?:p|h[1-3]|ul|ol|li|blockquote)>)\s+/g, "$1").trim();
  if (!html) return "";
  // Le contenu de chaque bloc de texte passe dans <span data-ia> : titres, paragraphes, éléments de liste.
  return html.replace(/<(p|h[1-3]|li)>([\s\S]*?)<\/\1>/g, (all, tag: string, inner: string) => (inner.trim() && !inner.startsWith("<p>") ? `<${tag}><span data-ia="${markId}">${inner}</span></${tag}>` : all));
}

/** Texte Fountain d'une scène (sans en-tête) → éléments marqués « IA ». Un en-tête de scène est refusé : null. */
export function iaFountain(text: string): ScreenplayElement[] | null {
  // Une ligne vide en tête : jamais lu comme une page de titre.
  const elements = parse(`\n${text.replace(/\r\n/g, "\n")}`).elements.filter((el) => el.type !== "pageBreak" || el.text);
  if (elements.some((el) => el.type === "sceneHeading" || el.type === "section")) return null;
  return elements.map((el) => (IA_TYPES.has(el.type) && el.text.trim() ? { ...el, ia: true } : el));
}

/** Synopsis Fountain d'une scène remplacé par une ligne marquée « IA ». Même scénario si la scène n'existe pas. */
export function withIaSynopsis(sp: Screenplay, cardId: string, synopsis: string): Screenplay {
  const at = headingOf(sp.elements, cardId);
  if (at < 0) return sp;
  const end = synopsisEnd(sp.elements, at);
  const line: ScreenplayElement[] = synopsis.trim() ? [{ type: "synopsis", text: synopsis.trim().replace(/\s+/g, " "), ia: true }] : [];
  return { ...sp, elements: [...sp.elements.slice(0, at + 1), ...line, ...sp.elements.slice(end)] };
}

/** Corps d'une scène Fountain : ajout à la fin ou remplacement par les éléments de l'IA. */
export function withSceneText(sp: Screenplay, cardId: string, added: ScreenplayElement[], replace: boolean): Screenplay {
  const at = headingOf(sp.elements, cardId);
  if (at < 0) return sp;
  const body = replace ? added : [...sceneBody(sp.elements, at), ...added];
  return { ...sp, elements: setSceneBody(sp.elements, at, body) };
}

// ---------- Application dans le store ----------

/** Ce que l'application lit et appelle : le store (passé par l'appelant, pour garder ce module testable). */
/**
 * Scénario : déplace la scène reliée à `id` juste avant ou après celle reliée à `target`, avec son texte (blocs du
 * séquencier, `moveBlock`). Rend le même scénario si l'une des deux n'y est pas ou si rien ne bouge.
 */
export function moveScreenplayScene(sp: Screenplay, id: string, target: string, side: "before" | "after"): Screenplay {
  const list = blocks(sp.elements);
  const from = list.findIndex((b) => b.kind === "scene" && b.cardId === id);
  const at = list.findIndex((b) => b.kind === "scene" && b.cardId === target);
  if (from < 0 || at < 0 || from === at) return sp;
  // Place visée une fois le bloc retiré de la liste.
  const base = at > from ? at - 1 : at;
  const to = side === "before" ? base : base + 1;
  const elements = moveBlock(sp.elements, from, to);
  return elements === sp.elements ? sp : { ...sp, elements };
}

export interface McpStore {
  kind: ProjectKind;
  cards: () => CardData[];
  screenplay: () => Screenplay | null;
  manuscript: () => Record<string, string>;
  /** Scènes dans l'ordre du récit, numérotées comme les voit l'IA (instantané). */
  scenes: () => { n: number; id: string; title: string }[];
  /** Une seule étape d'annulation pour tout ce que fait `fn`. */
  batch: <T>(fn: () => T) => T;
  addTitledCard: (type: CardType, title: string) => string;
  updateCard: (id: string, patch: Partial<Omit<CardData, "id">>) => void;
  linkCards: (source: string, target: string, label: string) => void;
  addQuestionAbout: (title: string, cardIds: string[]) => string;
  setManuscriptText: (id: string, html: string) => void;
  setScreenplay: (sp: Screenplay, undoable?: boolean) => void;
  keepVersion: (cardId: string, title?: string) => Promise<string | null>;
  log: (target: string, words: number, client: string) => void;
  /** Roman : une scène avant ou après une autre (case et chapitre de la voisine). Faux si rien ne bouge. */
  moveBookScene: (id: string, target: string, side: "before" | "after") => boolean;
  /** Roman : chapitres dans l'ordre du récit, numérotés. */
  chapters: () => { n: number; id: string; title: string }[];
  startChapterAt: (sceneId: string) => string | null;
  renameChapter: (id: string, title: string) => void;
  deleteChapter: (id: string) => void;
  moveChapter: (id: string, before: string | null) => void;
}

const plainWords = (html: string) => countWords(html);

/** Une scène désignée par son numéro dans le récit, son identifiant ou son titre. */
function findScene(store: McpStore, wanted: string): { n: number; id: string; title: string } | null {
  const scenes = store.scenes();
  const n = /^\d+$/.test(wanted.trim()) ? Number(wanted.trim()) : NaN;
  return scenes.find((s) => s.n === n) ?? findCard(scenes, wanted);
}

const fail = (text: string): McpAnswer => ({ ok: false, text });

/** Un chapitre désigné par son numéro, son identifiant ou son titre. */
function findChapter(store: McpStore, wanted: string): { n: number; id: string; title: string } | null {
  const list = store.chapters();
  const w = wanted.trim().replace(/^(chapitre|chapter|ch\.?)\s*/i, "");
  const n = /^\d+$/.test(w) ? Number(w) : NaN;
  return list.find((c) => c.n === n) ?? list.find((c) => c.id === w) ?? findCard(list.filter((c) => c.title), wanted);
}

const chapterName = (c: { n: number; title: string }) => (c.title ? `chapitre ${c.n} « ${c.title} »` : `chapitre ${c.n}`);
const NO_CHAPTERS = "Un scénario n'a pas de chapitres : ses parties sont les saisons, épisodes et sections du séquencier. / Screenplays have no chapters.";

/** Applique une demande d'écriture. Rend le message que l'IA reçoit. */
export async function applyMcpRequest(req: McpRequest, store: McpStore, t: Messages): Promise<McpAnswer> {
  const a = req.args ?? {};
  const client = req.client || "MCP";
  const cards = store.cards();
  const typeLabel = (type: CardType) => vocab(t, store.kind).types[type].label;

  switch (req.tool) {
    case "create_card": {
      const type = cardTypeOf(str(a.type), t, store.kind);
      const title = str(a.title);
      if (!type || NO_CREATE.has(type)) return fail(`Type inconnu ou impossible à créer ici : « ${str(a.type)} ». / Unknown type.`);
      if (type === "scene") return fail("Pour une scène, utilise create_scene. / Use create_scene for scenes.");
      if (!title) return fail("Il faut un titre. / A title is needed.");
      const fields = resolveFields(type, a.fields, t, cards);
      const notes = str(a.notes);
      const id = store.batch(() => {
        const id = store.addTitledCard(type, title);
        const fiche = Object.fromEntries(Object.entries(fields.fiche).filter(([, v]) => v));
        let ia: string[] = withIaField(undefined, "title");
        for (const key of Object.keys(fiche)) ia = withIaField(ia, key);
        store.updateCard(id, { ...(notes ? { html: iaHtml(notes) } : {}), ...(Object.keys(fiche).length > 0 ? { fiche } : {}), ia });
        return id;
      });
      store.log(title, countWords(`<p>${title} ${notes} ${Object.values(fields.fiche).join(" ")}</p>`), client);
      const refused = fields.refused.length > 0 ? ` Champs non repris : ${fields.refused.join(" ; ")}.` : "";
      return { ok: true, text: `Carte créée : « ${title} » (${typeLabel(type)}), id \`${id}\`.${refused}` };
    }

    case "update_card": {
      const card = findCard(cards, str(a.card));
      if (!card) return fail(`Carte introuvable : « ${str(a.card)} ». / Card not found.`);
      const fields = resolveFields(card.type, a.fields, t, cards);
      const notes = str(a.notes);
      const replace = str(a.notes_mode) === "replace";
      const title = str(a.title);
      store.batch(() => {
        let ia = card.ia;
        const fiche = { ...(card.fiche ?? {}) };
        for (const [key, value] of Object.entries(fields.fiche)) {
          if (value) {
            fiche[key] = value;
            ia = withIaField(ia, key);
          } else delete fiche[key];
        }
        if (title) ia = withIaField(ia, "title");
        const html = notes ? (replace ? iaHtml(notes) : `${card.html ?? ""}${iaHtml(notes)}`) : undefined;
        store.updateCard(card.id, {
          ...(title ? { title } : {}),
          ...(Object.keys(fields.fiche).length > 0 ? { fiche: Object.keys(fiche).length > 0 ? fiche : undefined } : {}),
          ...(html !== undefined ? { html } : {}),
          ia,
        });
      });
      store.log(title || card.title, countWords(`<p>${title} ${notes} ${Object.values(fields.fiche).join(" ")}</p>`), client);
      const refused = fields.refused.length > 0 ? ` Champs non repris : ${fields.refused.join(" ; ")}.` : "";
      return { ok: true, text: `Carte modifiée : « ${title || card.title} ».${refused}` };
    }

    case "link_cards": {
      const from = findCard(cards, str(a.from));
      const to = findCard(cards, str(a.to));
      if (!from || !to) return fail(`Carte introuvable : « ${!from ? str(a.from) : str(a.to)} ».`);
      if (from.id === to.id) return fail("Une carte ne se relie pas à elle-même.");
      store.batch(() => store.linkCards(from.id, to.id, str(a.label).slice(0, 80)));
      store.log(`${from.title} → ${to.title}`, 0, client);
      return { ok: true, text: `Fil tiré : « ${from.title} » → « ${to.title} »${str(a.label) ? ` (${str(a.label)})` : ""}. (Rien n'est fait si elles étaient déjà reliées.)` };
    }

    case "add_question": {
      const question = str(a.question);
      if (!question) return fail("Il faut une question.");
      const about = (Array.isArray(a.about) ? a.about : []).map((x) => findCard(cards, str(x))).filter((c): c is CardData => c !== null);
      const id = store.batch(() => {
        const id = store.addQuestionAbout(question, about.map((c) => c.id));
        store.updateCard(id, { ia: ["title"] });
        return id;
      });
      store.log(question, countWords(`<p>${question}</p>`), client);
      return { ok: true, text: `Question posée à l'auteur (carte \`${id}\`)${about.length > 0 ? `, reliée à ${about.map((c) => `« ${c.title} »`).join(", ")}` : ""}.` };
    }

    case "create_scene": {
      const title = str(a.title);
      if (!title) return fail("Il faut un titre (scénario : un en-tête « INT. LIEU - JOUR »).");
      const synopsis = str(a.synopsis);
      const text = str(a.text);
      const body = store.kind === "scenario" && text ? iaFountain(text) : [];
      if (body === null) return fail("Le texte ne doit pas contenir d'en-tête de scène ni de section : une scène à la fois.");
      const id = store.batch(() => {
        const id = store.addTitledCard("scene", "");
        // Le titre après coup : dans un scénario, c'est lui qui fait entrer l'en-tête dans le Fountain (fin du récit).
        store.updateCard(id, { title, ia: ["title"] });
        if (store.kind === "scenario") {
          let sp = store.screenplay();
          if (sp && synopsis) sp = withIaSynopsis(sp, id, synopsis);
          if (sp && body.length > 0) sp = withSceneText(sp, id, body, true);
          if (sp && sp !== store.screenplay()) store.setScreenplay(sp, true);
        } else if (synopsis) {
          store.updateCard(id, { fiche: { synopsis }, ia: ["title", "synopsis"] });
        }
        return id;
      });
      if (store.kind !== "scenario" && text) store.setManuscriptText(id, iaHtml(text));
      store.log(title, countWords(`<p>${synopsis} ${text}</p>`), client);
      const n = store.scenes().find((s) => s.id === id)?.n;
      return { ok: true, text: `Scène créée : « ${title} »${n ? `, scène ${n}` : ""} (id \`${id}\`).` };
    }

    case "set_scene_synopsis": {
      const scene = findScene(store, str(a.scene));
      const synopsis = str(a.synopsis);
      if (!scene) return fail(`Scène introuvable : « ${str(a.scene)} ».`);
      if (scene.id.startsWith("@")) return fail("Cette scène n'a pas de carte : impossible de l'écrire d'ici.");
      store.batch(() => {
        if (store.kind === "scenario") {
          const sp = store.screenplay();
          if (sp) store.setScreenplay(withIaSynopsis(sp, scene.id, synopsis), true);
        } else {
          const card = store.cards().find((c) => c.id === scene.id);
          if (!card) return;
          const fiche = { ...(card.fiche ?? {}), synopsis };
          store.updateCard(card.id, { fiche, ia: withIaField(card.ia, "synopsis") });
        }
      });
      store.log(scene.title, countWords(`<p>${synopsis}</p>`), client);
      return { ok: true, text: `Synopsis de la scène ${scene.n} écrit.` };
    }

    case "write_scene": {
      const scene = findScene(store, str(a.scene));
      const text = typeof a.text === "string" ? a.text : "";
      const replace = str(a.mode) === "replace";
      if (!scene) return fail(`Scène introuvable : « ${str(a.scene)} ».`);
      if (scene.id.startsWith("@")) return fail("Cette scène n'a pas de carte : impossible de l'écrire d'ici.");
      if (!text.trim() && !replace) return fail("Il faut du texte.");
      // Le filet : la scène telle qu'elle était, avant que l'IA la remplace (le manuscrit d'un roman n'est pas dans
      // l'historique d'annulation).
      let kept = false;
      if (replace) kept = (await store.keepVersion(scene.id, t.mcp.versionTitle)) !== null;
      if (store.kind === "scenario") {
        const added = iaFountain(text);
        if (added === null) return fail("Le texte ne doit pas contenir d'en-tête de scène ni de section : utilise create_scene pour une nouvelle scène.");
        const sp = store.screenplay();
        if (!sp) return fail("Ce scénario n'a pas encore de texte.");
        store.batch(() => store.setScreenplay(withSceneText(sp, scene.id, added, replace), true));
      } else {
        const before = store.manuscript()[scene.id] ?? "";
        store.setManuscriptText(scene.id, replace ? iaHtml(text) : `${before}${iaHtml(text)}`);
      }
      const words = store.kind === "scenario" ? (text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) : plainWords(iaHtml(text));
      store.log(scene.title, words, client);
      return { ok: true, text: `Scène ${scene.n} « ${scene.title} » ${replace ? "réécrite" : "complétée"} (${words} mots, marqués IA).${kept ? " Version d'avant gardée (Versions de la scène)." : ""}` };
    }

    case "move_scene": {
      const scene = findScene(store, str(a.scene));
      const side = str(a.before) ? "before" : str(a.after) ? "after" : null;
      if (!scene) return fail(`Scène introuvable : « ${str(a.scene)} ».`);
      if (!side) return fail("Indique `before` ou `after` : la scène à côté de laquelle la poser.");
      const target = findScene(store, str(side === "before" ? a.before : a.after));
      if (!target) return fail(`Scène de repère introuvable : « ${str(side === "before" ? a.before : a.after)} ».`);
      if (scene.id.startsWith("@") || target.id.startsWith("@")) return fail("Une de ces scènes n'a pas de carte : impossible de la déplacer d'ici.");
      if (scene.id === target.id) return fail("Une scène ne se déplace pas par rapport à elle-même.");
      let moved: boolean;
      if (store.kind === "scenario") {
        const sp = store.screenplay();
        const next = sp ? moveScreenplayScene(sp, scene.id, target.id, side) : sp;
        moved = !!next && next !== sp;
        if (moved && next) store.batch(() => store.setScreenplay(next, true));
      } else {
        moved = store.batch(() => store.moveBookScene(scene.id, target.id, side));
      }
      if (!moved) return { ok: true, text: `La scène « ${scene.title} » est déjà à cette place.` };
      const n = store.scenes().find((s) => s.id === scene.id)?.n;
      return { ok: true, text: `Scène « ${scene.title} » déplacée ${side === "before" ? "avant" : "après"} « ${target.title} »${n ? ` : c'est maintenant la scène ${n}` : ""}. Les numéros des scènes ont changé : relis le plan avant d'en désigner une par son numéro.` };
    }

    case "create_chapter": {
      if (store.kind === "scenario") return fail(NO_CHAPTERS);
      const scene = findScene(store, str(a.scene));
      if (!scene) return fail(`Scène introuvable : « ${str(a.scene)} ».`);
      const title = str(a.title);
      const id = store.batch(() => {
        const id = store.startChapterAt(scene.id);
        if (id && title) store.renameChapter(id, title);
        return id;
      });
      if (!id) return fail(`Impossible de commencer un chapitre à « ${scene.title} » (page hors récit, ou un chapitre y commence déjà).`);
      const chapter = store.chapters().find((c) => c.id === id);
      return { ok: true, text: `Nouveau ${chapter ? chapterName(chapter) : "chapitre"}, à partir de la scène « ${scene.title} ». Les chapitres suivants sont renumérotés.` };
    }

    case "rename_chapter": {
      if (store.kind === "scenario") return fail(NO_CHAPTERS);
      const chapter = findChapter(store, str(a.chapter));
      if (!chapter) return fail(`Chapitre introuvable : « ${str(a.chapter)} ».`);
      const title = str(a.title);
      store.batch(() => store.renameChapter(chapter.id, title));
      return { ok: true, text: title ? `Chapitre ${chapter.n} renommé « ${title} ».` : `Chapitre ${chapter.n} : titre retiré, il garde son numéro.` };
    }

    case "move_chapter": {
      if (store.kind === "scenario") return fail(NO_CHAPTERS);
      const chapter = findChapter(store, str(a.chapter));
      if (!chapter) return fail(`Chapitre introuvable : « ${str(a.chapter)} ».`);
      const wanted = str(a.before);
      const before = wanted ? findScene(store, wanted) : null;
      if (wanted && !before) return fail(`Scène de repère introuvable : « ${wanted} ».`);
      store.batch(() => store.moveChapter(chapter.id, before?.id ?? null));
      return { ok: true, text: `${chapterName(chapter)} déplacé ${before ? `avant la scène « ${before.title} »` : "à la fin du récit"}, avec toutes ses scènes. Numéros des chapitres et des scènes recalculés.` };
    }

    case "delete_chapter": {
      if (store.kind === "scenario") return fail(NO_CHAPTERS);
      const chapter = findChapter(store, str(a.chapter));
      if (!chapter) return fail(`Chapitre introuvable : « ${str(a.chapter)} ».`);
      store.batch(() => store.deleteChapter(chapter.id));
      return { ok: true, text: `${chapterName(chapter)} retiré : ses scènes rejoignent le chapitre précédent. Aucune scène ni aucun texte n'a été supprimé.` };
    }
  }
  return fail(`Outil inconnu : ${req.tool}`);
}
