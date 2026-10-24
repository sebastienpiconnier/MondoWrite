// Texte d'une carte qui change de nature : texte collé sur une carte, carte qui devient Scène ou qui cesse de
// l'être. Le texte de l'auteur n'est jamais perdu ni réduit : il passe des notes de la carte (`html`) au texte
// de la scène (manuscrit d'un roman, corps de la scène dans le scénario) et retour. Fonctions pures.

import { markdownToHtml } from "./storage/markdown";
import { looksLikeMarkdown, markHighlights } from "./markdownText";
import { plainText } from "./search";
import type { ScreenplayElement } from "./screenplay/model";
import { parse } from "./screenplay/parse";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Texte brut (collé) en HTML d'éditeur : Markdown reconnu, sinon un paragraphe par ligne non vide. */
export function textToHtml(text: string): string {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return "";
  if (looksLikeMarkdown(clean)) return markdownToHtml(markHighlights(clean));
  return clean
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

/** Ajoute un HTML à la fin d'un autre (texte vide : le nouveau seul). */
export function appendHtml(before: string | undefined, added: string): string {
  const a = (before ?? "").trim();
  if (!added) return a;
  return a && plainText(a) ? `${a}${added}` : added;
}

/** Au-delà, des notes ne sont plus un synopsis (une ligne) mais le texte de la scène. */
export const SYNOPSIS_MAX = 280;

/**
 * Notes d'une carte qui devient Scène : un synopsis (une ligne courte) ou déjà le texte de la scène (plusieurs
 * paragraphes, ou un long passage collé). Le texte va dans la scène, avec sa mise en forme.
 */
export function notesAreSceneText(html: string | undefined): boolean {
  if (!html) return false;
  const text = plainText(html).trim();
  if (!text) return false;
  const blocks = (html.match(/<(p|li|h[1-6]|blockquote)\b/g) ?? []).length;
  return blocks > 1 || text.length > SYNOPSIS_MAX;
}

/** Le synopsis n'est pas recopié en tête du texte s'il y est déjà (aller-retour Scène, Idée, Scène). */
export function withoutLeadingSynopsis(html: string, synopsis: string | undefined): string {
  const s = (synopsis ?? "").trim();
  if (!s) return html;
  const m = html.match(/^<p>(?:<em>)?([\s\S]*?)(?:<\/em>)?<\/p>/);
  if (!m || plainText(m[1]).trim() !== s) return html;
  return html.slice(m[0].length);
}

/**
 * Notes d'une carte qui cesse d'être une Scène : son synopsis (en italique) puis son texte, pour que rien ne
 * disparaisse de la carte. Ses notes existantes passent devant.
 */
export function sceneToNotes(notes: string | undefined, synopsis: string | undefined, text: string | undefined): string {
  const parts: string[] = [];
  if (notes && plainText(notes).trim()) parts.push(notes.trim());
  const s = (synopsis ?? "").trim();
  if (s) parts.push(`<p><em>${escapeHtml(s)}</em></p>`);
  if (text && plainText(text).trim()) parts.push(text.trim());
  return parts.join("");
}

/** Paragraphes d'un HTML d'éditeur, en texte simple (pour en faire des éléments du scénario). */
export function htmlParagraphs(html: string | undefined): string[] {
  if (!html) return [];
  const blocks = html.match(/<(p|li|h[1-6]|blockquote)\b[^>]*>[\s\S]*?<\/\1>/g);
  const parts = blocks ?? [html];
  return parts.map((b) => plainText(b).trim()).filter(Boolean);
}

/** Corps d'une scène du scénario en notes de carte : une réplique sous le nom de son personnage, le reste tel quel. */
export function sceneBodyHtml(body: ScreenplayElement[]): string {
  const out: string[] = [];
  for (const el of body) {
    const text = el.text.trim();
    if (!text || el.type === "note" || el.type === "boneyard" || el.type === "pageBreak" || el.type === "synopsis") continue;
    const safe = escapeHtml(text).replace(/\n/g, "<br>");
    out.push(el.type === "character" ? `<p><strong>${safe.toUpperCase()}</strong></p>` : `<p>${safe}</p>`);
  }
  return out.join("");
}

/** Notes d'une carte en éléments du scénario (règles Fountain : action par défaut, NOM en capitales puis réplique). */
export function textElements(html: string | undefined): ScreenplayElement[] {
  const paragraphs = htmlParagraphs(html);
  if (paragraphs.length === 0) return [];
  // Une ligne vide entre deux paragraphes : chacun est un élément ; un nom en capitales reste collé à sa réplique.
  let source = "";
  paragraphs.forEach((p, i) => {
    source += p;
    if (i < paragraphs.length - 1) source += isCue(p) ? "\n" : "\n\n";
  });
  return fountainElements(source);
}

/** Nom de personnage (Fountain) : en capitales, court, sans minuscule. */
const isCue = (line: string) => line.length <= 40 && /\p{Lu}/u.test(line) && !/\p{Ll}/u.test(line.replace(/\(.*?\)/g, ""));

/** Texte brut (collé) en éléments du scénario ; « Titre: » en tête n'est pas lu comme une page de titre. */
export function fountainElements(text: string): ScreenplayElement[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  return parse(`\n${clean}`).elements.filter((el) => el.type !== "sceneHeading" || el.text.trim());
}
