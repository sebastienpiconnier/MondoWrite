// Roman interactif, lot 7 : l'histoire en une seule page web jouable, sans serveur ni connexion.
// La page porte l'histoire compilée (JSON d'Ink), le moteur d'inkjs (MIT, sa licence recopiée dans la page),
// les images en `data:` et un petit lecteur écrit ici. Tout le texte de l'histoire passe par `textContent`,
// jamais par `innerHTML`. Fonctions pures : le moteur et l'histoire compilée sont reçus en paramètres.

import { isMediaName } from "../media";
import { IMAGE_TAG, type InkSource } from "./ink";

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
}

export interface WebPageInput {
  title: string;
  author?: string;
  lang: string;
  /** Histoire compilée (`story.ToJson()`). */
  storyJson: string;
  /** Moteur d'inkjs (dist/ink.js), tel que publié. */
  runtime: string;
  /** Licence du moteur, recopiée dans la page (MIT). */
  runtimeLicense: string;
  /** Images par nom de fichier de medias/, en adresse `data:`. */
  images: Readonly<Record<string, string>>;
  /** Faits montrés au lecteur : nom de la variable Ink et libellé. */
  facts: readonly { name: string; label: string }[];
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

const CSS = `:root { color-scheme: light dark; --ink: #1f2128; --soft: #5b5f6b; --rule: #d6d8de; --paper: #fdfcf9; --accent: #2f5fb3; --accent-ink: #ffffff; }
@media (prefers-color-scheme: dark) { :root { --ink: #d4d6de; --soft: #a3a7b3; --rule: #3a3e4c; --paper: #181a22; --accent: #8fb1ee; --accent-ink: #10131a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 1.125rem/1.65 Georgia, "Iowan Old Style", "Times New Roman", serif; }
main { max-width: 38em; margin: 0 auto; padding: 2.5em 1.25em 6em; }
header.cover { text-align: center; margin: 2em 0 3em; }
header.cover h1 { font-size: 2em; line-height: 1.2; margin: 0 0 0.4em; }
header.cover p { margin: 0; color: var(--soft); }
.tools { display: flex; gap: 0.5em; justify-content: center; flex-wrap: wrap; margin: 0 0 2.5em; }
button { font: inherit; font-size: 1rem; color: inherit; background: none; border: 1px solid var(--rule); border-radius: 8px; padding: 0.55em 1em; min-height: 44px; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
@media (any-hover: hover) { button:not(:disabled):hover { border-color: var(--accent); } }
#story p { margin: 0 0 0.9em; }
#story figure { margin: 1.5em 0; text-align: center; }
#story img { max-width: 100%; height: auto; }
.chose { margin: 2em 0 1em; color: var(--soft); font-style: italic; }
.chose::before { content: "→ "; }
ol.choices { list-style: none; padding: 0; margin: 2em 0; display: grid; gap: 0.6em; }
ol.choices button { width: 100%; text-align: left; border-color: var(--accent); }
ol.choices button::before { content: attr(data-n) ". "; color: var(--soft); }
.known { margin: 2em 0 0; padding-top: 0.75em; border-top: 1px solid var(--rule); color: var(--soft); font-size: 0.95em; }
.end { margin: 2.5em 0 1em; text-align: center; font-style: italic; }
.end-tools { text-align: center; }
footer { margin-top: 4em; text-align: center; font-size: 0.85em; color: var(--soft); }
footer a { color: inherit; }
.failed { color: var(--soft); text-align: center; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print { .tools, ol.choices, footer { display: none; } }
`;

// Lecteur de la page (JavaScript ordinaire, sans dépendance hors du moteur d'inkjs).
const PLAYER = `(function () {
  var read = function (id) { return JSON.parse(document.getElementById(id).textContent); };
  var data = read("mw-data");
  var storyEl = document.getElementById("story");
  var backBtn = document.getElementById("mw-back");
  var restartBtn = document.getElementById("mw-restart");
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var story;
  try { story = new inkjs.Story(read("mw-story")); } catch (e) {
    storyEl.textContent = ""; storyEl.appendChild(el("p", "failed", data.texts.failed));
    return;
  }
  // Ce qui a été lu : { k: "p" | "img" | "chose", v }. Toujours redessiné par textContent, jamais par innerHTML.
  var log = [];
  var steps = []; // { state, n } avant chaque choix, pour revenir en arrière
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  var save = function () {
    if (!store) return;
    try { store.setItem(data.key, JSON.stringify({ state: story.state.ToJson(), log: log, steps: steps })); } catch (e) {}
  };
  var forget = function () { if (store) try { store.removeItem(data.key); } catch (e) {} };
  var draw = function (item) {
    if (item.k === "img") {
      var src = Object.prototype.hasOwnProperty.call(data.images, item.v) ? data.images[item.v] : null;
      if (!src) return null;
      var f = el("figure"); var img = el("img"); img.src = src; img.alt = ""; f.appendChild(img); storyEl.appendChild(f); return f;
    }
    var p = el("p", item.k === "chose" ? "chose" : null, String(item.v)); storyEl.appendChild(p); return p;
  };
  var add = function (item) { log.push(item); return draw(item); };
  var showKnown = function () {
    var parts = [];
    data.facts.forEach(function (f) {
      var v; try { v = story.variablesState.$(f.name); } catch (e) { v = undefined; }
      if (v === true) parts.push(f.label);
      else if (typeof v === "number" && v !== 0) parts.push(data.texts.value.replace("{fact}", f.label).replace("{value}", String(v)));
    });
    if (parts.length) storyEl.appendChild(el("p", "known", data.texts.known + " " + parts.join(", ")));
  };
  var showChoices = function () {
    if (!story.currentChoices.length) {
      storyEl.appendChild(el("p", "end", data.texts.end));
      var wrap = el("p", "end-tools"); var again = el("button", null, data.texts.restart); again.type = "button";
      again.addEventListener("click", restart); wrap.appendChild(again); storyEl.appendChild(wrap);
      return;
    }
    var list = el("ol", "choices");
    story.currentChoices.forEach(function (c, i) {
      var li = el("li"); var b = el("button", null, c.text); b.type = "button"; b.setAttribute("data-n", String(i + 1));
      b.addEventListener("click", function () { choose(i, c.text); });
      li.appendChild(b); list.appendChild(li);
    });
    storyEl.appendChild(list);
  };
  var redraw = function () {
    storyEl.textContent = "";
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
    var tail = storyEl.querySelectorAll(".choices, .known, .end, .end-tools");
    for (var i = 0; i < tail.length; i++) tail[i].remove();
    showKnown(); showChoices();
    backBtn.disabled = steps.length === 0;
    save();
  };
  var choose = function (i, text) {
    steps.push({ state: story.state.ToJson(), n: log.length });
    var tail = storyEl.querySelectorAll(".choices, .known, .end, .end-tools");
    for (var j = 0; j < tail.length; j++) tail[j].remove();
    var chose = add({ k: "chose", v: text });
    story.ChooseChoiceIndex(i);
    advance();
    chose.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    var next = storyEl.querySelector(".choices button"); if (next) next.focus({ preventScroll: true });
  };
  var back = function () {
    var last = steps.pop(); if (!last) return;
    story.state.LoadJson(last.state);
    log = log.slice(0, last.n);
    redraw(); save();
    var next = storyEl.querySelector(".choices button"); if (next) next.focus();
  };
  var restart = function () {
    forget(); steps = []; log = []; story.ResetState(); storyEl.textContent = ""; advance();
    window.scrollTo(0, 0);
  };
  backBtn.addEventListener("click", back);
  restartBtn.addEventListener("click", restart);
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) { var b = storyEl.querySelectorAll(".choices button")[n - 1]; if (b) { e.preventDefault(); b.click(); } }
  });
  // Progression gardée par le navigateur du lecteur : reprise là où il s'était arrêté.
  var saved = null;
  if (store) try { saved = JSON.parse(store.getItem(data.key) || "null"); } catch (e) { saved = null; }
  if (saved && typeof saved.state === "string" && Array.isArray(saved.log) && Array.isArray(saved.steps)) {
    try {
      story.state.LoadJson(saved.state);
      log = saved.log.filter(function (x) { return x && (x.k === "p" || x.k === "img" || x.k === "chose") && typeof x.v === "string"; });
      steps = saved.steps.filter(function (s) { return s && typeof s.state === "string" && typeof s.n === "number"; });
      redraw();
      return;
    } catch (e) { story.ResetState(); log = []; steps = []; }
  }
  storyEl.textContent = "";
  advance();
})();`;

/** La page HTML complète, autonome. */
export function storyPage(input: WebPageInput): string {
  const { texts } = input;
  const data = {
    key: progressKey(input.title, input.storyJson),
    images: input.images,
    facts: input.facts,
    texts: { restart: texts.restart, end: texts.end, known: texts.known, value: texts.value, failed: texts.failed },
  };
  const license = input.runtimeLicense.replace(/\*\//g, "* /").trim();
  return (
    `<!DOCTYPE html>\n<html lang="${escapeHtml(input.lang)}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<meta name="generator" content="MondoWrite">\n<title>${escapeHtml(input.title)}</title>\n<style>\n${CSS}</style>\n</head>\n<body>\n<main>\n` +
    `<header class="cover">\n<h1>${escapeHtml(input.title)}</h1>\n${input.author ? `<p>${escapeHtml(input.author)}</p>\n` : ""}</header>\n` +
    `<div class="tools">\n<button type="button" id="mw-back" disabled>${escapeHtml(texts.back)}</button>\n<button type="button" id="mw-restart">${escapeHtml(texts.restart)}</button>\n</div>\n` +
    `<div id="story" aria-live="polite"><noscript><p class="failed">${escapeHtml(texts.noScript)}</p></noscript></div>\n` +
    `<footer><a href="https://mondowrite.app">${escapeHtml(texts.madeWith)}</a></footer>\n</main>\n` +
    `<script type="application/json" id="mw-story">${jsonForScript(JSON.parse(input.storyJson))}</script>\n` +
    `<script type="application/json" id="mw-data">${jsonForScript(data)}</script>\n` +
    `<script>\n/*! inkjs, ${license.split("\n").join("\n * ")} */\n${scriptSafe(input.runtime)}\n</script>\n` +
    `<script>\n${PLAYER}\n</script>\n</body>\n</html>\n`
  );
}
