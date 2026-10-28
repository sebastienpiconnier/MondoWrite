// Captures d'écran du guide (docs/guide/images/<langue>/), prises sur le projet d'exemple et sur un court
// scénario importé (docs/guide/exemples/). Il faut l'app servie sur http://localhost:4319 :
//   npm run build && npx vite preview --port 4319
// puis : node scripts/guide/shots.mjs fr   (ou en)

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const LANG = process.argv[2] || "fr";
const FR = LANG === "fr";
const T = (fr, en) => (FR ? fr : en);
const root = resolve(import.meta.dirname, "../..");
const OUT = join(root, "docs/guide/images", LANG);
const SAMPLE = join(root, "docs/guide/exemples", FR ? "chaperon.fountain" : "chaperon.en.fountain");
const URL = process.env.GUIDE_URL || "http://localhost:4319/";
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
mkdirSync(OUT, { recursive: true });

// Chromium : celui indiqué par CHROMIUM, sinon le Google Chrome installé sur la machine.
const browser = await chromium.launch(
  process.env.CHROMIUM
    ? { executablePath: process.env.CHROMIUM, args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] }
    : { channel: "chrome" },
);
let page;
async function open(o = {}) {
  page = await browser.newPage({ viewport: o.viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: o.scale ?? 1.5, locale: FR ? "fr-FR" : "en-US", colorScheme: o.scheme ?? "light", hasTouch: !!o.touch, isMobile: !!o.mobile, acceptDownloads: true });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
}
const wait = (ms) => page.waitForTimeout(ms);
async function shot(name, o = {}) {
  if (only && !only.has(name)) return;
  await wait(o.wait ?? 350);
  const opts = { path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82 };
  if (o.el) await page.locator(o.el).first().screenshot(opts);
  else if (o.clip) await page.screenshot({ ...opts, clip: o.clip });
  else await page.screenshot(opts);
  console.log("shot", name);
}
async function union(sels, pad = 24) {
  const boxes = [];
  for (const s of sels) {
    const loc = typeof s === "string" ? page.locator(s).first() : s;
    const b = await loc.boundingBox({ timeout: 3000 }).catch(() => null);
    if (b) boxes.push(b);
  }
  const vp = page.viewportSize();
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad), y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
async function scrollToText(text, offset = 70) {
  return page.evaluate(([t, off]) => {
    const all = [...document.querySelectorAll("article, section, li, div")].filter((a) => a.textContent.includes(t));
    const el = all.filter((a) => !all.some((b) => b !== a && a.contains(b))).pop();
    if (!el) return false;
    const target = el.closest("article") ?? el;
    let p = target.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    const scroller = p ?? document.scrollingElement;
    scroller.scrollTop = Math.max(0, target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - off);
    return true;
  }, [text, offset]);
}
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log("ÉCHEC", name, e.message.split("\n").slice(0, 3).join(" | ")); } };
const view = async (v) => { await page.locator("nav button, [aria-label] button", { hasText: v }).first().click(); await wait(1000); };
// Les fenêtres d'export ont leur propre « Fermer », à côté du bouton d'export.
const closeDialog = () => page.locator("dialog[open] .app-dialog-actions button, dialog[open] .spdf-close, dialog[open] .paperback-row button:not(.is-primary)").first().click();
const bg = async () => { await page.mouse.click(900, 200); await wait(200); };
// Zoom au pincement (molette + Ctrl) : la molette seule déplace le canevas.
async function zoomAt(x, y, steps) {
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await wait(500);
}
// Amène une carte en haut à gauche du canevas, puis zoome sur elle (son coin reste en place).
async function zoomOnCard(text, steps = 2) {
  const box = await node(text).boundingBox();
  if (!box) return;
  await page.mouse.move(700, 500);
  await page.mouse.wheel(box.x - 40, box.y - 130);
  await wait(400);
  await zoomAt(40, 130, steps);
}
const fit = async () => { await page.getByRole("button", { name: "Fit View" }).click(); await wait(400); };
const node = (text) => page.locator(".react-flow__node", { hasText: text }).first();
async function cardButton(text, label) { const n = node(text); await n.hover(); await n.getByRole("button", { name: label }).click(); }

async function startExample(profile = true) {
  await page.goto(URL);
  await wait(600);
  if (profile) {
    await page.getByLabel(T("Prénom", "First name"), { exact: true }).fill("Charles");
    await page.getByLabel(T("Nom", "Last name"), { exact: true }).fill("Perrault");
    await page.getByLabel(T("Courriel", "Email")).fill(T("charles.perrault@exemple.fr", "charles.perrault@example.com"));
    await page.locator(".home-create", { hasText: T("Enregistrer", "Save") }).click();
  }
  await page.locator(".ghost-button", { hasText: T("Essayer avec un exemple", "Try with an example") }).click();
  await wait(1500);
}
async function closeTour() {
  const b = page.getByRole("button", { name: T("Fermer la visite", "Close the tour") });
  if (await b.count()) await b.click();
  await wait(300);
}

// Textes du projet d'exemple, dans la langue de l'interface.
const D = {
  wolf: T("Compère le Loup", "Old Father Wolf"),
  idea: T("Et si on racontait", "What if we told"),
  meeting: T("La rencontre dans le bois", "The meeting in the woods"),
  mother: T("Elle a cuit des galettes", "She has baked cakes"),
  grandma: T("Elle est malade et garde le lit", "She is ill and keeps to her bed"),
  newTitle: T("Le bûcheron", "The woodcutter"),
  newBody: T("Il coupe du bois avec son frère. Il a vu passer ", "He chops wood with his brother. He saw "),
  mention: T("@Lou", "@The Wo"),
  after: T(" ce matin.", " this morning."),
  search: T("galette", "cake"),
  find: T("Mère-grand", "Grandmother"),
  repl: T("grand-mère", "Granny"),
  lastLine: T("C'est pour te manger.", "All the better to eat you with."),
};

// ---------------------------------------------------------------------------------------------------
// Accueil, visite, canevas
await open();
await page.goto(URL);
await wait(800);
await shot("accueil-vide");
await startExample();
await shot("visite");
await closeTour();
await shot("canevas");

await step("cartes", async () => {
  await page.mouse.move(1300, 720);
  await page.mouse.wheel(0, -500);
  await wait(500);
  await page.mouse.dblclick(1080, 230);
  await wait(700);
  await page.keyboard.type(D.newTitle);
  await page.evaluate(() => document.activeElement.closest(".react-flow__node").setAttribute("data-shot", "new"));
  await wait(400);
  await page.keyboard.press("Enter");
  await wait(400);
  await page.keyboard.type("/");
  await wait(400);
  const n = page.locator("[data-shot=new]");
  await shot("carte-type", { clip: await union([n, "[role=menu], [role=listbox]"]) });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(D.newBody);
  await page.keyboard.type(D.mention);
  await wait(400);
  await shot("carte-mention", { clip: await union([n, "[role=listbox], .suggestion-menu"]) });
  await page.keyboard.press("Enter");
  await page.keyboard.type(D.after);
  await page.mouse.click(1000, 120);
  await wait(400);
  await shot("carte-mention-faite", { clip: await union([n], 60) });
  await fit();
});
await step("nouvelle carte", async () => {
  await page.locator(".add-card-main").click();
  await wait(300);
  await shot("nouvelle-carte-menu", { clip: await union([".add-card-main", "[role=menu]"]) });
  await page.keyboard.press("Escape");
});
await step("fils", async () => {
  await zoomOnCard(T("La plus jolie petite fille", "The prettiest little girl"));
  await shot("canevas-fils", { clip: { x: 0, y: 70, width: 1200, height: 700 } });
  await fit();
});
await step("fils masqués", async () => {
  await page.getByRole("button", { name: T("Masquer les fils", "Hide threads") }).click();
  await wait(300);
  // La carte du personnage (son nom figure aussi dans d'autres cartes) : celle dont le titre est exactement ce nom.
  const name = T("Le Petit Chaperon rouge", "Little Red Riding Hood");
  const id = await page.evaluate((n) => [...document.querySelectorAll(".react-flow__node")].find((el) => [...el.querySelectorAll("textarea, input")].some((f) => f.value.trim() === n))?.getAttribute("data-id"), name);
  await page.locator(`.react-flow__node[data-id="${id}"] .card-links-toggle`).click();
  await zoomOnCard(T("La plus jolie petite fille", "The prettiest little girl"));
  await shot("fils-masques", { clip: { x: 0, y: 70, width: 1200, height: 700 } });
  await page.getByRole("button", { name: T("Masquer les fils", "Hide threads") }).click();
  await fit();
});
await step("menu carte", async () => {
  const n = node(D.wolf);
  await n.hover();
  await n.getByRole("button", { name: T("Plus d’actions", "More actions") }).click();
  await wait(300);
  await shot("carte-menu", { clip: await union([n, page.locator("[role=menu]").first()]) });
  await page.keyboard.press("Escape");
  await bg();
});
await step("filtre", async () => {
  const b = page.getByRole("button", { name: T("Filtrer les cartes", "Filter cards") });
  await b.click();
  await wait(300);
  await shot("filtre", { clip: await union([page.locator(".filter-panel, [role=dialog], [role=group]").last(), b], 30) });
  await page.keyboard.press("Escape");
});
await step("sélection et cadre", async () => {
  await page.keyboard.down("Shift");
  await page.mouse.move(120, 150);
  await page.mouse.down();
  await page.mouse.move(640, 430, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await wait(400);
  await shot("selection");
  await page.keyboard.press("c");
  await wait(600);
  await page.locator(`[aria-label='${T("Nom du cadre", "Frame name")}']`).first().fill(T("La famille", "The family"), { force: true });
  await bg();
  await shot("cadre", { clip: await union([page.locator(".react-flow__node-frame").first()], 30) });
});
await step("organiser", async () => {
  await page.getByRole("button", { name: T("Organiser le canevas", "Organize the canvas") }).click();
  await wait(900);
  await fit();
  await shot("organiser");
  await page.keyboard.press("Control+z");
  await wait(600);
  await fit();
});
await step("recherche", async () => {
  await page.keyboard.press("Control+f");
  await wait(300);
  await page.keyboard.type(D.search);
  await wait(500);
  await shot("recherche");
  // Le premier résultat choisi : la carte est mise en avant sur le canevas.
  await page.locator(".search-result").first().click();
  await wait(900);
  await shot("mise-en-avant");
  await page.keyboard.press("Escape");
  await wait(300);
  // La recherche a recentré la vue sur la carte : on revoit tout le canevas.
  await fit();
});
await step("cartes agrandies", async () => {
  await cardButton(D.meeting, T("Agrandir la carte", "Expand card"));
  await wait(800);
  await shot("carte-agrandie-scene");
  await closeDialog();
  await wait(300);
  await cardButton(D.mother, T("Agrandir la carte", "Expand card"));
  await wait(800);
  await shot("carte-agrandie-personnage", { el: "dialog[open]" });
  await closeDialog();
  await wait(300);
});
await step("à faire", async () => {
  await page.getByRole("button", { name: T(/À faire/, /To do/) }).click();
  await wait(400);
  await shot("a-faire", { clip: { x: 640, y: 0, width: 800, height: 600 } });
  await page.keyboard.press("Escape");
});
await step("corbeille", async () => {
  await cardButton(D.idea, T("Supprimer la carte", "Delete card"));
  await wait(400);
  await shot("corbeille-message", { clip: { x: 0, y: 600, width: 1440, height: 300 } });
  await page.getByRole("button", { name: T("Réglages", "Settings") }).click();
  await page.getByRole("button", { name: T(/Corbeille \(/, /Trash \(/) }).click();
  await wait(500);
  await shot("corbeille", { el: "dialog[open]" });
  await closeDialog();
});
await step("photos", async () => {
  await page.locator(".add-card-main").click();
  await page.getByRole("menuitem", { name: /Image/ }).first().click();
  await wait(800);
  await shot("photos", { el: "dialog[open]" });
  await closeDialog();
});
await page.getByRole("button", { name: T("Projets", "Projects") }).click();
await wait(800);
await shot("accueil");
await page.close();

// ---------------------------------------------------------------------------------------------------
// Bible, Plan, Manuscrit, exports, réglages
await open();
await startExample();
await closeTour();
await view("Bible");
await shot("bible-couverture");
await step("personnage", async () => {
  await page.getByRole("button", { name: T(/^Personnages/, /^Characters/) }).click();
  await wait(900);
  await scrollToText(D.grandma, 20);
  await wait(400);
  await shot("bible-personnage");
});
await step("assistant", async () => {
  await page.getByRole("button", { name: T(/^Personnages/, /^Characters/) }).click();
  await wait(600);
  await page.getByRole("button", { name: T(/Questionner/, /Ask about/) }).first().click();
  await wait(600);
  await page.locator(".assistant, .character-assistant").first().scrollIntoViewIfNeeded();
  await wait(300);
  await shot("bible-assistant");
});
await step("relations", async () => {
  await page.getByRole("button", { name: T(/^Personnages/, /^Characters/) }).click();
  await wait(500);
  await page.getByRole("button", { name: T("Relations", "Relationships"), exact: true }).first().click();
  await wait(800);
  await shot("bible-relations");
  await page.getByRole("button", { name: T("Fiches", "Sheets"), exact: true }).first().click();
});
await step("lieux", async () => {
  await page.getByRole("button", { name: T(/Univers|^Lieux/, /World|^Places/) }).click();
  await wait(800);
  await shot("bible-lieux");
});
// Lot 7 : une carte Secret, sa fiche remplie (rubrique Secrets de la Structure).
await step("secret", async () => {
  await page.getByRole("button", { name: T(/^Secrets/, /^Secrets/) }).first().click();
  await wait(600);
  await page.getByRole("button", { name: T("Nouvelle fiche : Secret", "New entry: Secret") }).first().click();
  await wait(600);
  await page.keyboard.type(T("Le Loup connaît la Mère-grand", "The Wolf knows Grandmother"));
  await page.keyboard.press("Enter");
  // Fiche vide : repliée, on l'ouvre.
  // Le titre d'une fiche est une zone de texte (il passe à la ligne) : on la reconnaît à sa valeur.
  const title = T("Le Loup connaît la Mère-grand", "The Wolf knows Grandmother");
  const id = await page.locator("textarea.bible-title").evaluateAll((els, t) => els.find((el) => el.value === t)?.getAttribute("data-card"), title);
  const entry = page.locator(`.bible-entry[data-entry="${id}"]`);
  await entry.locator(".sheet-toggle").first().click();
  await wait(300);
  const fill = async (label, text) => {
    await entry.getByLabel(label, { exact: true }).first().fill(text);
    await wait(150);
  };
  await fill(T("La vérité", "The truth"), T("Ils se sont croisés jadis, quand elle chassait au bois.", "They met long ago, when she hunted in the woods."));
  await fill(T("Enjeu", "Stakes"), T("L’enfant croirait-elle encore sa Mère-grand ?", "Would the child still trust her grandmother?"));
  await fill(T("Quand et comment il éclate", "When and how it comes out"), T("Dans le lit, par une phrase de trop du Loup.", "In the bed, when the Wolf says one word too many."));
  await entry.getByLabel(T("Certitude", "Certainty"), { exact: true }).first().selectOption("provisoire");
  await wait(400);
  await entry.scrollIntoViewIfNeeded();
  await shot("bible-secret");
});
await step("rubriques", async () => {
  await page.getByRole("button", { name: T("Choisir et ranger les rubriques", "Choose and order sections") }).click();
  await wait(400);
  await shot("bible-rubriques", { clip: { x: 0, y: 64, width: 520, height: 836 } });
  await page.getByRole("button", { name: T("Terminé", "Done") }).click();
});
await view(T("Plan", "Outline"));
await shot("plan-liste");
await step("plan", async () => {
  const sel = page.locator("select").first();
  await sel.selectOption({ label: "Save the Cat" });
  await wait(800);
  await shot("plan-gabarit");
  await sel.selectOption("cercleHarmon");
  await wait(800);
  await shot("plan-cercle", { clip: await union([".story-circle"], 24) });
  // L'éditeur de « Mes gabarits », prérempli avec les cases en place.
  await sel.selectOption({ label: T("Trois actes", "Three acts") });
  await wait(500);
  await sel.selectOption("__new");
  await wait(600);
  await shot("gabarit-editeur", { clip: await union(["dialog[open]"], 16) });
  await page.keyboard.press("Escape");
  await wait(300);
  await sel.selectOption({ label: T("Trois actes", "Three acts") });
  await wait(600);
  await page.getByRole("button", { name: T("Fiches", "Index cards"), exact: true }).click();
  await wait(800);
  await shot("plan-fiches");
  await page.getByRole("button", { name: T("Chronologie", "Timeline"), exact: true }).click();
  await wait(800);
  await shot("plan-chronologie");
  await page.getByRole("button", { name: T("Liste", "List"), exact: true }).click();
});
await view(T("Manuscrit", "Manuscript"));
await shot("manuscrit");
await step("ruban", async () => {
  await page.getByRole("button", { name: T("Voir les intrigues", "Show plotlines") }).click();
  await wait(500);
  await shot("ruban", { clip: await union([".ms-meta"], 12) });
  await page.getByRole("button", { name: T("Masquer les intrigues", "Hide plotlines") }).click();
});
await shot("manuscrit-colonne", { clip: { x: 0, y: 64, width: 360, height: 836 } });
await shot("manuscrit-stats", { clip: { x: 1080, y: 64, width: 360, height: 836 } });
await step("remplacer", async () => {
  await page.getByRole("button", { name: T("Remplacer", "Replace"), exact: true }).click();
  await wait(400);
  await page.keyboard.type(D.find);
  await page.keyboard.press("Tab");
  await page.keyboard.type(D.repl);
  await wait(400);
  await shot("remplacer", { el: "dialog[open]" });
  await closeDialog();
});
await step("statistiques du roman", async () => {
  await page.getByRole("button", { name: T("Statistiques", "Statistics"), exact: true }).first().click();
  await wait(600);
  await shot("stats-personnages", { el: "dialog[open]" });
  await closeDialog();
  await wait(300);
});
await step("focus", async () => {
  await page.getByRole("button", { name: T("Mode focus", "Focus mode") }).click();
  await wait(800);
  await page.locator(".ProseMirror").first().click();
  await wait(500);
  await shot("mode-focus");
  await page.keyboard.press("Escape");
  await wait(400);
});
await step("exporter", async () => {
  await page.getByRole("button", { name: T("Exporter", "Export") }).click();
  await wait(400);
  await shot("exporter", { clip: await union([".export-panel"], 20) });
  await page.getByRole("button", { name: T("Livre broché (KDP)…", "Paperback (KDP)…") }).click();
  await page.waitForSelector(T("text=pages, dos de", "text=pages, spine"), { timeout: 20000 });
  await shot("livre-broche", { el: "dialog[open]" });
  await closeDialog();
});
await step("export-bible", async () => {
  await page.getByRole("button", { name: T("Exporter", "Export") }).click();
  await wait(400);
  await page.getByRole("button", { name: T("Bible…", "Bible…") }).click();
  // L'aperçu est le vrai PDF : on attend le nombre de pages.
  await page.waitForSelector(".bexp-pages:not(.is-working) canvas", { timeout: 30000 });
  await wait(800);
  await shot("bible-export", { el: "dialog[open]" });
  await closeDialog();
});
await step("réglages", async () => {
  await page.getByRole("button", { name: T("Réglages", "Settings") }).click();
  await wait(400);
  await shot("reglages", { clip: await union([".settings-panel"], 20) });
  await page.getByRole("button", { name: T("Raccourcis clavier", "Keyboard shortcuts") }).click();
  await wait(400);
  await shot("raccourcis", { el: "dialog[open]" });
  await closeDialog();
  await page.getByRole("button", { name: T("Réglages", "Settings") }).click();
  await page.getByRole("button", { name: T("À propos de MondoWrite", "About MondoWrite") }).click();
  await wait(400);
  await shot("a-propos", { el: "dialog[open]" });
  await closeDialog();
});
await step("ia", async () => {
  await page.getByRole("button", { name: T("Réglages", "Settings") }).click();
  await page.locator(".settings-panel select").last().selectOption({ index: 4 });
  await wait(300);
  await page.locator(".settings-panel input").last().fill("gemma3");
  await wait(300);
  await shot("reglages-ia", { clip: await union([".settings-panel"], 20) });
  await page.keyboard.press("Escape");
  await page.mouse.click(700, 500);
  await view(T("Canevas", "Canvas"));
  const b = page.getByRole("button", { name: T("IA", "AI"), exact: true });
  await b.click();
  await wait(300);
  await shot("ia-menu", { clip: await union([b, page.locator("[role=menu], .ai-panel, .settings-panel").last()], 24) });
});
await page.close();

// ---------------------------------------------------------------------------------------------------
// Scénario importé
await open();
await page.goto(URL);
await wait(600);
await step("import", async () => {
  const chooser = page.waitForEvent("filechooser");
  await page.locator(".ghost-button", { hasText: T("Importer un manuscrit", "Import a manuscript") }).click();
  await (await chooser).setFiles(SAMPLE);
  await wait(2000);
  await closeTour();
});
await view(T("Scénario", "Screenplay"));
await shot("scenario");
await step("vérifier et filtre", async () => {
  // Une faute de frappe le temps de la capture (« LE LOUPP »), pour que l'onglet ait quelque chose à montrer.
  const cue = page.locator(".sp-editor [data-type=character], .sp-editor .sp-character, .sp-editor p", { hasText: new RegExp(`^${T("LE LOUP", "THE WOLF")}$`) }).nth(1);
  await cue.click();
  await page.keyboard.press("End");
  await page.keyboard.type("P");
  await page.keyboard.press("Enter");
  await page.keyboard.type(T("Ici.", "Here."));
  await wait(800);
  await page.locator(".sp-bar button", { hasText: T(/^Vérifier/, /^Check/) }).first().click();
  await wait(600);
  await shot("scenario-verifier");
  // On retire la faute : annuler dans l'éditeur.
  await page.locator(".sp-editor").first().click();
  for (let i = 0; i < 4; i++) await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await wait(600);
  await page.selectOption("#sp-filter-name", T("LE LOUP", "THE WOLF"));
  await page.getByRole("button", { name: T("Ses répliques", "Their lines"), exact: true }).click();
  await wait(800);
  await shot("scenario-filtre");
  // On rend tout le scénario et l'onglet « Dans cette scène » pour la suite.
  await page.selectOption("#sp-filter-name", "");
  await page.locator(".side-tabs button").first().click();
  await wait(300);
});
await step("statistiques", async () => {
  // Fenêtre Statistiques, ouverte depuis la barre du Scénario.
  await page.locator(".sp-bar button", { hasText: T(/^Statistiques$/, /^Statistics$/) }).first().click();
  await wait(600);
  const dlg = "dialog[open]";
  await page.locator(dlg).getByRole("button", { name: T("Décors", "Locations"), exact: true }).click();
  await wait(500);
  await shot("stats-decors", { el: dlg });
  await page.locator(dlg).getByRole("button", { name: T("Qui croise qui", "Who meets whom"), exact: true }).click();
  await wait(500);
  await page.locator(`${dlg} .cross-cell:not(.is-self)`).first().click();
  await wait(400);
  await shot("stats-croisements", { el: dlg });
  await page.locator(dlg).getByRole("button", { name: T("Int./Ext. et Jour/Nuit", "Int./Ext. and Day/Night"), exact: true }).click();
  await wait(400);
  await shot("stats-int-ext", { el: dlg });
  await closeDialog();
  await wait(300);
});
await step("complétion", async () => {
  const target = page.getByText(D.lastLine).last();
  await target.scrollIntoViewIfNeeded();
  await wait(300);
  const bb = await target.boundingBox();
  await page.mouse.click(bb.x + 40, bb.y + bb.height + 60);
  await wait(200);
  await page.keyboard.press("Enter");
  await page.keyboard.type(T("ext. b", "ext. w"));
  await wait(600);
  await shot("scenario-completion");
  await page.keyboard.press("Escape");
  for (let i = 0; i < 7; i++) await page.keyboard.press("Backspace");
  await wait(300);
});
await step("page de titre", async () => {
  await page.locator(`[aria-label='${T("Page de titre du scénario", "Screenplay title page")}']`).first().scrollIntoViewIfNeeded();
  await wait(400);
  await shot("scenario-page-titre");
});
await step("séquencier", async () => {
  await view(T("Séquencier", "Outline"));
  await shot("sequencier");
  await page.locator("select").first().selectOption({ index: 1 });
  await wait(800);
  await page.getByRole("button", { name: T("Fiches", "Index cards"), exact: true }).click();
  await wait(600);
  await shot("sequencier-fiches");
  await page.getByRole("button", { name: T("Liste", "List"), exact: true }).click();
});
await step("export scénario", async () => {
  await page.getByRole("button", { name: T("Exporter", "Export") }).click();
  await wait(300);
  await shot("exporter-scenario", { clip: await union([".export-panel"], 20) });
  // Fenêtre du PDF : texte d'un comédien, en-tête et filigrane (réglages remis à zéro après).
  await page.locator(".export-panel button", { hasText: "PDF…" }).click();
  await wait(600);
  const dlg = page.locator("dialog[open]");
  await dlg.getByLabel(T("Le texte d’un personnage", "One character’s part")).check();
  await dlg.getByLabel(T("Personnage", "Character"), { exact: true }).selectOption(T("LE LOUP", "THE WOLF"));
  await dlg.getByLabel(T("Synopsis des scènes", "Scene synopses")).check();
  await dlg.getByLabel(T("En-tête", "Header")).fill(T("Version 3 · {date}", "Draft 3 · {date}"));
  await dlg.getByLabel(T("Filigrane", "Watermark")).fill(T("Confidentiel", "Confidential"));
  await wait(500);
  await shot("scenario-export-pdf", { el: "dialog[open]" });
  if (process.env.GUIDE_PDF) {
    const download = page.waitForEvent("download");
    await dlg.getByRole("button", { name: T("Enregistrer le PDF…", "Save the PDF…") }).click();
    await (await download).saveAs(process.env.GUIDE_PDF);
  }
  await dlg.getByLabel(T("Tout le scénario", "The whole screenplay")).check();
  await dlg.getByLabel(T("Synopsis des scènes", "Scene synopses")).uncheck();
  await dlg.getByLabel(T("En-tête", "Header")).fill("");
  await dlg.getByLabel(T("Filigrane", "Watermark")).fill("");
  await closeDialog();
});
await step("canevas scénario", async () => {
  await view(T("Canevas", "Canvas"));
  await fit();
  await shot("scenario-canevas");
  const sc = page.locator(".react-flow__node:has(.type-scene)").nth(1);
  await sc.hover();
  await sc.getByRole("button", { name: T("Agrandir la carte", "Expand card") }).click();
  await wait(800);
  await shot("carte-agrandie-scenario", { el: "dialog[open]" });
  await closeDialog();
});
await page.close();

// ---------------------------------------------------------------------------------------------------
// Sombre, téléphone
await open({ scheme: "dark" });
await startExample();
await closeTour();
await shot("sombre-canevas");
await view(T("Manuscrit", "Manuscript"));
await shot("sombre-manuscrit");
await page.close();

// iPhone : le Carnet, deux notes à ranger.
await open({ viewport: { width: 390, height: 844 }, scale: 2, mobile: true, touch: true });
await startExample();
await closeTour();
await step("carnet", async () => {
  await page.getByRole("radio", { name: T("Question", "Question") }).tap();
  await page.getByLabel(T(/Ta note/, /Your note/)).fill(T("Pourquoi le Loup ne mange-t-il pas l’enfant dans le bois ?\nÀ cause des bûcherons, mais pas seulement.", "Why doesn’t the Wolf eat the child in the woods?\nBecause of the woodcutters, but not only."));
  await page.getByRole("button", { name: T("Garder", "Keep") }).tap();
  await page.getByRole("radio", { name: T("Objet", "Object") }).tap();
  await page.getByLabel(T(/Ta note/, /Your note/)).fill(T("Le petit pot de beurre", "The little pot of butter"));
  await page.getByRole("button", { name: T("Garder", "Keep") }).tap();
  await page.getByRole("radio", { name: T("Idée", "Idea") }).tap();
  await page.getByLabel(T(/Ta note/, /Your note/)).fill(T("Et si le Loup racontait", "What if the Wolf told it"));
  await page.locator(".carnet-field").blur();
  await shot("iphone-carnet");
});
await page.close();

await browser.close();
