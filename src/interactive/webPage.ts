// Roman interactif, lot 7 : l'histoire en une seule page web jouable, sans serveur ni connexion.
// La page porte l'histoire compilée (JSON d'Ink), le moteur d'inkjs (MIT, sa licence recopiée dans la page),
// les images en `data:` et un petit lecteur écrit ici. Tout le texte de l'histoire passe par `textContent`,
// jamais par `innerHTML`. Fonctions pures : le moteur et l'histoire compilée sont reçus en paramètres.

import { isMediaName } from "../media";
import { IMAGE_TAG, type InkSource } from "./ink";
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
}

export interface WebPageInput {
  title: string;
  author?: string;
  /** Accroche de la couverture du projet (`pitch.tagline`), si elle est remplie (#121). */
  tagline?: string;
  /** Couverture du projet en adresse `data:`, et son texte alternatif (#121). */
  cover?: { src: string; alt: string };
  lang: string;
  /** Histoire compilée (`story.ToJson()`). */
  storyJson: string;
  /** Moteur d'inkjs (dist/ink.js), tel que publié. */
  runtime: string;
  /** Licence du moteur, recopiée dans la page (MIT). */
  runtimeLicense: string;
  /** Images par nom de fichier de medias/, en adresse `data:`. */
  images: Readonly<Record<string, string>>;
  /** Description de chaque image, telle qu'écrite dans le texte (#126). Absente : image décorative. */
  alts?: Readonly<Record<string, string>>;
  /** Faits montrés au lecteur : nom de la variable Ink et libellé. */
  facts: readonly { name: string; label: string }[];
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

/** Clé de la progression gardée par le navigateur du lecteur : propre au titre et à l'histoire. */
export function progressKey(title: string, storyJson: string): string {
  let h = 2166136261;
  for (const text of [title, storyJson]) for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return `mondowrite-story-${h.toString(36)}`;
}

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
button { font: inherit; font-size: 1rem; color: inherit; background: none; border: 1px solid var(--rule); border-radius: var(--radius); padding: 0.55em 1em; min-height: 44px; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-size: 1.125rem; padding: 0.6em 1.6em; }
button:disabled { opacity: 0.45; cursor: default; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
#story .turn:focus { outline: none; }
@media (any-hover: hover) { button:not(:disabled):hover { border-color: var(--accent); } }
.tools { display: flex; gap: 0.5em; justify-content: center; flex-wrap: wrap; margin: 0 0 2.5em; }
#story p { margin: 0 0 0.9em; }
#story figure { margin: 1.5em 0; text-align: center; }
#story img { max-width: 100%; height: auto; }
.chose { margin: 2em 0 1em; color: var(--soft); font-style: italic; }
.chose::before { content: "\\2192\\00a0"; }
ol.choices { list-style: none; padding: 0; margin: 2em 0; display: grid; gap: 0.6em; }
ol.choices button { width: 100%; text-align: left; border-color: var(--accent); }
ol.choices .n { color: var(--soft); margin-right: 0.35em; }
.known { margin: 2em 0 0; padding-top: 0.75em; border-top: 1px solid var(--rule); color: var(--soft); font-size: 0.95em; }
.end { margin: 2.5em 0 1em; text-align: center; font-style: italic; }
.end-tools { text-align: center; }
footer { margin-top: 4em; text-align: center; font-size: 0.85em; color: var(--soft); }
footer a { color: inherit; }
.failed { color: var(--soft); text-align: center; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print { .skip, .display, .tools, .home-actions, ol.choices, footer { display: none; } #mw-reader[hidden] { display: block !important; } }
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
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var each = function (sel, fn) { var list = document.querySelectorAll(sel); for (var i = 0; i < list.length; i++) fn(list[i]); };
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }

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
  var showHome = function () {
    var started = steps.length > 0;
    startBtn.hidden = started; continueBtn.hidden = !started; againBtn.hidden = !started;
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
    try { store.setItem(data.key, JSON.stringify({ state: story.state.ToJson(), log: log, steps: steps })); } catch (e) {}
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
      var src = has(data.images, item.v) ? data.images[item.v] : null;
      if (!src) return null;
      var f = el("figure"); var img = el("img"); img.src = src; img.alt = has(data.alts, item.v) ? String(data.alts[item.v]) : "";
      f.appendChild(img); into().appendChild(f); return f;
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
      into().appendChild(el("p", "end", data.texts.end));
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
  var clearTail = function () { each("#story .choices, #story .known, #story .end, #story .end-tools", function (n) { n.remove(); }); };
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
  // Progression gardée par le navigateur du lecteur : reprise là où il s'était arrêté.
  var saved = null;
  if (store) try { saved = JSON.parse(store.getItem(data.key) || "null"); } catch (e) { saved = null; }
  var restored = false;
  if (saved && typeof saved.state === "string" && Array.isArray(saved.log) && Array.isArray(saved.steps)) {
    try {
      story.state.LoadJson(saved.state);
      log = saved.log.filter(function (x) { return x && (x.k === "p" || x.k === "img" || x.k === "chose") && typeof x.v === "string"; });
      steps = saved.steps.filter(function (s) { return s && typeof s.state === "string" && typeof s.n === "number"; });
      redraw();
      restored = true;
    } catch (e) { story.ResetState(); log = []; steps = []; }
  }
  if (!restored) { clearStory(); advance(); }
  showHome();
})();`;

/** La page HTML complète, autonome. */
export function storyPage(input: WebPageInput): string {
  const { texts } = input;
  const data = {
    key: progressKey(input.title, input.storyJson),
    images: input.images,
    alts: input.alts ?? {},
    facts: input.facts,
    texts: { restart: texts.restart, end: texts.end, known: texts.known, value: texts.value, failed: texts.failed, choices: texts.choices, choiceOf: texts.choiceOf },
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
  const cover = input.cover && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(input.cover.src) ? input.cover : undefined;
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
    (cover ? `<figure class="cover"><img src="${cover.src}" alt="${e(cover.alt)}"></figure>\n` : "") +
    `<h1 id="mw-title">${e(input.title)}</h1>\n` +
    (input.author ? `<p class="author">${e(input.author)}</p>\n` : "") +
    (input.tagline?.trim() ? `<p class="tagline">${e(input.tagline.trim())}</p>\n` : "") +
    `<div class="home-actions">\n<button type="button" class="primary" id="mw-start">${e(texts.start)}</button>\n` +
    `<button type="button" class="primary" id="mw-continue" hidden>${e(texts.continue)}</button>\n` +
    `<button type="button" id="mw-again" hidden>${e(texts.restart)}</button>\n</div>\n` +
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
