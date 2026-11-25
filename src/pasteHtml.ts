// HTML collé depuis un traitement de texte (Word, Pages, LibreOffice) : Word coupe le code source de ses
// paragraphes à environ 80 caractères par de vrais retours à la ligne. Un navigateur les lit comme des
// espaces, mais un éditeur qui garde les blancs (le scénario : `whitespace: "pre"`) les gardait comme des
// retours, et un paragraphe collé arrivait coupé en morceaux. Ces retours deviennent des espaces, hors
// d'un <pre> ; un vrai saut de ligne de l'auteur (<br>) reste.

const KEEP = new Set(["PRE", "TEXTAREA", "SCRIPT", "STYLE"]);

/** Retours à la ligne du code source d'un HTML collé, remplacés par des espaces (pur, sauf DOMParser). */
export function flattenSourceNewlines(html: string): string {
  if (!/[\r\n]/.test(html) || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node: Node, inPre: boolean) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        if (!inPre && /[\r\n]/.test(child.nodeValue ?? "")) child.nodeValue = (child.nodeValue ?? "").replace(/[ \t]*[\r\n]+[ \t]*/g, " ");
      } else if (child.nodeType === 1) {
        walk(child, inPre || KEEP.has((child as Element).tagName));
      }
    }
  };
  walk(doc.body, false);
  return doc.body.innerHTML;
}
