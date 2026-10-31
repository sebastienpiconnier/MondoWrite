// Recherche par le sens (« Où ai-je parlé de la lettre ? ») : les passages du projet sont changés en vecteurs
// (embeddings) par le service LOCAL branché (Ollama ou LM Studio), puis classés par proximité avec la question.
// Rien ne part vers un service en ligne : pour Claude, OpenAI ou OpenRouter la fonction n'est pas proposée.
// Rien n'est écrit dans le projet : l'index vit en mémoire le temps de la session (SemanticIndex), et seuls les
// passages dont le texte change sont recalculés (empreinte du texte et du modèle).
//
// Presque tout est pur et testé (semantic.test.ts) : requêtes, lecture des réponses (tableaux de nombres
// vérifiés), découpage du projet en passages, classement par cosinus.

import type { ScreenplayElement } from "../screenplay/model";
import type { CardData, CardType } from "../types";
import { plainText } from "../search";
import { AiError, PROVIDERS, base, headers, send, type AiConfig, type AiProvider, type HttpRequest } from "./providers";

/** La recherche par le sens n'est offerte qu'avec un service qui tourne sur la machine (pas le modèle d'Apple, `device` : le système n'en donne pas de vecteurs). */
export const canEmbed = (provider: AiProvider | null | undefined): boolean => !!provider && PROVIDERS[provider].local && !PROVIDERS[provider].device;

/** Modèle d'embedding proposé d'office : le premier dont le nom contient « embed » (nomic-embed-text, bge-m3 n'en a pas). */
export function proposeEmbedModel(models: string[]): string {
  return models.find((m) => /embed/i.test(m)) ?? "";
}

/** Un modèle de conversation n'est pas un modèle d'embedding : pour proposer un modèle de conversation, on les écarte. */
export const isEmbedModel = (model: string) => /embed|bge-|e5-|gte-|minilm/i.test(model);

/**
 * Préfixes que certains modèles attendent (ils ont été entraînés ainsi) : nomic-embed-text, la famille e5.
 * Sans eux la recherche marche, un peu moins bien.
 */
export function prefixes(model: string): { query: string; doc: string } {
  if (/nomic-embed/i.test(model)) return { query: "search_query: ", doc: "search_document: " };
  if (/(^|[^a-z])e5[-_]/i.test(model)) return { query: "query: ", doc: "passage: " };
  return { query: "", doc: "" };
}

/** Requête d'embeddings pour plusieurs textes à la fois. Ollama : /api/embed ; LM Studio : /v1/embeddings. */
export function embedRequest(config: AiConfig, model: string, inputs: string[]): HttpRequest {
  if (config.provider === "ollama") {
    return { url: `${base(config)}/api/embed`, method: "POST", headers: headers(config), body: JSON.stringify({ model, input: inputs, truncate: true }) };
  }
  // LM Studio (et tout serveur compatible OpenAI) ; le jeton facultatif part dans l'en-tête Bearer (headers).
  return { url: `${base(config)}/v1/embeddings`, method: "POST", headers: headers(config), body: JSON.stringify({ model, input: inputs }) };
}

const isVector = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" && Number.isFinite(x));

/**
 * Vecteurs d'une réponse, dans l'ordre des textes envoyés. Ollama : `{ embeddings: number[][] }` ;
 * OpenAI et LM Studio : `{ data: [{ embedding, index }] }`. Null si la réponse n'a pas exactement `count`
 * vecteurs de nombres finis, tous de la même longueur : on ne croit jamais une réponse sur parole.
 */
export function readEmbeddings(json: unknown, count: number): Float32Array[] | null {
  const body = json as { embeddings?: unknown; data?: unknown } | null;
  let list: unknown[] | null = null;
  if (body && Array.isArray(body.embeddings)) list = body.embeddings;
  else if (body && Array.isArray(body.data)) {
    const rows = body.data as { embedding?: unknown; index?: unknown }[];
    const ordered = rows.every((r) => typeof r?.index === "number") ? [...rows].sort((a, b) => (a.index as number) - (b.index as number)) : rows;
    list = ordered.map((r) => r?.embedding);
  }
  if (!list || list.length !== count || !list.every(isVector)) return null;
  const size = (list[0] as number[]).length;
  if (!list.every((v) => (v as number[]).length === size)) return null;
  return list.map((v) => Float32Array.from(v as number[]));
}

/** Proximité de deux vecteurs (cosinus, de −1 à 1) ; 0 si l'un est nul ou s'ils n'ont pas la même taille. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

// ---------------------------------------------------------------------------------------------
// Découpage du projet en passages

export type ChunkKind = "manuscript" | "screenplay" | "card";

export interface Chunk {
  /** Clé stable dans le projet (carte ou scène, rang) : sert de clé de liste. */
  key: string;
  kind: ChunkKind;
  /** Texte envoyé au modèle (texte simple, borné). */
  text: string;
  /** Empreinte du texte : un passage qui ne change pas n'est pas recalculé. */
  hash: string;
  /** Carte à montrer (carte elle-même, ou carte Scène du passage) ; absente pour une scène sans carte. */
  cardId?: string;
  type: CardType;
  /** Titre de la carte ou en-tête de la scène. */
  label: string;
  /** Pour y aller : identifiant de la scène (roman) ou `@` + rang de l'élément (scénario), pour `openInManuscript`. */
  target?: string;
  /** Début du premier paragraphe, que le manuscrit sélectionne en arrivant (`selectText`). */
  needle?: string;
}

/** Longueur visée d'un passage : les paragraphes courts (répliques) se regroupent jusque-là. */
export const CHUNK_TARGET = 600;
/** Au-delà, un paragraphe est coupé entre deux phrases (les modèles d'embedding lisent 512 jetons et plus). */
export const CHUNK_MAX = 1500;
const NEEDLE = 40;

/** Empreinte FNV-1a sur 32 bits (pas de sécurité ici : seulement savoir si un texte a changé). */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}-${text.length.toString(36)}`;
}

/** Paragraphes d'un HTML d'éditeur, en texte simple. */
export function paragraphsOf(html: string): string[] {
  return html
    .split(/<\/(?:p|li|h[1-6]|blockquote)>|<br\s*\/?>/i)
    .map((part) => plainText(part))
    .filter((p) => p !== "");
}

/** Un paragraphe trop long, coupé entre deux phrases (ou à la longueur, faute de ponctuation). */
function splitLong(text: string): string[] {
  if (text.length <= CHUNK_MAX) return [text];
  const sentences = text.match(/[^.!?…]+[.!?…]+["»”’)]*\s*|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > CHUNK_TARGET * 1.5) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
    while (cur.length > CHUNK_MAX) {
      out.push(cur.slice(0, CHUNK_MAX).trim());
      cur = cur.slice(CHUNK_MAX);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** En dessous, un paragraphe (réplique, phrase isolée) se regroupe avec ses voisins courts. */
export const CHUNK_SHORT = 160;

/**
 * Passages d'un texte : un paragraphe ordinaire est un passage (on veut l'endroit exact), une suite de
 * paragraphes courts (un échange de répliques) en fait un seul, jusqu'à CHUNK_TARGET caractères ; garde le
 * rang du premier.
 */
export function groupParagraphs(paragraphs: string[]): { text: string; first: string; at: number }[] {
  const out: { text: string; first: string; at: number }[] = [];
  let cur: { parts: string[]; at: number } | null = null;
  const flush = () => {
    if (cur && cur.parts.length) out.push({ text: cur.parts.join("\n"), first: cur.parts[0], at: cur.at });
    cur = null;
  };
  paragraphs.forEach((p, i) => {
    for (const piece of splitLong(p)) {
      const size = cur ? cur.parts.join("\n").length : 0;
      if (cur && (piece.length >= CHUNK_SHORT || size >= CHUNK_SHORT || size + piece.length > CHUNK_TARGET)) flush();
      if (!cur) cur = { parts: [], at: i };
      cur.parts.push(piece);
    }
  });
  flush();
  return out;
}

/** Début d'un paragraphe, coupé à la fin d'un mot. */
export function needleOf(text: string): string {
  if (text.length <= NEEDLE) return text;
  const cut = text.slice(0, NEEDLE);
  const space = cut.lastIndexOf(" ");
  return space > 10 ? cut.slice(0, space) : cut;
}

/** Roman : paragraphes du manuscrit, scène par scène (dans l'ordre donné). */
export function manuscriptChunks(order: string[], manuscript: Record<string, string>, titles: Map<string, string>): Chunk[] {
  const out: Chunk[] = [];
  for (const id of order) {
    const html = manuscript[id];
    if (!html) continue;
    groupParagraphs(paragraphsOf(html)).forEach((g, k) => {
      out.push({ key: `m:${id}:${k}`, kind: "manuscript", text: g.text, hash: hashText(g.text), cardId: id, type: "scene", label: titles.get(id) ?? "", target: id, needle: needleOf(g.first) });
    });
  }
  return out;
}

const SCRIPT_TEXT: ReadonlySet<string> = new Set(["action", "character", "parenthetical", "dialogue", "transition", "centered", "synopsis"]);

/**
 * Scénario : éléments regroupés par petits blocs à l'intérieur de chaque scène (un nom et sa réplique
 * restent ensemble). La cible est le rang du premier élément du bloc.
 */
export function screenplayChunks(elements: ScreenplayElement[], at = "@"): Chunk[] {
  const out: Chunk[] = [];
  let heading = "";
  let headingCard: string | undefined;
  let headingAt = -1;
  // Premier bloc d'une scène : il mène à l'en-tête (on arrive en haut de la scène).
  let fresh = false;
  let block: { parts: string[]; at: number } | null = null;
  const flush = () => {
    if (block && block.parts.length) {
      const text = (heading ? `${heading}\n` : "") + block.parts.join("\n");
      out.push({ key: `s:${block.at}`, kind: "screenplay", text, hash: hashText(text), cardId: headingCard, type: "scene", label: heading, target: `${at}${block.at}` });
    }
    block = null;
  };
  elements.forEach((el, i) => {
    if (el.type === "sceneHeading" || el.type === "section") {
      flush();
      if (el.type === "sceneHeading") {
        heading = el.text.trim();
        headingCard = el.cardId;
        headingAt = i;
        fresh = true;
      }
      return;
    }
    if (!SCRIPT_TEXT.has(el.type)) return;
    const text = el.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    const piece = el.type === "character" ? `${text.toUpperCase()} :` : text;
    // Une réplique suit son nom : on ne coupe pas entre les deux.
    const glued = el.type === "dialogue" || el.type === "parenthetical";
    if (block && !glued && block.parts.join("\n").length + piece.length > CHUNK_TARGET) flush();
    if (!block) {
      block = { parts: [], at: fresh && headingAt >= 0 ? headingAt : i };
      fresh = false;
    }
    block.parts.push(piece);
  });
  flush();
  return out;
}

/** Champs de fiche qui portent un code ou une adresse, pas du texte de l'auteur. */
const CODE_FIELDS: ReadonlySet<string> = new Set(["certitude", "statut", "arcType", "principal", "issue", "etat", "repere", "pivot", "url", "consulte", "pages", "numero", "saison"]);

/** Cartes : titre, fiche (valeurs écrites par l'auteur) et texte, un passage par groupe de paragraphes. */
export function cardChunks(cards: CardData[]): Chunk[] {
  const out: Chunk[] = [];
  for (const card of cards) {
    const fiche = Object.entries(card.fiche ?? {})
      .filter(([k, v]) => !CODE_FIELDS.has(k) && typeof v === "string" && v.trim() !== "")
      .map(([, v]) => v.replace(/\s+/g, " ").trim());
    const paragraphs = [...fiche, ...paragraphsOf(card.html ?? "")];
    const title = card.title.trim();
    if (!title && paragraphs.length === 0) continue;
    const groups = groupParagraphs(paragraphs);
    if (groups.length === 0) groups.push({ text: "", first: "", at: 0 });
    groups.forEach((g, k) => {
      const text = [title, g.text].filter(Boolean).join("\n");
      out.push({ key: `c:${card.id}:${k}`, kind: "card", text, hash: hashText(text), cardId: card.id, type: card.type, label: title });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Classement

export interface SemanticHit {
  chunk: Chunk;
  score: number;
}

/**
 * Passages les plus proches de la question, du plus proche au plus lointain. Un passage sans vecteur est
 * ignoré ; une carte n'apparaît qu'une fois (son meilleur passage), pour que la liste ne soit pas mangée par
 * une seule longue fiche. Les passages trop loin du meilleur (`spread`) sont écartés.
 */
export function rankChunks(query: ArrayLike<number>, chunks: Chunk[], vectors: Map<string, ArrayLike<number>>, limit = 20, spread = 0.25): SemanticHit[] {
  const scored: SemanticHit[] = [];
  for (const chunk of chunks) {
    const v = vectors.get(chunk.hash);
    if (!v) continue;
    const score = cosine(query, v);
    if (score > 0) scored.push({ chunk, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  const seen = new Set<string>();
  const out: SemanticHit[] = [];
  for (const hit of scored) {
    if (hit.score < best - spread) break;
    // Carte : un seul résultat. Texte d'une scène : chaque passage compte (on veut l'endroit exact).
    if (hit.chunk.kind === "card") {
      if (seen.has(hit.chunk.cardId ?? hit.chunk.key)) continue;
      seen.add(hit.chunk.cardId ?? hit.chunk.key);
    }
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/** Extrait montré dans la liste : le passage, coupé proprement. */
export function excerptOf(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

// ---------------------------------------------------------------------------------------------
// Index de la session (en mémoire, jamais écrit)

/** Textes envoyés par requête : assez pour aller vite, assez peu pour voir avancer et pouvoir annuler. */
export const BATCH = 16;

/** Identité de ce qui produit les vecteurs : changer de service, d'adresse ou de modèle repart de zéro. */
export const indexKey = (config: AiConfig, model: string) => `${config.provider}|${base(config)}|${model}`;

/** Empreintes à calculer : celles des passages qui n'ont pas encore de vecteur (sans doublon). */
export function missingHashes(chunks: Chunk[], vectors: Map<string, unknown>): Chunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (vectors.has(c.hash) || seen.has(c.hash)) return false;
    seen.add(c.hash);
    return true;
  });
}

export async function embed(config: AiConfig, model: string, inputs: string[], signal?: AbortSignal): Promise<Float32Array[]> {
  const json = await send(embedRequest(config, model, inputs), PROVIDERS[config.provider].local, signal);
  const vectors = readEmbeddings(json, inputs.length);
  if (!vectors) throw new AiError("empty", "embeddings illisibles");
  return vectors;
}

/**
 * Vecteurs de la session pour un service et un modèle. `update` ne calcule que les passages nouveaux ou
 * changés, et oublie ceux qui ne sont plus dans le projet (un autre projet ouvert ne garde rien de l'ancien).
 */
export class SemanticIndex {
  vectors = new Map<string, Float32Array>();
  constructor(public key: string) {}

  async update(config: AiConfig, model: string, chunks: Chunk[], onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    const todo = missingHashes(chunks, this.vectors);
    const { doc } = prefixes(model);
    onProgress(0, todo.length);
    for (let i = 0; i < todo.length; i += BATCH) {
      if (signal?.aborted) throw new AiError("cancelled");
      const batch = todo.slice(i, i + BATCH);
      const out = await embed(config, model, batch.map((c) => doc + c.text), signal);
      batch.forEach((c, k) => this.vectors.set(c.hash, out[k]));
      onProgress(Math.min(todo.length, i + batch.length), todo.length);
    }
    const keep = new Set(chunks.map((c) => c.hash));
    for (const h of [...this.vectors.keys()]) if (!keep.has(h)) this.vectors.delete(h);
  }

  async search(config: AiConfig, model: string, query: string, chunks: Chunk[], signal?: AbortSignal, limit = 20): Promise<SemanticHit[]> {
    const [q] = await embed(config, model, [prefixes(model).query + query.trim()], signal);
    return rankChunks(q, chunks, this.vectors, limit);
  }
}

let session: SemanticIndex | null = null;
/** L'index de la session pour ce service et ce modèle (un nouveau si l'un des deux a changé). */
export function sessionIndex(key: string): SemanticIndex {
  if (!session || session.key !== key) session = new SemanticIndex(key);
  return session;
}
