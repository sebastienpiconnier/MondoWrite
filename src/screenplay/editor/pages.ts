// Aspect « pages » de l'éditeur : la feuille continue est découpée en pages aux proportions réelles
// (A4 ou Letter). Le texte reste un seul document ; entre deux pages, une décoration ProseMirror
// laisse la fin de page, la marge basse, un espace, puis la marge haute de la page suivante.
// La coupe se fait d'après la hauteur réelle des éléments à l'écran, pas d'après une estimation.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { hasContd } from "../export/typeset";
import { pageLabels, resolveLock, type PageStart } from "../lockedPages";
import type { LockedPage } from "../revisions";

export interface PageItem {
  /** Hauteur de l'élément, en lignes. */
  height: number;
  /** Espace au-dessus quand il n'est pas en haut de page, en lignes. */
  margin: number;
  /** Lignes à garder après lui sur la même page (en-tête de scène, personnage). */
  keep: number;
  /** Vrai : l'élément ouvre toujours une nouvelle page (début de chapitre, page de titre…). */
  before?: boolean;
  /** Suite d'une réplique : s'il ouvre une page, le nom du personnage (SUITE) y prend une ligne avant lui. */
  cont?: boolean;
  /**
   * Paragraphe du livre qui peut se couper entre deux pages : hauteur d'une de ses lignes (même unité que
   * `height`). Absent : l'élément ne se coupe jamais (scénario, titres).
   */
  lineHeight?: number;
}

export interface PageBreak {
  /** Index de l'élément qui ouvre la nouvelle page. */
  index: number;
  /** Lignes restées libres en bas de la page qu'on quitte. */
  rest: number;
  /** Numéro de la page qui commence. */
  page: number;
  /** Coupure dans l'élément : rang (depuis 0) de sa ligne qui ouvre la nouvelle page. Absent : avant l'élément. */
  line?: number;
}

/** Lignes d'un paragraphe à garder ensemble de chaque côté d'une coupure de page (veuves et orphelines). */
export const MIN_SPLIT_LINES = 2;

/** Répartit des éléments en pages de `lines` lignes. Fonction pure, testée sans navigateur. */
/**
 * `offset` : lignes déjà prises en haut de la première page (une page de titre ou une dédicace commence
 * plus bas que le texte courant). Les pages suivantes commencent en haut.
 */
export function layoutPages(items: PageItem[], lines: number, offset = 0): { breaks: PageBreak[]; tail: number; pages: number } {
  const breaks: PageBreak[] = [];
  let start = Math.max(0, Math.min(offset, lines));
  let used = start;
  let page = 1;
  items.forEach((item, index) => {
    const margin = used === start ? 0 : item.margin;
    // Paragraphe du livre qui ne tient pas en entier : il se coupe à la ligne, au moins deux lignes de chaque côté.
    const lh = item.lineHeight;
    if (lh && lh > 0 && !(item.before && used > start) && used + margin + item.height + item.keep > lines + 0.1) {
      const total = Math.max(1, Math.round(item.height / lh));
      let done = 0;
      let gap = margin;
      for (;;) {
        const left = total - done;
        const avail = lines - used - gap;
        if (left * lh <= avail + 0.1) {
          used += gap + left * lh;
          break;
        }
        const fit = Math.min(Math.floor((avail + 0.1) / lh), left - MIN_SPLIT_LINES);
        if (fit >= MIN_SPLIT_LINES) {
          breaks.push({ index, rest: Math.max(0, avail - fit * lh), page: ++page, line: done + fit });
          done += fit;
          start = 0;
          used = 0;
          gap = 0;
          continue;
        }
        if (done === 0 && used > start) {
          // Pas assez de place pour deux lignes : le paragraphe commence sur la page suivante.
          breaks.push({ index, rest: Math.max(0, lines - used), page: ++page });
          start = 0;
          used = 0;
          gap = 0;
          continue;
        }
        // Haut de page et paragraphe trop court pour être coupé proprement : il déborde, comme avant.
        used =Math.min(lines, used + gap + left * lh);
        break;
      }
      if (used > lines) used = lines;
      return;
    }
    // Tolérance d'un dixième de ligne : les hauteurs mesurées à l'écran ne tombent pas toujours juste.
    if (used > start && (item.before || used + margin + item.height + item.keep > lines + 0.1)) {
      breaks.push({ index, rest: Math.max(0, lines - used), page: ++page });
      start = 0;
      used = item.height + (item.cont ? 1 : 0);
    } else {
      used += margin + item.height;
    }
    // Un élément plus haut qu'une page (très long paragraphe) : la page est considérée pleine.
    if (used > lines) used = lines;
  });
  return { breaks, tail: Math.max(0, lines - used), pages: page };
}

export interface PagesOptions {
  /** Lignes de texte par page, et hauteur totale d'une page en lignes (marges comprises). */
  geometry: () => { lines: number; pageLines: number; marginTop: number };
  /** Faux sur un écran trop étroit pour une vraie page : la feuille redevient continue. */
  enabled: (editorDom: HTMLElement) => boolean;
  /** Marge au-dessus d'un élément et lignes à garder après lui, selon son type (scénario par défaut). */
  item?: (type: string, node: PMNode) => { margin: number; keep: number; before?: boolean; split?: boolean };
  /** Numéro de la première page (le manuscrit continue la numérotation des scènes précédentes). */
  firstPage?: () => number;
  /** Texte du numéro de page (scénario : « 2. »). */
  label?: (page: number) => string;
  /** Place du numéro : en haut à droite de chaque page (scénario, par défaut) ou centré en bas (livre). */
  numberAt?: "top" | "bottom";
  /** Réplique coupée par la page : « (À SUIVRE) » en bas, le nom et « (SUITE) » en haut (null : rien). */
  continued?: () => { more: string; contd: string } | null;
  /** Appelé après chaque découpage : le nombre de pages et la position (dans le document) de l'élément qui ouvre chacune des suivantes. */
  /** Pages verrouillées (#18, lot 2) : chaque page commence à son élément, les libellés sont 12, 12A, « 13-14 ». */
  lock?: () => LockedPage[] | null;
  onLayout?: (pages: number, breaks: number[]) => void;
}

/** Règles du scénario : pas de marge avant une réplique, en-tête et personnage jamais seuls en bas de page. */
const screenplayItem = (type: string): { margin: number; keep: number; split?: boolean } => ({
  margin: TIGHT.has(type) ? 0 : 1,
  // Jamais d'en-tête en bas de page (une ligne vide et une ligne de texte), ni de personnage sans réplique.
  keep: type === "sceneHeading" ? 2 : type === "character" ? 1 : 0,
});

/** Espace entre deux pages, en lignes. */
const GAP = 2;
const TIGHT = new Set(["parenthetical", "dialogue"]);

export const pagesKey = new PluginKey<DecorationSet>("screenplayPages");

/**
 * Espace entre deux pages. `gapTop` : début de la bande entre les pages (null : fin du document, pas de bande).
 * `top` : place du numéro dans l'espace (en em) ; `bottom` : numéro centré en bas de la page qu'on quitte (livre),
 * sinon en haut à droite de la page qui commence (scénario).
 */
function spacer(height: number, gapTop: number | null, label: string, top: number, bottom = false, speech?: { more: string; cue: string; cueTop: number }, inlinePx?: number): () => HTMLElement {
  return () => {
    const el = document.createElement(inlinePx ? "span" : "div");
    el.className = inlinePx ? "sp-pagebreak is-inline" : "sp-pagebreak";
    el.contentEditable = "false";
    el.setAttribute("aria-hidden", "true");
    // Coupure dans un paragraphe : un bloc en ligne de toute la largeur, posé au début de la ligne qui ouvre la
    // page suivante. La ligne d'avant se coupe d'elle-même, donc reste justifiée. Son corps est celui de
    // l'éditeur (un paragraphe en petits caractères ne doit pas changer la hauteur de l'espace).
    if (inlinePx) el.style.fontSize = `${inlinePx}px`;
    el.style.height = `${height}em`;
    if (gapTop !== null) {
      const gap = document.createElement("div");
      gap.className = "sp-pagebreak-gap";
      gap.style.top = `${gapTop}em`;
      gap.style.height = `${GAP}em`;
      el.append(gap);
    }
    if (label) {
      const number = document.createElement("span");
      number.className = bottom ? "sp-pagebreak-number is-bottom" : "sp-pagebreak-number";
      number.style.top = `${top}em`;
      number.textContent = label;
      el.append(number);
    }
    // Réplique coupée : (À SUIVRE) sur la première ligne libre, le nom et (SUITE) sur la dernière ligne de l'espace.
    if (speech) {
      if (speech.more) {
        const more = document.createElement("span");
        more.className = "sp-pagebreak-speech";
        more.style.top = "0em";
        more.textContent = speech.more;
        el.append(more);
      }
      const cue = document.createElement("span");
      cue.className = "sp-pagebreak-speech";
      cue.style.top = `${speech.cueTop}em`;
      cue.textContent = speech.cue;
      el.append(cue);
    }
    return el;
  };
}

/** Hauteur (px) des coupures de page déjà posées dans un paragraphe, à retirer de sa hauteur mesurée. */
function innerBreaks(dom: HTMLElement): DOMRect[] {
  return Array.from(dom.querySelectorAll<HTMLElement>(".sp-pagebreak")).map((el) => el.getBoundingClientRect());
}

const blank = /\s/;

/**
 * Position dans le document du début de la ligne `line` (depuis 0) d'un paragraphe, comptée comme si aucune
 * coupure n'y était posée. null : introuvable (paragraphe pas encore dessiné, mesure qui ne tombe pas juste).
 */
function lineStart(view: EditorView, offset: number, node: PMNode, dom: HTMLElement, line: number, linePx: number): number | null {
  const box = dom.getBoundingClientRect();
  let y = box.top + (line + 0.5) * linePx;
  // Les coupures déjà posées décalent les lignes qui les suivent.
  for (const r of innerBreaks(dom)) if (r.top <= y) y += r.height;
  const hit = view.posAtCoords({ left: box.left + 2, top: y });
  const from = offset + 1;
  const to = offset + node.nodeSize - 1;
  if (!hit || hit.pos <= from || hit.pos >= to) return null;
  let pos = hit.pos;
  try {
    // Revenir au premier caractère de la ligne visée.
    const top = view.coordsAtPos(pos, 1).top;
    while (pos - 1 > from && Math.abs(view.coordsAtPos(pos - 1, 1).top - top) < linePx / 3) pos--;
  } catch {
    return null;
  }
  // Ligne qui commence au milieu d'un mot coupé (césure) : la coupure passe avant le mot entier.
  const text = (a: number) => view.state.doc.textBetween(a - 1, a, "\n", "\u0000");
  let back = 0;
  while (pos - 1 > from && back < 40 && !blank.test(text(pos))) {
    pos--;
    back++;
  }
  if (pos - 1 <= from || back >= 40) return null;
  return pos;
}

export const Pages = Extension.create<PagesOptions>({
  name: "screenplayPages",
  addOptions: () => ({ geometry: () => ({ lines: 55, pageLines: 66, marginTop: 6 }), enabled: () => true }) as PagesOptions,

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<DecorationSet>({
        key: pagesKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(pagesKey) as Decoration[] | undefined;
            return next ? DecorationSet.create(tr.doc, next) : set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => pagesKey.getState(state),
          handleDOMEvents: {
            // Clic dans le blanc sous le texte (le bas de la dernière page) : le curseur va à la fin du
            // dernier paragraphe. Sans cela ProseMirror le posait après lui, et la frappe créait un paragraphe vide.
            mousedown(view, event) {
              if (event.button !== 0 || event.target !== view.dom) return false;
              const blocks = Array.from(view.dom.children).filter((el) => !el.classList.contains("sp-pagebreak"));
              const last = blocks[blocks.length - 1];
              if (!last || event.clientY <= last.getBoundingClientRect().bottom) return false;
              event.preventDefault();
              view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)).scrollIntoView());
              view.focus();
              return true;
            },
          },
        },
        view(view) {
          let frame = 0;
          let signature = "";

          const measure = () => {
            frame = 0;
            if (view.isDestroyed) return;
            const { doc } = view.state;
            const line = parseFloat(getComputedStyle(view.dom).fontSize);
            const { lines, pageLines, marginTop } = options.geometry();
            const itemOf = options.item ?? screenplayItem;
            const first = (options.firstPage?.() ?? 1) - 1;
            const label = options.label ?? ((page: number) => `${page}.`);
            const decorations: Decoration[] = [];
            let next = `p${first};`;
            let pages = 0;
            let breakAt: number[] = [];

            if (line > 0 && options.enabled(view.dom as HTMLElement)) {
              const items: PageItem[] = [];
              const positions: number[] = [];
              const types: string[] = [];
              const plan = options.lock && options.numberAt !== "bottom" ? resolveLock(options.lock(), doc.children.map((n) => ({ type: n.type.name, text: n.textContent }))) : null;
              const forced = new Set(plan?.starts ?? []);
              const continued = options.continued?.() ?? null;
              // Pour chaque suite de réplique, le nom de celui qui parle (pour le répéter en haut de page).
              const cues = new Map<number, string>();
              let cue = "";
              let previous = "";
              doc.forEach((node, offset) => {
                const dom = view.nodeDOM(offset);
                const type = node.type.name;
                if (type === "character") cue = node.textContent.trim();
                // Une réplique ne se coupe qu'entre deux de ses éléments (dialogue, didascalie) : un paragraphe ne se coupe pas à l'écran.
                const cont = !!continued && TIGHT.has(type) && TIGHT.has(previous) && cue !== "";
                if (cont) cues.set(items.length, cue);
                const { split, ...rules } = itemOf(type, node);
                let height = 1;
                let lineHeight: number | undefined;
                if (dom instanceof HTMLElement) {
                  // Hauteur du texte seul : sans les coupures de page déjà posées dans le paragraphe.
                  const inner = split ? innerBreaks(dom).reduce((sum, r) => sum + r.height, 0) : 0;
                  height = (dom.getBoundingClientRect().height - inner) / line;
                  const lh = split ? parseFloat(getComputedStyle(dom).lineHeight) / line : NaN;
                  if (Number.isFinite(lh) && lh > 0) lineHeight = lh;
                }
                items.push({
                  height,
                  ...rules,
                  ...(lineHeight ? { lineHeight } : {}),
                  ...(forced.has(items.length) && items.length > 0 ? { before: true } : {}),
                  ...(cont ? { cont } : {}),
                });
                positions.push(offset);
                types.push(type);
                // Le nom ne reste jamais seul en bas de page : il garde avec lui le premier élément de sa réplique entier.
                if (TIGHT.has(type) && previous === "character") {
                  const name = items[items.length - 2];
                  name.keep = Math.max(name.keep, Math.min(lines, items[items.length - 1].height));
                }
                previous = type;
              });
              // Marge haute plus grande que celle de la page (page de titre, dédicace…) : la première page commence plus bas.
              const top = parseFloat(getComputedStyle(view.dom).paddingTop) / line;
              const layout = layoutPages(items, lines, Number.isFinite(top) ? top - marginTop : 0);
              pages = layout.pages;
              // Coupure dans un paragraphe : position du premier caractère de la ligne qui ouvre la page.
              const editorPx = line;
              const splitAt = layout.breaks.map((b) => {
                if (b.line === undefined) return null;
                const dom = view.nodeDOM(positions[b.index]);
                const lh = items[b.index].lineHeight;
                if (!(dom instanceof HTMLElement) || !lh) return null;
                return lineStart(view, positions[b.index], doc.child(b.index), dom, b.line, lh * editorPx);
              });
              breakAt = layout.breaks.map((b, i) => splitAt[i] ?? positions[b.index]);
              // Libellés des pages verrouillées : l'élément qui ouvre chaque page, au sens de typeset (le nom, pour une réplique coupée).
              let labels: string[] | null = null;
              if (plan) {
                const starts: PageStart[] = [{ start: 0 }];
                for (const b of layout.breaks) {
                  let at = b.index;
                  const speech = TIGHT.has(types[at]);
                  if (speech) while (at > 0 && types[at] !== "character") at--;
                  starts.push({ start: at, ...(speech ? { cont: true } : {}) });
                }
                labels = pageLabels(plan, starts);
                next += `L${labels.join(",")};`;
              }
              const bottom = pageLines - marginTop - lines; // marge basse
              const atBottom = options.numberAt === "bottom";
              // Numéro centré en bas : au milieu de la marge basse de la page qu'on quitte.
              const bottomTop = (rest: number) => rest + bottom / 2 - 0.45;
              layout.breaks.forEach((b, i) => {
                const inside = splitAt[i];
                // Coupure introuvable dans le paragraphe : il passe en entier à la page suivante, avec ses lignes du bas.
                const moved = b.line !== undefined && inside === null ? Math.min(lines, b.line * (items[b.index].lineHeight ?? 0)) : 0;
                const rest = b.rest + moved;
                // L'élément garde sa marge du dessus (CSS) : on la retire de l'espace ajouté (pas dans un paragraphe coupé).
                const base = rest + bottom + GAP + marginTop - (inside === null ? items[b.index].margin : 0);
                // Réplique coupée : une ligne de plus en haut de la page pour le nom et (SUITE).
                const who = continued && items[b.index].cont ? cues.get(b.index) : undefined;
                const speech = who && continued ? { more: continued.more, cue: hasContd(who, continued.contd) ? who : `${who} ${continued.contd}`, cueTop: base } : undefined;
                const height = base + (speech ? 1 : 0);
                decorations.push(
                  Decoration.widget(inside ?? positions[b.index], spacer(height, rest + bottom, labels ? `${labels[b.page - 1]}.` : label(atBottom ? b.page - 1 + first : b.page + first), atBottom ? bottomTop(rest) : rest + bottom + GAP + 2.5, atBottom, speech, inside === null ? undefined : editorPx), {
                    side: -1,
                    key: `page-${b.page + first}-${height.toFixed(2)}-${inside ?? ""}-${speech ? `${speech.more}|${speech.cue}` : ""}`,
                  }),
                );
                next += `${inside ?? positions[b.index]}:${height.toFixed(2)}:${speech?.cue ?? ""};`;
              });
              // La dernière page va jusqu'en bas, marge comprise.
              const tail = layout.tail + bottom;
              // Livre : la dernière page porte aussi son numéro, en bas.
              const lastLabel = atBottom ? label(pages + first) : "";
              decorations.push(
                Decoration.widget(doc.content.size, spacer(tail, null, lastLabel, bottomTop(layout.tail), true), { side: 1, key: `tail-${tail.toFixed(2)}-${lastLabel}` }),
              );
              next += `end:${tail.toFixed(2)}`;
            }

            options.onLayout?.(pages, breakAt);
            if (next === signature) return;
            signature = next;
            view.dispatch(view.state.tr.setMeta(pagesKey, decorations).setMeta("addToHistory", false));
          };

          const schedule = () => {
            if (!frame) frame = requestAnimationFrame(measure);
          };
          // La largeur de la feuille change (fenêtre, panneaux, mode focus) : les lignes se recoupent.
          const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
          observer?.observe(view.dom);
          schedule();
          return {
            update: schedule,
            destroy() {
              observer?.disconnect();
              if (frame) cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});
