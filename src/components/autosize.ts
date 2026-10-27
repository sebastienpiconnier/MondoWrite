// Hauteur d'un champ de texte ajustée à son contenu, pour les navigateurs sans `field-sizing: content`
// (WebKit de l'app Mac et de l'iPad). Les champs sont mesurés ensemble, une fois par image : à l'ouverture d'un
// projet de 400 cartes, mesurer chaque titre à son tour faisait recalculer la page 400 fois.

const pending = new Set<HTMLTextAreaElement>();
let frame = 0;

const native = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

function flush() {
  frame = 0;
  const list = [...pending].filter((el) => el.isConnected);
  pending.clear();
  // Écritures, puis lectures, puis écritures : un seul calcul de la mise en page pour tous.
  for (const el of list) el.style.height = "auto";
  const heights = list.map((el) => el.scrollHeight);
  list.forEach((el, i) => (el.style.height = `${heights[i]}px`));
}

/** Demande l'ajustement d'un champ à la prochaine image (rien si le navigateur le fait tout seul). */
export function autosize(el: HTMLTextAreaElement | null) {
  if (!el || native) return;
  pending.add(el);
  if (!frame) frame = requestAnimationFrame(flush);
}
