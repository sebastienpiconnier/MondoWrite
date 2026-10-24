// Aides à l'écriture du système, réglées dans les Réglages (appareil) :
// - le correcteur orthographique (fautes soulignées) : partout, sauf dans le manuscrit et le scénario où il
//   s'active à la demande (bouton « Orthographe », Cmd/Ctrl + ;), ou nulle part ;
// - les suggestions et la correction automatique du clavier (iPad, iPhone, Mac) : mots proposés pendant la
//   frappe et mots corrigés à la place de l'auteur.
// Le correcteur passe par l'attribut `spellcheck` de <html>, hérité par tous les champs et éditeurs qui ne le
// fixent pas eux-mêmes. Les suggestions sont coupées sur le champ qui reçoit le focus (`autocorrect`,
// `writingsuggestions`), ce qui couvre aussi les éditeurs créés plus tard.

export type SpellcheckMode = "all" | "notes" | "off";
export const SPELLCHECK_MODES: readonly SpellcheckMode[] = ["notes", "all", "off"];
export const isSpellcheckMode = (v: unknown): v is SpellcheckMode => SPELLCHECK_MODES.includes(v as SpellcheckMode);

/** Le correcteur est-il actif à l'ouverture du manuscrit et du scénario ? */
export const spellOnInPages = (mode: SpellcheckMode) => mode === "all";

const MARK = "data-aids-off";
const TEXT_FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, [contenteditable='true']";

let suggestions = true;
let listening = false;

const onFocus = (e: FocusEvent) => {
  const el = e.target instanceof Element ? e.target.closest(TEXT_FIELD) : null;
  if (!el) return;
  if (!suggestions) {
    // Un champ technique qui coupe déjà tout (adresse, clé) garde ses propres réglages.
    if (el.getAttribute("autocorrect") === "off" && !el.hasAttribute(MARK)) return;
    el.setAttribute("autocorrect", "off");
    el.setAttribute("writingsuggestions", "false");
    el.setAttribute(MARK, "");
  } else if (el.hasAttribute(MARK)) {
    el.removeAttribute("autocorrect");
    el.removeAttribute("writingsuggestions");
    el.removeAttribute(MARK);
  }
};

/** Applique les deux réglages (appelé au lancement et à chaque changement des réglages). */
export function applyWritingAids(spell: SpellcheckMode, withSuggestions: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("spellcheck", spell === "off" ? "false" : "true");
  suggestions = withSuggestions;
  if (!listening) {
    document.addEventListener("focusin", onFocus, true);
    listening = true;
  }
  // Le champ qui a déjà le focus suit tout de suite.
  const active = document.activeElement;
  if (active) onFocus({ target: active } as unknown as FocusEvent);
}
