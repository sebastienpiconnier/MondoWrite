// Roman interactif, lot 7 : l'histoire en une seule page web jouable, sans serveur ni connexion.
// La page porte l'histoire compilée (JSON d'Ink), le moteur d'inkjs (MIT, sa licence recopiée dans la page),
// les images en `data:` et un petit lecteur écrit ici. Tout le texte de l'histoire passe par `textContent`,
// jamais par `innerHTML`. Fonctions pures : le moteur et l'histoire compilée sont reçus en paramètres.

import { isMediaName } from "../media";
import { IMAGE_TAG, SCENE_VAR, type InkSource } from "./ink";
import { safeCss, themeCss, type WebTheme } from "./webThemes";

/** Textes de la page, dans la langue de l'interface au moment de l'export. */
export interface WebPageTexts {
  restart: string;
  back: string;
  end: string;
  /** « Ce que sait le lecteur : » */
  known: string;
  /** « {fact} : {value} » */
  value: string;
  noScript: string;
  failed: string;
  madeWith: string;
  /** Accueil (#121) */
  start: string;
  continue: string;
  home: string;
  /** Lien d'évitement (#126) : « Aller à l'histoire » */
  skip: string;
  /** Nom de la liste des choix (#126) : « Que faites-vous ? » */
  choices: string;
  /** Avant chaque choix, pour un lecteur d'écran (#126) : « Choix {n} sur {total} : » */
  choiceOf: string;
  /** Description d'une image, dite par un lecteur d'écran (#126) : « Image : {alt} » */
  image: string;
  /** Réglages d'affichage du lecteur (#121) */
  display: string;
  theme: string;
  modeAuto: string;
  modeLight: string;
  modeDark: string;
  textSize: string;
  sizeSmall: string;
  sizeMedium: string;
  sizeLarge: string;
  /** Fins découvertes (#124) : « Fins découvertes : {n} sur {total} » */
  endingsFound: string;
  /** « bonnes : {n} sur {total} » */
  endingsGood: string;
  /** « mauvaises : {n} sur {total} » */
  endingsBad: string;
  endGood: string;
  endBad: string;
  /** Partie à emporter (#124) */
  exportSave: string;
  importSave: string;
  importDone: string;
  importOther: string;
  importVersion: string;
  importBad: string;
  /** Le navigateur ne garde rien (navigation privée, quota). */
  noStorage: string;
}

/** Une fin de l'histoire (#124) : nom de sa scène dans l'Ink, et son type (lot 14). */
export interface WebEnding {
  id: string;
  kind: "good" | "bad" | null;
}

export interface WebPageInput {
  title: string;
  author?: string;
  /** Accroche de la couverture du projet (`pitch.tagline`), si elle est remplie (#121). */
  tagline?: string;
  /** Couverture du projet : fichier de `sources`, et son texte alternatif (#121). */
  cover?: { file: string; alt: string };
  lang: string;
  /** Histoire compilée (`story.ToJson()`). */
  storyJson: string;
  /** Moteur d'inkjs (dist/ink.js), tel que publié. */
  runtime: string;
  /** Licence du moteur, recopiée dans la page (MIT). */
  runtimeLicense: string;
  /** Adresse de chaque fichier image (#125) : `data:` pour la page seule, chemin relatif dans l'archive. */
  sources: Readonly<Record<string, string>>;
  /** Fichier de `sources` de chaque image citée, par nom de medias/ : une même image n'est écrite qu'une fois. */
  images: Readonly<Record<string, string>>;
  /** Description de chaque image, telle qu'écrite dans le texte (#126). Absente : image décorative. */
  alts?: Readonly<Record<string, string>>;
  /** Faits montrés au lecteur : nom de la variable Ink et libellé. */
  facts: readonly { name: string; label: string }[];
  /** Livre (#124) : une partie exportée ne se reprend que dans le même livre. */
  book?: string;
  /** Fins de l'histoire (#124), comptées pour « Fins découvertes ». */
  endings?: readonly WebEnding[];
  /** Le lecteur peut revenir au choix précédent (#124), oui par défaut. */
  allowBack?: boolean;
  /** Nom proposé pour une partie exportée (#124). */
  saveName?: string;
  /** Thème de la page (#122) : Classique par défaut. */
  theme?: WebTheme;
  /** CSS de l'auteur, posé après le thème (#122). */
  customCss?: string;
  texts: WebPageTexts;
}

/** Images citées par l'histoire (étiquettes `# image: nom`), noms sûrs seulement, sans doublon. */
export function storyImageNames(source: Pick<InkSource, "ink">): string[] {
  const names = new Set<string>();
  const tag = IMAGE_TAG.replace(":", "");
  for (const m of source.ink.matchAll(new RegExp(`^#\\s*${tag}:\\s*(\\S+)\\s*$`, "gm"))) if (isMediaName(m[1])) names.add(m[1]);
  return [...names];
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Données JSON posées dans un `<script type="application/json">` : rien ne peut y fermer la balise. */
export const jsonForScript = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Code posé dans un `<script>` : une fermeture de balise ou un début de commentaire HTML le couperait. */
export function scriptSafe(code: string): string {
  return code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}

const fnv = (...texts: string[]) => {
  let h = 2166136261;
  for (const text of texts) for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
};

/** Clé de la progression gardée par le navigateur du lecteur : propre au titre et à l'histoire. */
export function progressKey(title: string, storyJson: string): string {
  return `mondowrite-story-${fnv(title, storyJson)}`;
}

/** Identifiant du livre (#124) : le même d'une version à l'autre de l'histoire, sans rien dire du projet. */
export const bookId = (seed: string) => `b${fnv("mondowrite-book", seed)}`;


// Mise en page commune à tous les thèmes : seules les variables de `themeCss` changent d'un thème à l'autre.
const CSS = `* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--font); font-size: calc(var(--base) * var(--scale)); line-height: var(--leading); }
.sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip { position: absolute; left: 0.75rem; top: -10em; z-index: 2; background: var(--paper); color: var(--ink); padding: 0.6em 1em; border: 2px solid var(--accent); border-radius: var(--radius); font-size: 1rem; }
.skip:focus { top: max(0.75rem, env(safe-area-inset-top)); }
.display { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5em 0.75em; padding: max(0.75rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 0 max(1rem, env(safe-area-inset-left)); font-size: 1rem; line-height: 1.2; }
.seg { display: inline-flex; border: 1px solid var(--rule); border-radius: var(--radius); }
.seg button { border: 0; border-radius: 0; min-width: 44px; padding: 0.4em 0.8em; }
.seg button + button { border-left: 1px solid var(--rule); }
.seg button:first-child { border-radius: var(--radius) 0 0 var(--radius); }
.seg button:last-child { border-radius: 0 var(--radius) var(--radius) 0; }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); }
.size-s { font-size: 0.85em; }
.size-l { font-size: 1.3em; }
main { max-width: var(--measure); margin: 0 auto; padding: 1.5em max(1.25em, env(safe-area-inset-right)) max(6em, env(safe-area-inset-bottom)) max(1.25em, env(safe-area-inset-left)); }
main:focus { outline: none; }
.home { text-align: center; margin: 1.5em 0 3em; }
.cover { margin: 0 auto 1.75em; }
.cover img { display: block; margin: 0 auto; max-width: min(100%, 22em); max-height: 48vh; max-height: 48dvh; width: auto; height: auto; border: 1px solid var(--rule); }
.home h1 { font-size: 2em; line-height: 1.2; margin: 0 0 0.4em; overflow-wrap: break-word; }
.home .author { margin: 0; color: var(--soft); }
.home .tagline { margin: 1em 0 0; font-style: italic; }
.home-actions { display: flex; flex-wrap: wrap; gap: 0.75em; justify-content: center; margin-top: 2.25em; }
.home-found { margin: 1.5em 0 0; color: var(--soft); }
.home-more { display: flex; flex-wrap: wrap; gap: 0.5em 0.75em; justify-content: center; margin-top: 1.5em; }
.home-more button { font-size: 0.9rem; border-color: transparent; text-decoration: underline; text-underline-offset: 0.2em; }
.home-note { margin: 1.25em auto 0; max-width: 32em; font-size: 0.9rem; color: var(--soft); }
button { font: inherit; font-size: 1rem; color: inherit; background: none; border: 1px solid var(--rule); border-radius: var(--radius); padding: 0.55em 1em; min-height: 44px; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-size: 1.125rem; padding: 0.6em 1.6em; }
button:disabled { opacity: 0.45; cursor: default; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
#story .turn:focus { outline: none; }
@media (any-hover: hover) { button:not(:disabled):hover { border-color: var(--accent); } }
.tools { display: flex; gap: 0.5em; justify-content: center; flex-wrap: wrap; margin: 0 0 2.5em; }
#story p { margin: 0 0 0.9em; }
#story .illus { margin: 1.5em 0; text-align: center; }
#story img { max-width: 100%; height: auto; }
.chose { margin: 2em 0 1em; color: var(--soft); font-style: italic; }
.chose::before { content: "\\2192\\00a0"; }
ol.choices { list-style: none; padding: 0; margin: 2em 0; display: grid; gap: 0.6em; }
ol.choices button { width: 100%; text-align: left; border-color: var(--accent); }
ol.choices .n { color: var(--soft); margin-right: 0.35em; }
.known { margin: 2em 0 0; padding-top: 0.75em; border-top: 1px solid var(--rule); color: var(--soft); font-size: 0.95em; }
.end { margin: 2.5em 0 1em; text-align: center; font-style: italic; }
.end-kind { margin: 0 0 0.5em; text-align: center; font-weight: bold; }
.found { margin: 0 0 1em; text-align: center; color: var(--soft); }
.end-tools { text-align: center; }
footer { margin-top: 4em; text-align: center; font-size: 0.85em; color: var(--soft); }
footer a { color: inherit; }
.failed { color: var(--soft); text-align: center; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print { .skip, .display, .tools, .home-actions, .home-more, ol.choices, footer { display: none; } #mw-reader[hidden] { display: block !important; } }
`;

// Réglages d'affichage posés avant le premier dessin (pas d'éclair clair avant le sombre). Le lecteur les retrouve
// dans toutes les histoires faites avec MondoWrite, dans ce navigateur.
const DISPLAY_KEY = "mondowrite-display";
const EARLY = `(function () { try { var d = JSON.parse(localStorage.getItem("${DISPLAY_KEY}") || "null"); var r = document.documentElement;
  if (d && (d.mode === "light" || d.mode === "dark")) r.setAttribute("data-mode", d.mode);
  if (d && (d.size === "s" || d.size === "l")) r.setAttribute("data-size", d.size); } catch (e) {} })();`;

// Lecteur de la page (JavaScript ordinaire, sans dépendance hors du moteur d'inkjs).
const PLAYER = `(function () {
  var read = function (id) { return JSON.parse(document.getElementById(id).textContent); };
  var data = read("mw-data");
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var storyEl = $("story"), homeEl = $("mw-home"), readerEl = $("mw-reader");
  var startBtn = $("mw-start"), continueBtn = $("mw-continue"), againBtn = $("mw-again");
  var homeBtn = $("mw-home-btn"), backBtn = $("mw-back"), restartBtn = $("mw-restart");
  var foundEl = $("mw-found"), exportBtn = $("mw-export"), importBtn = $("mw-import"), fileInput = $("mw-file");
  var statusEl = $("mw-status"), noStoreEl = $("mw-nostore");
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var each = function (sel, fn) { var list = document.querySelectorAll(sel); for (var i = 0; i < list.length; i++) fn(list[i]); };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  // Le navigateur garde-t-il quelque chose ? Navigation privée ou quota : la page reste jouable, et le dit (#124).
  var store = null;
  try { store = window.localStorage; store.setItem("mondowrite-probe", "1"); store.removeItem("mondowrite-probe"); } catch (e) { store = null; }
  var noStore = function () { noStoreEl.hidden = false; };
  if (!store) noStore();
  // Images (#125) : chaque fichier une fois, une adresse par fichier ; chargées quand on y arrive.
  var srcOf = function (name) { var f = has(data.images, name) ? data.images[name] : null; return f && has(data.sources, f) ? data.sources[f] : null; };
  var coverImg = $("mw-cover");
  if (coverImg && data.cover && has(data.sources, data.cover)) coverImg.src = data.sources[data.cover];

  // Affichage (#121) : clair, sombre ou comme le système ; taille du texte en trois crans.
  var display = { mode: "auto", size: "m" };
  if (store) try {
    var d = JSON.parse(store.getItem("${DISPLAY_KEY}") || "null");
    if (d && (d.mode === "light" || d.mode === "dark")) display.mode = d.mode;
    if (d && (d.size === "s" || d.size === "l")) display.size = d.size;
  } catch (e) {}
  var applyDisplay = function () {
    if (display.mode === "auto") root.removeAttribute("data-mode"); else root.setAttribute("data-mode", display.mode);
    if (display.size === "m") root.removeAttribute("data-size"); else root.setAttribute("data-size", display.size);
    each("[data-set-mode]", function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-set-mode") === display.mode)); });
    each("[data-set-size]", function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-set-size") === display.size)); });
  };
  var saveDisplay = function () { if (store) try { store.setItem("${DISPLAY_KEY}", JSON.stringify(display)); } catch (e) {} };
  each("[data-set-mode]", function (b) { b.addEventListener("click", function () { display.mode = b.getAttribute("data-set-mode"); applyDisplay(); saveDisplay(); }); });
  each("[data-set-size]", function (b) { b.addEventListener("click", function () { display.size = b.getAttribute("data-set-size"); applyDisplay(); saveDisplay(); }); });
  applyDisplay();

  // Ce qui a été lu : { k: "p" | "img" | "chose", v }. Toujours redessiné par textContent, jamais par innerHTML.
  var log = [];
  var steps = []; // { state, n } avant chaque choix, pour revenir en arrière
  var focusAt = function (node) {
    if (!node) return;
    if (!node.hasAttribute("tabindex") && !/^(BUTTON|A)$/.test(node.tagName)) node.setAttribute("tabindex", "-1");
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  };
  var smooth = function () { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; };
  var showReader = function () { homeEl.hidden = true; readerEl.hidden = false; };
  // Fins découvertes (#124) : gardées par livre, même après « Recommencer » et d'une version à l'autre.
  var endingOf = function (id) { for (var i = 0; i < data.endings.length; i++) if (data.endings[i].id === id) return data.endings[i]; return null; };
  var endingsKey = "mondowrite-endings-" + data.book;
  var found = [];
  if (store) try {
    var f0 = JSON.parse(store.getItem(endingsKey) || "[]");
    if (Array.isArray(f0)) f0.forEach(function (id) { if (endingOf(id) && found.indexOf(id) < 0) found.push(id); });
  } catch (e) {}
  var saveFound = function () { if (store) try { store.setItem(endingsKey, JSON.stringify(found)); } catch (e) { noStore(); } };
  var countKind = function (list, kind) { var n = 0; list.forEach(function (x) { var e = typeof x === "string" ? endingOf(x) : x; if (e && e.kind === kind) n++; }); return n; };
  var foundText = function () {
    var total = data.endings.length;
    if (total < 2 || !found.length) return "";
    var text = data.texts.endingsFound.replace("{n}", String(found.length)).replace("{total}", String(total));
    var parts = [];
    [["good", data.texts.endingsGood], ["bad", data.texts.endingsBad]].forEach(function (k) {
      var all = countKind(data.endings, k[0]);
      if (all) parts.push(k[1].replace("{n}", String(countKind(found, k[0]))).replace("{total}", String(all)));
    });
    return parts.length ? text + " (" + parts.join(", ") + ")" : text;
  };
  var showHome = function () {
    var started = steps.length > 0;
    startBtn.hidden = started; continueBtn.hidden = !started; againBtn.hidden = !started;
    var ft = foundText(); foundEl.textContent = ft; foundEl.hidden = !ft;
    exportBtn.hidden = !started && !found.length;
    readerEl.hidden = true; homeEl.hidden = false;
  };

  var story;
  try { story = new inkjs.Story(read("mw-story")); } catch (e) {
    storyEl.textContent = ""; storyEl.appendChild(el("p", "failed", data.texts.failed));
    showReader(); homeBtn.hidden = true; backBtn.hidden = true; restartBtn.hidden = true;
    return;
  }
  var save = function () {
    if (!store) return;
    try { store.setItem(data.key, JSON.stringify({ state: story.state.ToJson(), log: log, steps: steps })); } catch (e) { noStore(); }
  };
  var forget = function () { if (store) try { store.removeItem(data.key); } catch (e) {} };
  // Gras et italique (#122) : marques posées à l'export, rendues en <strong> et <em>, jamais en HTML.
  var rich = function (parent, text) {
    var bold = false, italic = false, buf = "";
    var flush = function () {
      if (!buf) return;
      var node = document.createTextNode(buf); buf = "";
      if (italic) { var em = el("em"); em.appendChild(node); node = em; }
      if (bold) { var strong = el("strong"); strong.appendChild(node); node = strong; }
      parent.appendChild(node);
    };
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === "\\uE000" || c === "\\uE001") { flush(); bold = c === "\\uE000"; }
      else if (c === "\\uE002" || c === "\\uE003") { flush(); italic = c === "\\uE002"; }
      else buf += c;
    }
    flush();
    return parent;
  };
  // Un passage = un bloc (#126) : le choix fait, le texte et les images qui suivent, puis les choix proposés. Le
  // focus va sur le bloc entier : un lecteur d'écran lit tout le passage, puis les choix, sans relire la page.
  var turn = null;
  var newTurn = function () { turn = el("div", "turn"); turn.setAttribute("tabindex", "-1"); storyEl.appendChild(turn); return turn; };
  var into = function () { return turn || newTurn(); };
  var clearStory = function () { storyEl.textContent = ""; turn = null; };
  var draw = function (item) {
    if (item.k === "chose") newTurn();
    if (item.k === "img") {
      var src = srcOf(item.v);
      if (!src) return null;
      // La description passe en paragraphe (#126) : en lisant le bloc d'un passage, VoiceOver saute les images,
      // même décrites, et tout ce qui est dans un <figure> (un groupe à part). Image décorative, dans un <div>
      // simple, et description en <p> à côté d'elle, comme le texte du passage.
      var f = el("div", "illus"); var img = el("img"); img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.src = src;
      f.setAttribute("aria-hidden", "true"); f.appendChild(img);
      var alt = has(data.alts, item.v) ? String(data.alts[item.v]).trim() : "";
      var box = into(); box.appendChild(f);
      if (alt) box.appendChild(el("p", "sr", data.texts.image.replace("{alt}", alt)));
      return f;
    }
    var p = el("p", item.k === "chose" ? "chose" : null);
    if (item.k === "chose") p.textContent = String(item.v); else rich(p, String(item.v));
    into().appendChild(p); return p;
  };
  var add = function (item) { log.push(item); return draw(item); };
  var showKnown = function () {
    var parts = [];
    data.facts.forEach(function (f) {
      var v; try { v = story.variablesState.$(f.name); } catch (e) { v = undefined; }
      if (v === true) parts.push(f.label);
      else if (typeof v === "number" && v !== 0) parts.push(data.texts.value.replace("{fact}", f.label).replace("{value}", String(v)));
    });
    if (parts.length) into().appendChild(el("p", "known", data.texts.known + " " + parts.join(", ")));
  };
  var showChoices = function () {
    if (!story.currentChoices.length) {
      var end = markEnding();
      into().appendChild(el("p", "end", data.texts.end));
      if (end && end.kind) into().appendChild(el("p", "end-kind", end.kind === "good" ? data.texts.endGood : data.texts.endBad));
      var ft = foundText(); if (ft) into().appendChild(el("p", "found", ft));
      var wrap = el("p", "end-tools"); var again = el("button", null, data.texts.restart); again.type = "button";
      again.addEventListener("click", restart); wrap.appendChild(again); into().appendChild(wrap);
      return;
    }
    // Liste nommée, et pour un lecteur d'écran « Choix 1 sur 3 : » avant chaque choix (#126). Le numéro visible est
    // caché aux lecteurs d'écran : il serait lu deux fois.
    var list = el("ol", "choices"); list.setAttribute("aria-label", data.texts.choices);
    var total = story.currentChoices.length;
    story.currentChoices.forEach(function (c, i) {
      var li = el("li"); var b = el("button"); b.type = "button";
      b.appendChild(el("span", "n", (i + 1) + ".")).setAttribute("aria-hidden", "true");
      b.appendChild(el("span", "sr", data.texts.choiceOf.replace("{n}", String(i + 1)).replace("{total}", String(total)) + " "));
      b.appendChild(el("span", "label", c.text));
      b.addEventListener("click", function () { choose(i, c.text); });
      li.appendChild(b); list.appendChild(li);
    });
    into().appendChild(list);
  };
  // La fin trouvée : la scène où l'histoire s'arrête, notée par l'Ink de la page (#124).
  var markEnding = function () {
    var id; try { id = story.variablesState.$(data.sceneVar); } catch (e) { id = null; }
    var end = endingOf(id);
    if (end && found.indexOf(id) < 0) { found.push(id); saveFound(); }
    return end;
  };
  var clearTail = function () { each("#story .choices, #story .known, #story .end, #story .end-kind, #story .found, #story .end-tools", function (n) { n.remove(); }); };
  var redraw = function () {
    clearStory();
    log.forEach(draw);
    showKnown(); showChoices();
    backBtn.disabled = steps.length === 0;
  };
  var advance = function () {
    while (story.canContinue) {
      var text = (story.Continue() || "").trim();
      (story.currentTags || []).forEach(function (t) { var m = /^\\s*image:\\s*(\\S+)\\s*$/.exec(t); if (m) add({ k: "img", v: m[1] }); });
      if (text) add({ k: "p", v: text });
    }
    clearTail();
    showKnown(); showChoices();
    backBtn.disabled = steps.length === 0;
    save();
  };
  // Le passage qui commence : un lecteur d'écran lit la suite depuis là, puis les choix (#126), sans relire la page.
  var lastTurn = function () { return turn; };
  var choose = function (i, text) {
    steps.push({ state: story.state.ToJson(), n: log.length });
    clearTail();
    var chose = add({ k: "chose", v: text });
    story.ChooseChoiceIndex(i);
    advance();
    chose.scrollIntoView({ block: "start", behavior: smooth() });
    focusAt(turn);
  };
  var back = function () {
    if (!data.allowBack) return;
    var last = steps.pop(); if (!last) return;
    story.state.LoadJson(last.state);
    log = log.slice(0, last.n);
    redraw(); save();
    focusAt(turn);
  };
  var restart = function () {
    forget(); steps = []; log = []; story.ResetState(); clearStory(); advance();
    window.scrollTo(0, 0);
    focusAt(turn);
  };
  if (!data.allowBack) backBtn.hidden = true;
  backBtn.addEventListener("click", back);
  restartBtn.addEventListener("click", restart);
  // Accueil (#121) : Commencer, ou Continuer et Recommencer quand une partie est en cours.
  startBtn.addEventListener("click", function () { showReader(); window.scrollTo(0, 0); focusAt(turn); });
  continueBtn.addEventListener("click", function () {
    showReader();
    var at = lastTurn();
    if (at) { at.scrollIntoView({ block: "start" }); focusAt(at); }
  });
  againBtn.addEventListener("click", function () { showReader(); restart(); });
  homeBtn.addEventListener("click", function () { showHome(); window.scrollTo(0, 0); focusAt(continueBtn.hidden ? startBtn : continueBtn); });
  $("mw-skip").addEventListener("click", function (e) {
    e.preventDefault();
    if (readerEl.hidden) focusAt(continueBtn.hidden ? startBtn : continueBtn);
    else focusAt(storyEl.querySelector(".choices button") || lastTurn());
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || readerEl.hidden) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) { var b = storyEl.querySelectorAll(".choices button")[n - 1]; if (b) { e.preventDefault(); b.click(); } }
  });
  var cleanLog = function (list) { return list.filter(function (x) { return x && (x.k === "p" || x.k === "img" || x.k === "chose") && typeof x.v === "string"; }); };
  var cleanSteps = function (list) { return list.filter(function (s) { return s && typeof s.state === "string" && typeof s.n === "number"; }); };
  // Partie à emporter (#124) : un petit fichier, pour un navigateur qui efface ses données ou un autre appareil.
  var say = function (text) { statusEl.textContent = text; };
  exportBtn.addEventListener("click", function () {
    var file = { mondowrite: "playthrough", version: 1, book: data.book, key: data.key, state: story.state.ToJson(), log: log, steps: steps, endings: found };
    var url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
    var a = el("a"); a.href = url; a.download = data.saveName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });
  var loadSave = function (text) {
    var s; try { s = JSON.parse(text); } catch (e) { s = null; }
    if (!s || s.mondowrite !== "playthrough" || typeof s.state !== "string" || !Array.isArray(s.log) || !Array.isArray(s.steps)) return say(data.texts.importBad);
    if (s.book !== data.book) return say(data.texts.importOther);
    if (s.key !== data.key) return say(data.texts.importVersion);
    var before = story.state.ToJson();
    try { story.state.LoadJson(s.state); } catch (e) { story.state.LoadJson(before); return say(data.texts.importBad); }
    log = cleanLog(s.log); steps = cleanSteps(s.steps);
    if (Array.isArray(s.endings)) s.endings.forEach(function (id) { if (endingOf(id) && found.indexOf(id) < 0) found.push(id); });
    saveFound(); redraw(); save(); showHome();
    say(data.texts.importDone);
    focusAt(continueBtn.hidden ? startBtn : continueBtn);
  };
  importBtn.addEventListener("click", function () { say(""); fileInput.click(); });
  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > 20000000) return say(data.texts.importBad);
    var reader = new FileReader();
    reader.onload = function () { loadSave(String(reader.result)); };
    reader.onerror = function () { say(data.texts.importBad); };
    reader.readAsText(file);
  });
  // Progression gardée par le navigateur du lecteur : reprise là où il s'était arrêté.
  var saved = null;
  if (store) try { saved = JSON.parse(store.getItem(data.key) || "null"); } catch (e) { saved = null; }
  var restored = false;
  if (saved && typeof saved.state === "string" && Array.isArray(saved.log) && Array.isArray(saved.steps)) {
    try {
      story.state.LoadJson(saved.state);
      log = cleanLog(saved.log);
      steps = cleanSteps(saved.steps);
      redraw();
      restored = true;
    } catch (e) { story.ResetState(); log = []; steps = []; }
  }
  if (!restored) { clearStory(); advance(); }
  showHome();
})();`;

/** Adresse d'une image acceptée dans la page : image en `data:`, ou fichier du dossier images/ d'une archive. */
const SAFE_SOURCE = /^(data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+|images\/[a-z0-9-]+\.(webp|jpg|png))$/;

/** La page HTML complète, autonome. */
export function storyPage(input: WebPageInput): string {
  const { texts } = input;
  // Seules des adresses d'images passent (#125) : `data:` d'une image, ou fichier du dossier images/ de l'archive.
  const sources = Object.fromEntries(Object.entries(input.sources).filter(([, src]) => SAFE_SOURCE.test(src)));
  const images = Object.fromEntries(Object.entries(input.images).filter(([, file]) => Object.hasOwn(sources, file)));
  const cover = input.cover && Object.hasOwn(sources, input.cover.file) ? input.cover : undefined;
  const data = {
    key: progressKey(input.title, input.storyJson),
    book: input.book ?? bookId(input.title),
    sources,
    images,
    cover: cover?.file,
    alts: input.alts ?? {},
    facts: input.facts,
    endings: input.endings ?? [],
    allowBack: input.allowBack !== false,
    saveName: input.saveName ?? "partie.json",
    sceneVar: SCENE_VAR,
    texts: {
      restart: texts.restart,
      end: texts.end,
      known: texts.known,
      value: texts.value,
      failed: texts.failed,
      choices: texts.choices,
      choiceOf: texts.choiceOf,
      image: texts.image,
      endingsFound: texts.endingsFound,
      endingsGood: texts.endingsGood,
      endingsBad: texts.endingsBad,
      endGood: texts.endGood,
      endBad: texts.endBad,
      importDone: texts.importDone,
      importOther: texts.importOther,
      importVersion: texts.importVersion,
      importBad: texts.importBad,
    },
  };
  const license = input.runtimeLicense.replace(/\*\//g, "* /").trim();
  const e = escapeHtml;
  const custom = input.customCss?.trim() ? `<style id="mw-custom">\n${safeCss(input.customCss)}\n</style>\n` : "";
  const modes: [string, string][] = [
    ["auto", texts.modeAuto],
    ["light", texts.modeLight],
    ["dark", texts.modeDark],
  ];
  const sizes: [string, string][] = [
    ["s", texts.sizeSmall],
    ["m", texts.sizeMedium],
    ["l", texts.sizeLarge],
  ];
  return (
    `<!DOCTYPE html>\n<html lang="${e(input.lang)}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
    `<meta name="generator" content="MondoWrite">\n<title>${e(input.title)}</title>\n` +
    `<style>\n${themeCss(input.theme ?? "classique")}${CSS}</style>\n${custom}` +
    `<script>${EARLY}</script>\n</head>\n<body>\n` +
    `<a class="skip" id="mw-skip" href="#mw-main">${e(texts.skip)}</a>\n` +
    `<div class="display" role="group" aria-label="${e(texts.display)}">\n` +
    `<div class="seg" role="group" aria-label="${e(texts.theme)}">${modes.map(([k, label]) => `<button type="button" data-set-mode="${k}" aria-pressed="${k === "auto"}">${e(label)}</button>`).join("")}</div>\n` +
    `<div class="seg" role="group" aria-label="${e(texts.textSize)}">${sizes.map(([k, label]) => `<button type="button" data-set-size="${k}" aria-pressed="${k === "m"}" aria-label="${e(label)}"><span class="size-${k}" aria-hidden="true">A</span></button>`).join("")}</div>\n` +
    `</div>\n<main id="mw-main" tabindex="-1">\n` +
    `<section id="mw-home" class="home" aria-labelledby="mw-title">\n` +
    (cover ? `<figure class="cover"><img id="mw-cover" alt="${e(cover.alt)}"></figure>\n` : "") +
    `<h1 id="mw-title">${e(input.title)}</h1>\n` +
    (input.author ? `<p class="author">${e(input.author)}</p>\n` : "") +
    (input.tagline?.trim() ? `<p class="tagline">${e(input.tagline.trim())}</p>\n` : "") +
    `<div class="home-actions">\n<button type="button" class="primary" id="mw-start">${e(texts.start)}</button>\n` +
    `<button type="button" class="primary" id="mw-continue" hidden>${e(texts.continue)}</button>\n` +
    `<button type="button" id="mw-again" hidden>${e(texts.restart)}</button>\n</div>\n` +
    `<p class="home-found" id="mw-found" hidden></p>\n` +
    `<div class="home-more">\n<button type="button" id="mw-export" hidden>${e(texts.exportSave)}</button>\n<button type="button" id="mw-import">${e(texts.importSave)}</button>\n` +
    `<input type="file" id="mw-file" accept=".json,application/json" hidden>\n</div>\n` +
    `<p class="home-note" id="mw-status" role="status"></p>\n<p class="home-note" id="mw-nostore" hidden>${e(texts.noStorage)}</p>\n` +
    `<noscript><p class="failed">${e(texts.noScript)}</p></noscript>\n</section>\n` +
    `<section id="mw-reader" aria-label="${e(input.title)}" hidden>\n` +
    `<div class="tools">\n<button type="button" id="mw-home-btn">${e(texts.home)}</button>\n<button type="button" id="mw-back" disabled>${e(texts.back)}</button>\n<button type="button" id="mw-restart">${e(texts.restart)}</button>\n</div>\n` +
    `<div id="story"></div>\n</section>\n` +
    `<footer><a href="https://mondowrite.app">${e(texts.madeWith)}</a></footer>\n</main>\n` +
    `<script type="application/json" id="mw-story">${jsonForScript(JSON.parse(input.storyJson))}</script>\n` +
    `<script type="application/json" id="mw-data">${jsonForScript(data)}</script>\n` +
    `<script>\n/*! inkjs, ${license.split("\n").join("\n * ")} */\n${scriptSafe(input.runtime)}\n</script>\n` +
    `<script>\n${PLAYER}\n</script>\n</body>\n</html>\n`
  );
}
