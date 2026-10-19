// Aspect « pages » de l'éditeur : la feuille continue est découpée en pages aux proportions réelles
// (A4 ou Letter). Le texte reste un seul document ; entre deux pages, une décoration ProseMirror
// laisse la fin de page, la marge basse, un espace, puis la marge haute de la page suivante.
// La coupe se fait d'après la hauteur réelle des éléments à l'écran, pas d'après une estimation.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface PageItem {
  /** Hauteur de l'élément, en lignes. */
  height: number;
  /** Espace au-dessus quand il n'est pas en haut de page, en lignes. */
  margin: number;
  /** Lignes à garder après lui sur la même page (en-tête de scène, personnage). */
  keep: number;
  /** Vrai : l'élément ouvre toujours une nouvelle page (début de chapitre, page de titre…). */
  before?: boolean;
}

export interface PageBreak {
  /** Index de l'élément qui ouvre la nouvelle page. */
  index: number;
  /** Lignes restées libres en bas de la page qu'on quitte. */
  rest: number;
  /** Numéro de la page qui commence. */
  page: number;
}

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
    // Tolérance d'un dixième de ligne : les hauteurs mesurées à l'écran ne tombent pas toujours juste.
    if (used > start && (item.before || used + margin + item.height + item.keep > lines + 0.1)) {
      breaks.push({ index, rest: Math.max(0, lines - used), page: ++page });
      start = 0;
      used = item.height;
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
  item?: (type: string, node: PMNode) => { margin: number; keep: number; before?: boolean };
  /** Numéro de la première page (le manuscrit continue la numérotation des scènes précédentes). */
  firstPage?: () => number;
  /** Texte du numéro de page (scénario : « 2. »). */
  label?: (page: number) => string;
  /** Appelé après chaque découpage : le nombre de pages et la position (dans le document) de l'élément qui ouvre chacune des suivantes. */
  onLayout?: (pages: number, breaks: number[]) => void;
}

/** Règles du scénario : pas de marge avant une réplique, en-tête et personnage jamais seuls en bas de page. */
const screenplayItem = (type: string) => ({
  margin: TIGHT.has(type) ? 0 : 1,
  // Jamais d'en-tête en bas de page (une ligne vide et une ligne de texte), ni de personnage sans réplique.
  keep: type === "sceneHeading" ? 2 : type === "character" ? 1 : 0,
});

/** Espace entre deux pages, en lignes. */
const GAP = 2;
const TIGHT = new Set(["parenthetical", "dialogue"]);

export const pagesKey = new PluginKey<DecorationSet>("screenplayPages");

function spacer(height: number, gapTop: number | null, label: string): () => HTMLElement {
  return () => {
    const el = document.createElement("div");
    el.className = "sp-pagebreak";
    el.contentEditable = "false";
    el.setAttribute("aria-hidden", "true");
    el.style.height = `${height}em`;
    if (gapTop !== null) {
      const gap = document.createElement("div");
      gap.className = "sp-pagebreak-gap";
      gap.style.top = `${gapTop}em`;
      gap.style.height = `${GAP}em`;
      const number = document.createElement("span");
      number.className = "sp-pagebreak-number";
      // Comme sur le PDF : en haut à droite, à un demi-pouce (3 lignes) du bord de la page.
      number.style.top = `${gapTop + GAP + 2.5}em`;
      number.textContent = label;
      el.append(gap, number);
    }
    return el;
  };
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
              doc.forEach((node, offset) => {
                const dom = view.nodeDOM(offset);
                items.push({ height: dom instanceof HTMLElement ? dom.getBoundingClientRect().height / line : 1, ...itemOf(node.type.name, node) });
                positions.push(offset);
              });
              // Marge haute plus grande que celle de la page (page de titre, dédicace…) : la première page commence plus bas.
              const top = parseFloat(getComputedStyle(view.dom).paddingTop) / line;
              const layout = layoutPages(items, lines, Number.isFinite(top) ? top - marginTop : 0);
              pages = layout.pages;
              breakAt = layout.breaks.map((b) => positions[b.index]);
              const bottom = pageLines - marginTop - lines; // marge basse
              for (const b of layout.breaks) {
                // L'élément garde sa marge du dessus (CSS) : on la retire de l'espace ajouté.
                const height = b.rest + bottom + GAP + marginTop - items[b.index].margin;
                decorations.push(
                  Decoration.widget(positions[b.index], spacer(height, b.rest + bottom, label(b.page + first)), {
                    side: -1,
                    key: `page-${b.page + first}-${height.toFixed(2)}`,
                  }),
                );
                next += `${positions[b.index]}:${height.toFixed(2)};`;
              }
              // La dernière page va jusqu'en bas, marge comprise.
              const tail = layout.tail + bottom;
              decorations.push(Decoration.widget(doc.content.size, spacer(tail, null, ""), { side: 1, key: `tail-${tail.toFixed(2)}` }));
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
