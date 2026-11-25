// Tests de bout en bout de MondoWrite dans le navigateur (Chromium piloté par playwright-core).
// Ils attrapent ce que Vitest ne voit pas : rendu React réel, raccourcis, éditeurs TipTap, React Flow,
// erreurs levées par la page (sélecteur Zustand instable, boucle de rendu…).
//
//   npm run e2e                     tous les scénarios
//   npm run e2e -- canevas bible    seulement ceux dont le nom contient un de ces mots
//
// Le serveur de développement (Vite) est lancé sur un port libre, puis arrêté à la fin. Stockage :
// localStorage du navigateur, un contexte neuf (donc un stockage vide) par scénario.
// Navigateur : CHROMIUM=<chemin> s'il est donné, sinon celui de playwright-core
// (`npx playwright-core install chromium`), sinon le plus récent trouvé dans PLAYWRIGHT_BROWSERS_PATH.
// E2E_HEADED=1 montre la fenêtre. Un scénario échoué laisse sa capture dans scripts/e2e/captures/
// (dossier ignoré par Git).

import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const root = resolve(import.meta.dirname, "../..");
const SHOTS = join(root, "scripts/e2e/captures");

// Scénarios qui échouent à cause d'un bogue connu de l'app, pas encore corrigé : rapportés, sans faire
// échouer la commande. Retirer le nom dès que le bogue est corrigé (un scénario connu qui passe est signalé).
const KNOWN = new Set([]);

// ---------------------------------------------------------------------------------------------
// Serveur et navigateur

function freePort() {
  return new Promise((ok, ko) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", ko);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });
}

async function startVite() {
  const port = await freePort();
  // Vite lancé par node directement : pas de shell, la même commande sous Windows, macOS et Linux.
  const bin = join(root, "node_modules/vite/bin/vite.js");
  const child = spawn(process.execPath, [bin, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" },
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}/`;
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`Vite s'est arrêté :\n${log}`);
    try {
      const r = await fetch(url);
      if (r.ok) return { url, child, log: () => log };
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`Vite ne répond pas sur ${url} :\n${log}`);
}

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  try {
    const own = chromium.executablePath();
    if (own && existsSync(own)) return undefined; // celui de playwright-core, trouvé seul
  } catch {
    /* pas de navigateur pour cette version */
  }
  // Un autre Playwright a peut-être installé une révision voisine de Chromium.
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), ".cache/ms-playwright"), join(homedir(), "Library/Caches/ms-playwright"), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "ms-playwright")].filter(Boolean);
  const exes = ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const revs = readdirSync(dir)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const rev of revs) for (const exe of exes) if (existsSync(join(dir, rev, exe))) return join(dir, rev, exe);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Outils des scénarios

class Failure extends Error {}

/** Réglages (#57) : le bouton ouvre le menu de l'app, puis « Réglages… » ouvre la fenêtre des réglages. */
async function openSettings(page) {
  await page.getByRole("button", { name: "Réglages et aide", exact: true }).first().click();
  await page.getByRole("menuitem", { name: /^Réglages…/ }).click();
}

/** Attend qu'une condition soit vraie (fonction asynchrone), sinon échoue avec le message donné. */
async function until(check, message, timeout = 8000) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await check();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    if (Date.now() > end) throw new Failure(`${message}${last instanceof Error ? ` (${last.message.split("\n")[0]})` : ""}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

function assert(ok, message) {
  if (!ok) throw new Failure(message);
}

// Erreurs de React à repérer même quand elles arrivent en simple avertissement.
const REACT_ERRORS = [/Maximum update depth/i, /getSnapshot should be cached/i, /Cannot update a component/i, /Encountered two children with the same key/i, /Each child in a list should have a unique "key"/i, /is not a function/i, /Cannot read properties of/i];

/** Erreurs de console sans rapport avec l'app : ressources réseau refusées (sites extérieurs coupés, polices). */
const NOISE = [/Failed to load resource/i, /net::ERR_/i, /Download the React DevTools/i];

function helpers(page, base) {
  const h = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    /** Page des projets d'un stockage vide. */
    async home() {
      await page.goto(base);
      await page.locator(".home").waitFor({ timeout: 20_000 });
    },
    /** Crée un projet depuis l'accueil et attend le canevas. */
    async create(title, kind = "roman") {
      await h.home();
      await page.locator(".home-form input[type=text]").fill(title);
      await page.locator(`.home-kinds input[value="${kind === "scenario" ? "scenario" : "roman"}"]`).check();
      await page.locator(".home-create").click();
      await h.canvas();
    },
    /** Ouvre le projet d'exemple (bouton à côté de « Créer le projet »). */
    async example() {
      await h.home();
      await page.locator(".home-form .home-buttons .ghost-button").first().click();
      await h.canvas();
      // La visite guidée s'ouvre avec l'exemple : on la ferme si elle est là.
      await h.closeTour();
    },
    async closeTour() {
      await h.wait(400);
      for (let i = 0; i < 3 && (await page.locator(".tour").count()); i++) {
        await page.keyboard.press("Escape");
        await h.wait(200);
      }
    },
    async canvas() {
      await page.locator(".react-flow").waitFor({ timeout: 20_000 });
      await page.locator(".topbar").waitFor();
    },
    cards: () => page.locator(".react-flow__node-card"),
    cardsOf: (type) => page.locator(`.react-flow__node-card .card.type-${type}`),
    edges: () => page.locator(".react-flow__edge"),
    /** Titres des cartes du canevas, avec leur type. */
    cardList: () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".react-flow__node-card .card")].map((c) => ({
          type: [...c.classList].find((k) => k.startsWith("type-"))?.slice(5),
          title: c.querySelector(".card-title")?.value ?? "",
        })),
      ),
    /** Clic sur le fond du canevas, loin des cartes : retire le focus d'un champ et la sélection. */
    async pane() {
      const box = await page.locator(".react-flow__pane").boundingBox();
      await page.mouse.click(box.x + box.width - 260, box.y + box.height - 140);
      await h.wait(150);
    },
    /** Nouvelle carte (touche N) avec un titre ; rend son identifiant. */
    async newCard(title) {
      await h.pane();
      const before = await page.locator(".react-flow__node-card").evaluateAll((els) => els.map((e) => e.dataset.id));
      await page.keyboard.press("n");
      const id = await until(
        async () => (await page.locator(".react-flow__node-card").evaluateAll((els) => els.map((e) => e.dataset.id))).find((x) => !before.includes(x)),
        "la touche N n'a pas créé de carte",
      );
      await until(() => page.locator(`.react-flow__node[data-id="${id}"] .card-title`).evaluate((el) => el === document.activeElement), "le titre de la nouvelle carte n'a pas le focus");
      await page.keyboard.type(title);
      await h.wait(100);
      return id;
    },
    node: (id) => page.locator(`.react-flow__node[data-id="${id}"]`),
    /** Projet enregistré dans le localStorage (fichiers par chemin). */
    async files() {
      return page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.startsWith("cosmos:projet:"));
        return key ? JSON.parse(localStorage.getItem(key)) : {};
      });
    },
    /** Attend l'enregistrement automatique (800 ms après la dernière modification). */
    async saved(check, message) {
      return until(async () => check(await h.files()), message, 6000);
    },
    /** Recharge la page puis rouvre le premier projet de la liste (l'app revient toujours à l'accueil). */
    async reloadAndOpen() {
      await page.reload();
      await page.locator(".home").waitFor({ timeout: 20_000 });
      await page.locator(".home-project").first().click();
      await h.canvas();
    },
    async view(n) {
      await page.keyboard.press(`Control+${n}`);
      await h.wait(400);
    },
  };
  return h;
}

// ---------------------------------------------------------------------------------------------
// Scénarios (textes de l'interface tirés de src/i18n/fr.ts, ou en.ts pour le scénario en anglais)

const scenarios = [
  {
    name: "canevas : carte créée par N, devenue Personnage, retrouvée après rechargement",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare");
      const id = await h.newCard("Inès Morvan");
      await h.node(id).locator(".card-type").click();
      await page.getByRole("option", { name: "Personnage", exact: true }).click();
      await until(() => h.node(id).locator(".card.type-personnage").count(), "la carte n'est pas devenue Personnage");
      await h.saved((f) => /type: personnage/.test(f[`cartes/${id}.md`] ?? ""), "la carte Personnage n'a pas été enregistrée");
      await h.reloadAndOpen();
      const cards = await h.cardList();
      assert(cards.length === 1, `1 carte attendue après rechargement, ${cards.length} trouvée(s)`);
      assert(cards[0].type === "personnage" && cards[0].title === "Inès Morvan", `carte relue : ${JSON.stringify(cards[0])}`);
    },
  },
  {
    name: "clic droit sur le canevas (#146) : un menu, pas de carte ; « Créer ici : Personnage » crée la carte, Échap ferme",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare");
      const pane = page.locator(".react-flow__pane");
      await pane.click({ button: "right", position: { x: 300, y: 220 } });
      const menu = page.getByRole("menu", { name: "Menu du canevas" });
      await until(() => menu.count(), "le clic droit n'a pas ouvert de menu");
      assert((await h.cardList()).length === 0, "le clic droit a créé une carte");
      await page.keyboard.press("Escape");
      await until(async () => (await menu.count()) === 0, "Échap n'a pas fermé le menu");
      await pane.click({ button: "right", position: { x: 300, y: 220 } });
      await menu.getByRole("menuitem", { name: "Créer ici : Personnage" }).click();
      await until(() => page.locator(".card.type-personnage").count(), "le menu n'a pas créé de carte Personnage");
      assert((await h.cardList()).length === 1, "une seule carte attendue");
    },
  },
  {
    name: "menus ⋯ (1.11.1) : une carte part à la corbeille par son menu, la corbeille en dernier et en rouge ; Annuler la remet",
    async run(h) {
      const { page } = h;
      await h.create("Menus");
      const id = await h.newCard("Inès");
      await h.pane();
      await h.node(id).hover();
      await h.node(id).getByRole("button", { name: "Plus d’actions" }).click();
      const items = page.getByRole("menuitem");
      const last = items.last();
      assert((await last.textContent())?.trim() === "Mettre à la corbeille", `dernière entrée : ${await last.textContent()}`);
      assert(await last.evaluate((el) => el.classList.contains("is-danger")), "la corbeille n'est pas marquée en rouge");
      await last.click();
      await until(async () => (await h.cards().count()) === 0, "la carte n'est pas partie à la corbeille");
      await h.pane();
      await page.keyboard.press("Control+z");
      await until(async () => (await h.cards().count()) === 1, "Ctrl+Z n'a pas remis la carte");
      // Barre du haut : plus de bouton Enregistrer, le statut enregistre ; « Projets » ramène à l'accueil.
      assert((await page.getByRole("button", { name: "Enregistrer", exact: true }).count()) === 0, "le bouton Enregistrer est encore là");
      await page.locator(".topbar .tb-back").click();
      await until(() => page.locator(".home-create").first().isVisible(), "« Projets » ne ramène pas à l'accueil");
    },
  },
  {
    name: "fils : relier deux cartes en glissant, annuler, rétablir",
    async run(h) {
      const { page } = h;
      await h.create("Fils");
      const a = await h.newCard("Inès");
      const b = await h.newCard("Yann");
      await h.pane();
      // Écartées l'une de l'autre pour que le fil soit net.
      const ba = await h.node(a).boundingBox();
      const bb = await h.node(b).boundingBox();
      assert(ba && bb, "cartes introuvables à l'écran");
      const from = await h.node(a).locator(".react-flow__handle-bottom.source, .react-flow__handle-bottom").first().boundingBox();
      assert(from, "point d'accroche du bas introuvable");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      const tx = bb.x + bb.width / 2, ty = bb.y + bb.height / 2;
      for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((tx - from.x) * i) / 12, from.y + ((ty - from.y) * i) / 12);
      await page.mouse.up();
      await until(async () => (await h.edges().count()) === 1, "le fil n'a pas été tiré");
      await h.pane();
      await page.keyboard.press("Control+z");
      await until(async () => (await h.edges().count()) === 0, "Ctrl+Z n'a pas retiré le fil");
      assert((await h.cards().count()) === 2, "Ctrl+Z a retiré une carte en plus du fil");
      await page.keyboard.press("Control+Shift+z");
      await until(async () => (await h.edges().count()) === 1, "Ctrl+Maj+Z n'a pas remis le fil");
      await h.saved((f) => (JSON.parse(f["cosmos.json"] ?? "{}").links ?? []).length === 1, "le fil rétabli n'a pas été enregistré");
    },
  },
  {
    name: "préparer et payer : le sens d'un fil entre deux scènes, et l'ordre signalé dans « Vérifier » (#119)",
    async run(h) {
      const { page } = h;
      await h.create("Préparer");
      await h.view(2);
      for (const title of ["Le dîner", "Le fusil"]) {
        await page.getByPlaceholder("Nouvelle scène…").fill(title);
        await page.getByPlaceholder("Nouvelle scène…").press("Enter");
        await h.wait(200);
      }
      await h.view(1);
      const scenes = page.locator(".react-flow__node-card:has(.card.type-scene)");
      await until(async () => (await scenes.count()) === 2, "les deux scènes ne sont pas sur le canevas");
      const [a, b] = await scenes.evaluateAll((els) => els.map((e) => e.dataset.id));
      const from = await h.node(a).locator(".react-flow__handle-bottom").first().boundingBox();
      const bb = await h.node(b).boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      const tx = bb.x + bb.width / 2, ty = bb.y + bb.height / 2;
      for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((tx - from.x) * i) / 12, from.y + ((ty - from.y) * i) / 12);
      await page.mouse.up();
      await until(async () => (await h.edges().count()) === 1, "le fil n'a pas été tiré");
      await h.pane();
      // Le fil choisi : son éditeur propose l'ordre des deux scènes.
      const mid = await page.locator(".react-flow__edge.scene-arrow .react-flow__edge-path").first().evaluate((path) => {
        const pt = path.getPointAtLength(path.getTotalLength() / 2);
        const m = path.getScreenCTM();
        return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
      });
      await page.mouse.click(mid.x, mid.y);
      const order = page.getByRole("combobox", { name: "Ordre des deux scènes" });
      await until(() => order.isVisible(), "l'éditeur du fil ne propose pas l'ordre des deux scènes");
      // Une seule option : la scène qui vient d'abord prépare l'autre.
      const sheet = await order.evaluate((el) => [...el.options].map((o) => o.textContent));
      assert(sheet.length === 2 && sheet[1]?.startsWith("Le dîner prépare"), `options inattendues : ${JSON.stringify(sheet)}`);
      await order.selectOption({ index: 1 });
      await page.keyboard.press("Escape");
      await until(() => page.locator(".react-flow__edge.is-setup").isVisible(), "le fil ne se dessine pas en « prépare »");
      await until(() => page.locator(".react-flow").getByText("prépare A", { exact: true }).first().isVisible(), "le fil sans étiquette ne dit pas « prépare A »");
      await h.saved((f) => Object.values(JSON.parse(f["cosmos.json"] ?? "{}").setups ?? {}).includes(a), "le sens du fil n'est pas enregistré dans setups");
      // Rouvert, l'éditeur du fil montre l'étiquette enregistrée (vide), jamais « prépare A ».
      const arc = await page.locator(".react-flow__edge.is-setup .react-flow__edge-path").first().evaluate((path) => {
        const pt = path.getPointAtLength(path.getTotalLength() / 4);
        const m = path.getScreenCTM();
        return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
      });
      await page.mouse.click(arc.x, arc.y);
      await until(() => order.isVisible(), "l'éditeur du fil ne se rouvre pas");
      assert((await page.locator(".label-editor input").inputValue()) === "", "l'éditeur du fil reprend l'étiquette affichée");
      await page.keyboard.press("Escape");
      // La carte qui prépare porte sa pastille ; un clic met ses préparations en avant.
      const badge = h.node(a).locator(".card-setups");
      await until(() => badge.isVisible(), "la carte qui prépare n'a pas de pastille");
      assert((await badge.textContent())?.includes("Prépare A"), `pastille inattendue : ${await badge.textContent()}`);
      await badge.click();
      await until(() => page.getByText("Préparations de « Le dîner »").isVisible(), "la pastille ne met pas les préparations en avant");
      await page.getByRole("button", { name: "Tout revoir" }).click();
      // Filtre « Préparations seulement ».
      await page.getByRole("button", { name: "Filtrer les cartes" }).click();
      await page.getByLabel("Préparations seulement").check();
      await page.keyboard.press("Escape");
      await until(() => page.getByText("Filtre actif : préparations seulement").isVisible(), "le filtre des préparations n'est pas annoncé");
      await page.locator(".filter-banner").getByRole("button", { name: "Tout afficher" }).click();
      // L'onglet « Scène » du Manuscrit dit ce que la scène prépare.
      await h.view(4);
      await until(() => page.locator(".scene-setups").isVisible(), "l'onglet Scène ne montre pas les préparations");
      // Le fusil passe avant le dîner : la scène qui paie vient avant celle qui prépare, « Vérifier » le signale.
      await h.view(2);
      await page.getByRole("button", { name: "Monter la scène « Le fusil »" }).click();
      await h.wait(200);
      await h.view(4);
      await page.locator(".side-tabs").getByRole("button", { name: /^Vérifier/ }).click();
      const item = page.locator(".review-group", { hasText: "Une scène qui paie avant d’être préparée" }).locator(".review-item");
      await until(async () => (await item.count()) === 1, "« Vérifier » ne signale pas la scène qui paie avant d'être préparée");
    },
  },
  {
    name: "enchaînements à relire : une scène déplacée dans le Plan, signalée puis validée dans « Vérifier » (#120)",
    async run(h) {
      const { page } = h;
      await h.create("Enchaînements");
      await h.view(2);
      for (const title of ["Un", "Deux", "Trois", "Quatre"]) {
        await page.getByPlaceholder("Nouvelle scène…").fill(title);
        await page.getByPlaceholder("Nouvelle scène…").press("Enter");
        await h.wait(200);
      }
      // L'ordre de départ est validé : rien à relire.
      await h.view(4);
      await page.locator(".side-tabs").getByRole("button", { name: /^Vérifier/ }).click();
      const group = page.locator(".review-group", { hasText: "Un enchaînement à relire" });
      await h.wait(300);
      assert((await group.count()) === 0, "un enchaînement est signalé sans aucun déplacement");
      // « Quatre » monte d'un cran : Un, Deux, Quatre, Trois.
      await h.view(2);
      await page.getByRole("button", { name: "Monter la scène « Quatre »" }).click();
      await h.view(4);
      await page.locator(".side-tabs").getByRole("button", { name: /^Vérifier/ }).click();
      const items = group.locator(".review-item");
      await until(async () => (await items.count()) === 2, "les deux nouveaux enchaînements ne sont pas signalés");
      await until(() => items.first().getByText("Relire le passage de « Deux » (scène 2) à « Quatre » (scène 3)").isVisible(), "le premier enchaînement n'est pas « Deux » vers « Quatre »");
      await items.first().getByRole("button", { name: "C’est bon" }).click();
      await until(async () => (await items.count()) === 1, "« C'est bon » ne retire pas l'enchaînement");
      await h.saved((f) => (JSON.parse(f["cosmos.json"] ?? "{}").transitions ?? []).length >= 5, "les enchaînements validés ne sont pas enregistrés");
      // Remonter « Quatre » d'un cran encore puis tout valider.
      await h.view(2);
      await page.getByRole("button", { name: "Monter la scène « Quatre »" }).click();
      await h.view(4);
      await page.locator(".side-tabs").getByRole("button", { name: /^Vérifier/ }).click();
      await until(async () => (await items.count()) >= 2, "le second déplacement n'est pas signalé");
      await group.getByRole("button", { name: "Tout valider" }).click();
      await until(async () => (await group.count()) === 0, "« Tout valider » laisse des enchaînements à relire");
    },
  },
  {
    name: "exemple : ouverture et passage par les quatre vues",
    async run(h) {
      const { page } = h;
      await h.example();
      const n = await until(async () => ((await h.cards().count()) >= 21 ? h.cards().count() : 0), "moins de 21 cartes dans le projet d'exemple");
      assert(n >= 21, `${n} cartes`);
      await h.view(2);
      await page.locator(".plan, .plan-view, main").first().waitFor();
      await until(() => page.getByText("Le loup", { exact: false }).first().isVisible(), "le Plan ne montre pas les scènes de l'exemple");
      await h.view(3);
      await until(() => page.locator(".bible, .bible-main").first().isVisible(), "la Bible ne s'affiche pas");
      await h.view(4);
      await until(() => page.locator(".ProseMirror").first().isVisible(), "le Manuscrit ne montre pas d'éditeur");
      await h.view(1);
      await until(async () => (await h.cards().count()) >= 21, "retour au canevas : cartes absentes");
      // Lot 17 ter : « Organiser » faisait boucler React (rang d'une case recréé à chaque lecture).
      await page.getByRole("button", { name: "Organiser le canevas" }).first().click();
      await until(() => page.locator(".react-flow__node-frame").count(), "« Organiser » n'a posé aucun cadre");
    },
  },
  {
    name: "garder sa place (#144) : la scène du Manuscrit choisie sur le canevas et montrée dans le Plan, le curseur retrouvé au retour",
    async run(h) {
      const { page } = h;
      await h.example();
      await h.view(4);
      const rows = page.locator(".ms-scenes [data-scene], [data-scene].is-movable, button[data-scene]");
      await until(() => rows.count(), "le volet des scènes est vide");
      const id = await rows.nth(2).getAttribute("data-scene");
      await rows.nth(2).click();
      await h.wait(500);
      // Le curseur dans le premier paragraphe de la scène, au bout.
      await page.locator(`.ProseMirror [data-scene-id="${id}"]`).locator("xpath=following-sibling::p[1]").click();
      await page.keyboard.press("End");
      await page.keyboard.type("ZZZ");
      await h.wait(300);
      await h.view(1);
      await until(() => page.locator(`.react-flow__node.selected[data-id="${id}"]`).count(), "le canevas n'a pas choisi la carte de la scène où l'on écrivait");
      await h.view(4);
      await h.wait(300);
      await h.view(2);
      await until(() => page.evaluate((sid) => document.activeElement?.closest("[data-scene]")?.getAttribute("data-scene") === sid, id), `le Plan ne montre pas la ligne de la scène ${id} : ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200))}`);
      await h.view(4);
      await h.wait(500);
      await page.keyboard.type("QQQ");
      await h.saved((f) => (f[`manuscrit/${id}.md`] ?? "").includes("ZZZQQQ"), "le curseur n'est pas revenu à sa place dans la scène");
    },
  },
  {
    name: "déplacer des lignes (#145) : Alt Maj ↑ monte le paragraphe du Manuscrit, enregistré dans le nouvel ordre",
    async run(h) {
      const { page } = h;
      await h.create("Lignes");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le phare");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("Premier.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Second.");
      await page.keyboard.press("Alt+Shift+ArrowUp");
      await page.keyboard.type(" Monté.");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && /Second\. Monté\.\s+Premier\./.test(v)), "le paragraphe n'est pas monté avec le curseur");
    },
  },
  {
    name: "fiche de scène reliée (#137 à #139) : un personnage créé depuis l'onglet Scène est relié ; double-clic sur sa carte, ses scènes ; délier",
    async run(h) {
      const { page } = h;
      await h.create("Liens");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le phare");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      await page.locator(".ProseMirror[contenteditable=true]").first().waitFor();
      await page.getByRole("button", { name: "Ajouter : Personnages" }).click();
      await page.getByRole("combobox", { name: "Ajouter : Personnages" }).fill("Inès");
      await page.keyboard.press("Enter");
      await until(() => page.locator(".scene-links .link-pill", { hasText: "Inès" }).count(), "la pastille du personnage n'apparaît pas");
      await h.saved((f) => Object.values(f).some((v) => /type: personnage/.test(v) && /Inès/.test(v)) && /"links":\s*\[\s*\{/.test(f["cosmos.json"] ?? ""), "le personnage et son fil ne sont pas enregistrés");
      const charId = Object.entries(await h.files()).find(([k, v]) => k.startsWith("cartes/") && /type: personnage/.test(v))[0].slice(7, -3);
      await h.view(1);
      const card = h.node(charId).locator(".card");
      await card.waitFor();
      const box = await card.boundingBox();
      await page.mouse.dblclick(box.x + box.width - 4, box.y + box.height / 2);
      await until(() => page.locator(".expanded-card .card-scenes .link-pill", { hasText: "Le phare" }).count(), "la carte agrandie du personnage ne montre pas sa scène");
      await page.locator(".expanded-card .card-scenes").getByRole("button", { name: "Délier de « Le phare »" }).click();
      await until(async () => (await page.locator(".expanded-card .card-scenes .link-pill").count()) === 0, "délier n'a pas retiré la pastille");
    },
  },
  {
    name: "image dans le texte (#87) : insérée par le ⋯ du Manuscrit, enregistrée en Markdown, sa description et sa place modifiables",
    async run(h) {
      const { page } = h;
      await h.create("Images");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le phare");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("La lanterne tourne.");
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Insérer une image…" }).click();
      const device = page.getByRole("button", { name: /^Choisir une image sur l’appareil/ });
      await device.waitFor();
      const chooser = page.waitForEvent("filechooser");
      await device.click();
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      await (await chooser).setFiles({ name: "phare.png", mimeType: "image/png", buffer: png });
      const alt = page.getByRole("textbox", { name: "Description de l’image" });
      await until(() => alt.isVisible(), "l'image n'apparaît pas dans le texte");
      await alt.fill("Le phare sous l’orage");
      await page.getByRole("combobox", { name: "Place de l’image" }).selectOption("page");
      await h.saved(
        (f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && /!\[Le phare sous l’orage\]\(\.\.\/medias\/[A-Za-z0-9_-]+\.png "page"\)/.test(v)),
        "l'image n'est pas enregistrée en Markdown avec sa description et sa place",
      );
      await h.reloadAndOpen();
      await h.view(4);
      const figure = page.locator(".ms-page figure.scene-image");
      await until(async () => (await figure.count()) === 1, "après rechargement, l'image a disparu du texte");
      assert((await figure.getAttribute("data-place")) === "page", "après rechargement, l'image n'est plus seule sur sa page");
      assert((await figure.locator("input").inputValue()) === "Le phare sous l’orage", "après rechargement, la description de l'image est perdue");
    },
  },
  {
    name: "recherche dans le Manuscrit (#85) : un mot tapé sans accent ni majuscule, sélectionné au milieu de l'écran, sans changer de vue",
    async run(h) {
      const { page } = h;
      await h.example();
      await h.view(4);
      await until(() => page.locator(".manuscript .ProseMirror").first().isVisible(), "le Manuscrit ne s'ouvre pas");
      await page.keyboard.press("Control+f");
      await page.locator(".search-input").fill("DEVORA");
      await until(() => page.locator(".search-result").first().isVisible(), "aucun passage pour « DEVORA »");
      await page.locator(".search-input").press("Enter");
      await until(async () => (await page.evaluate(() => String(window.getSelection()))) === "dévora", "le mot trouvé n'est pas sélectionné dans le Manuscrit");
      assert(await page.locator(".manuscript").isVisible(), "la recherche a quitté le Manuscrit");
      // Le mot est au milieu de la colonne qui défile, pas en bas de l'écran.
      const off = await until(() =>
        page.evaluate(() => {
          const sel = window.getSelection();
          if (!sel || !sel.rangeCount) return null;
          const top = sel.getRangeAt(0).getBoundingClientRect().top;
          let box = sel.anchorNode?.parentElement ?? null;
          while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
          const r = box ? box.getBoundingClientRect() : { top: 0, height: window.innerHeight };
          return { off: Math.abs(top - (r.top + r.height / 2)), height: r.height };
        }), "pas de sélection");
      assert(off.off < off.height * 0.15, `le mot n'est pas au milieu de l'écran (écart ${Math.round(off.off)} px sur ${Math.round(off.height)})`);
    },
  },
  {
    name: "recherche dans le Manuscrit (#85) : F3 et Maj+F3 passent d'un passage à l'autre, la recherche rouverte part du suivant, un titre de chapitre est trouvé",
    async run(h) {
      const { page } = h;
      await h.example();
      await h.view(4);
      await until(() => page.locator(".manuscript .ProseMirror").first().isVisible(), "le Manuscrit ne s'ouvre pas");
      // Rang (dans tout le livre) de l'occurrence sélectionnée : on compte les « galette » qui la précèdent.
      const rank = () =>
        page.evaluate(() => {
          const sel = window.getSelection();
          if (!sel || !sel.rangeCount || !/^galette$/i.test(String(sel))) return -1;
          const root = document.querySelector(".manuscript .ProseMirror");
          const before = document.createRange();
          before.setStart(root, 0);
          before.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
          return (before.toString().match(/galette/gi) ?? []).length;
        });
      await page.keyboard.press("Control+f");
      await page.locator(".search-input").fill("galette");
      await until(async () => (await page.locator(".search-result").count()) >= 3, "moins de trois passages pour « galette »");
      await page.locator(".search-input").press("Enter");
      await until(async () => (await rank()) === 0, "le premier passage n'est pas sélectionné");
      await page.keyboard.press("F3");
      await until(async () => (await rank()) === 1, "F3 ne mène pas au passage suivant");
      await page.keyboard.press("F3");
      await until(async () => (await rank()) === 2, "F3 ne mène pas au troisième passage");
      await page.keyboard.press("Shift+F3");
      await until(async () => (await rank()) === 1, "Maj+F3 ne revient pas au passage précédent");
      // La recherche rouverte se place sur le passage qui suit le dernier choisi : Entrée y mène.
      await page.keyboard.press("Control+f");
      await until(() => page.locator(".search-result.is-active").isVisible(), "pas de passage choisi à la réouverture");
      await page.locator(".search-input").press("Enter");
      await until(async () => (await rank()) === 2, "la recherche rouverte ne part pas du passage suivant");
      // Le titre d'un chapitre : sa ligne dans la liste, avec le mot « Chapitre ».
      await page.keyboard.press("Control+f");
      await page.locator(".search-input").fill("le bois");
      await until(async () => (await page.locator(".search-result").first().innerText()).includes("Chapitre"), "le titre du chapitre « Le bois » n'est pas trouvé");
      await page.locator(".search-input").press("Enter");
      assert(await page.locator(".manuscript").isVisible(), "la recherche a quitté le Manuscrit");
    },
  },
  {
    name: "recherche sur le canevas (#85) : un mot du texte d'une scène met sa carte en avant, sans quitter le canevas",
    async run(h) {
      const { page } = h;
      await h.example();
      await page.keyboard.press("Control+f");
      await page.locator(".search-input").fill("DEVORA");
      await until(() => page.locator(".search-result").first().isVisible(), "aucun résultat pour « DEVORA »");
      await page.locator(".search-input").press("Enter");
      await until(() => page.locator(".react-flow__node.is-spotlit").first().isVisible(), "la carte de la scène n'est pas mise en avant");
      assert((await page.locator(".manuscript").count()) === 0, "la recherche a ouvert le Manuscrit");
    },
  },
  {
    name: "recherche dans le Plan et la Bible (#85) : la scène ou la fiche trouvée, dans la même vue",
    async run(h) {
      const { page } = h;
      await h.example();
      await h.view(2);
      await until(() => page.locator(".sequencer .sq-scene").first().isVisible(), "le Plan ne montre pas de scène");
      await page.keyboard.press("Control+f");
      await page.locator(".search-input").fill("devora");
      await until(() => page.locator(".search-result").first().isVisible(), "aucune scène pour « devora »");
      await page.locator(".search-input").press("Enter");
      await until(() => page.locator(".sequencer .sq-scene.is-found").first().isVisible(), "la scène trouvée n'est pas marquée dans le Plan");
      await h.view(3);
      await until(() => page.locator(".bible, .bible-main").first().isVisible(), "la Bible ne s'affiche pas");
      await page.keyboard.press("Control+f");
      await page.locator(".search-input").fill("chevillette");
      await until(() => page.locator(".search-result").first().isVisible(), "aucune fiche pour « chevillette »");
      await page.locator(".search-input").press("Enter");
      await h.wait(400);
      assert(await page.locator(".bible, .bible-main").first().isVisible(), "la recherche a quitté la Bible");
      assert((await page.locator(".react-flow").count()) === 0, "la recherche est allée sur le canevas");
    },
  },
  {
    name: "suivre les fils (#81) : fils masqués, « Relié à » estompe ce qui n'est pas relié, « Tout revoir » le fait revenir",
    async run(h) {
      const { page } = h;
      await h.example();
      await until(async () => (await h.cards().count()) >= 21, "moins de 21 cartes dans le projet d'exemple");
      await page.getByRole("button", { name: "Masquer les fils", exact: true }).click();
      assert((await page.locator(".react-flow__node.is-faded").count()) === 0, "des cartes sont estompées sans fil suivi");
      const card = page.locator(".react-flow__node-card").filter({ has: page.locator("button.card-links-toggle") }).first();
      const id = await card.getAttribute("data-id");
      await card.locator("button.card-links-toggle").click();
      await until(async () => (await page.locator(".react-flow__node.is-faded").count()) > 0, "rien n'est estompé après « Relié à »");
      const faded = await page.locator(".react-flow__node.is-faded").evaluateAll((els) => els.map((e) => e.dataset.id));
      assert(!faded.includes(id), "la carte suivie est estompée");
      await until(async () => Number(await page.locator(".react-flow__node.is-faded").first().evaluate((el) => getComputedStyle(el).opacity)) < 0.6, "carte estompée trop visible");
      await page.locator(".follow-banner").getByRole("button", { name: "Tout revoir" }).click();
      await until(async () => (await page.locator(".react-flow__node.is-faded").count()) === 0, "« Tout revoir » ne fait pas revenir les cartes estompées");
    },
  },
  {
    name: "roman en gabarit libre : la fenêtre n'est pas vide après rechargement",
    async run(h) {
      const { page } = h;
      await h.create("Libre");
      await h.view(2);
      // Passage par un autre gabarit puis retour au libre, puis une scène ajoutée dans le Plan.
      const select = page.locator("select").first();
      await select.selectOption("troisActes");
      await select.selectOption("libre");
      await page.getByPlaceholder("Nouvelle scène…").first().fill("Arrivée au phare");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      // Le gabarit libre est celui par défaut : le plan n'est écrit qu'au premier déplacement.
      await h.saved((f) => {
        const meta = JSON.parse(f["cosmos.json"] ?? "{}");
        return (meta.plan?.template ?? "libre") === "libre" && Object.keys(f).some((k) => k.startsWith("cartes/"));
      }, "la scène du roman en gabarit libre n'a pas été enregistrée");
      await h.view(1);
      await h.reloadAndOpen();
      await h.view(1);
      await until(async () => (await h.cards().count()) === 1, "le canevas ne montre pas la scène");
      assert((await page.locator(".topbar").isVisible()) && (await page.locator(".react-flow__node-card").first().isVisible()), "fenêtre vide");
    },
  },
  {
    name: "manuscrit : « - tu viens ? » reste une réplique, ni liste ni carte Idée",
    async run(h) {
      const { page } = h;
      await h.create("Réplique");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le départ");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("- tu viens ?");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Elle hésita.");
      await h.wait(500);
      assert((await editor.locator("ul, ol, li").count()) === 0, "le tiret de dialogue a ouvert une liste");
      assert((await editor.innerText()).includes("tu viens"), "le texte tapé n'est pas dans le manuscrit");
      await h.saved((f) => Object.keys(f).some((k) => k.startsWith("manuscrit/") && f[k].includes("tu viens")), "le texte de la scène n'a pas été enregistré");
      await h.view(1);
      const cards = await h.cardList();
      assert(!cards.some((c) => c.type === "idee"), `une carte Idée a été créée : ${JSON.stringify(cards)}`);
      assert(cards.length === 1 && cards[0].type === "scene", `une seule carte Scène attendue : ${JSON.stringify(cards)}`);
    },
  },
  {
    name: "LanguageTool : réglé dans les Réglages, la scène relue, une faute corrigée d'un clic, une remarque ignorée, un clic rouvre la bulle",
    async run(h) {
      const { page } = h;
      // Le service est simulé (le réseau extérieur est coupé) : une faute sur « aller », une remarque de style sur « très ».
      const sent = [];
      await page.route("https://api.languagetool.org/v2/check", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const text = new URLSearchParams(route.request().postData() ?? "").get("text") ?? "";
        sent.push(text);
        const matches = [];
        const a = text.indexOf("aller");
        if (a >= 0) matches.push({ message: "Le participe passé convient ici.", offset: a, length: 5, replacements: [{ value: "allé" }], rule: { id: "PP", issueType: "grammar", category: { id: "GRAMMAR" } } });
        const b = text.indexOf("très");
        if (b >= 0) matches.push({ message: "Adverbe peu utile.", offset: b, length: 4, replacements: [], rule: { id: "TRES", issueType: "style", category: { id: "STYLE" } } });
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ matches }) });
      });
      await h.create("Relecture");
      await openSettings(page);
      await page.getByRole("tab", { name: "Écriture", exact: true }).click();
      await page.getByLabel("Vérification LanguageTool", { exact: true }).selectOption("public");
      await until(() => page.getByText("Le texte de la scène est envoyé au service choisi", { exact: false }).isVisible(), "l'avertissement d'envoi du texte n'apparaît pas");
      await page.keyboard.press("Escape");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le port");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("Elle est aller au port. Il fait très beau.");
      await h.wait(300);
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Vérifier la scène avec LanguageTool" }).click();
      await until(async () => (await editor.locator(".lt-issue").count()) === 2, "les deux remarques ne sont pas soulignées");
      assert(sent.some((t) => t.includes("Elle est aller au port")), `le texte de la scène n'a pas été envoyé : ${JSON.stringify(sent)}`);
      // La bulle s'ouvre sur la première remarque, avec le focus (chemin au clavier).
      const bubble = page.locator(".lt-bubble");
      await until(() => bubble.isVisible(), "la bulle de la première remarque ne s'ouvre pas");
      await until(() => page.getByRole("button", { name: "Remplacer par allé" }).evaluate((el) => el === document.activeElement), "la correction proposée n'a pas le focus");
      await page.keyboard.press("Enter");
      await until(async () => (await editor.innerText()).includes("Elle est allé au port"), "la correction n'est pas entrée dans le texte");
      await until(async () => (await editor.locator(".lt-issue").count()) === 1, "la remarque corrigée est encore soulignée");
      // La remarque suivante prend la place : sans correction proposée, on l'ignore.
      await until(() => bubble.getByText("Adverbe peu utile.").isVisible(), "la remarque suivante ne s'affiche pas");
      await bubble.getByRole("button", { name: "Ignorer", exact: true }).click();
      await until(async () => (await editor.locator(".lt-issue").count()) === 0, "la remarque ignorée est encore soulignée");
      await until(async () => !(await bubble.count()), "la bulle reste ouverte sans remarque");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && v.includes("Elle est allé au port") && !v.includes("lt-issue")), "la correction n'est pas enregistrée (ou un soulignement est entré dans le fichier)");
      // Un clic sur un passage souligné rouvre sa bulle.
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Vérifier la scène avec LanguageTool" }).click();
      await until(async () => (await editor.locator(".lt-issue").count()) === 1, "la seconde vérification ne souligne pas « très »");
      await until(() => bubble.evaluate((el) => el.contains(document.activeElement)), "la bulle n'a pas le focus après la vérification");
      await page.keyboard.press("Escape");
      await until(async () => !(await bubble.count()), "Échap ne ferme pas la bulle");
      await editor.locator(".lt-issue").click();
      await until(() => bubble.getByText("Adverbe peu utile.").isVisible(), "un clic sur le passage souligné n'ouvre pas sa bulle");
    },
  },
  {
    name: "LanguageTool Premium : vérification pendant la frappe (paragraphe modifié seulement) et tout le livre ; l'API gratuite ne propose ni l'une ni l'autre",
    async run(h) {
      const { page } = h;
      const sent = [];
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages"))
          localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", languageTool: { server: "premium", username: "eddy@example.com", key: "cle", live: true } }));
      });
      await page.route("https://api.languagetoolplus.com/v2/check", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const body = new URLSearchParams(route.request().postData() ?? "");
        const text = body.get("text") ?? "";
        sent.push({ text, key: body.get("apiKey") });
        const matches = [];
        for (const word of ["aller", "pluit"]) {
          let i = text.indexOf(word);
          while (i >= 0) {
            matches.push({ message: "Faute.", offset: i, length: word.length, replacements: [{ value: word === "aller" ? "allé" : "pluie" }], rule: { id: word, issueType: "misspelling" } });
            i = text.indexOf(word, i + 1);
          }
        }
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ matches }) });
      });
      await h.create("En direct");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("La pluie");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("Premier paragraphe sans souci.");
      await until(() => sent.length >= 1, "le premier paragraphe n'est pas relu après la pause", 12_000);
      await page.keyboard.press("Enter");
      await page.keyboard.type("Elle est aller sous la pluit.");
      // Rien n'est envoyé pendant la frappe ; après la pause, les remarques arrivent seules, sans ouvrir la bulle.
      await until(async () => (await editor.locator(".lt-issue").count()) === 2, "la vérification pendant la frappe ne souligne rien", 12_000);
      assert(!(await page.locator(".lt-bubble").count()), "la bulle s'est ouverte toute seule pendant la frappe");
      assert(sent.every((x) => x.key === "cle"), "la clé du compte Premium n'est pas envoyée");
      const last = sent.at(-1).text;
      assert(last.includes("Elle est aller sous la pluit.") && !last.includes("Premier paragraphe"), `seul le paragraphe modifié devait partir : ${JSON.stringify(last)}`);
      // Corrigé à la main : le soulignement part tout de suite.
      await editor.locator(".lt-issue").first().click();
      await until(() => page.locator(".lt-bubble").isVisible(), "un clic n'ouvre pas la bulle");
      await page.getByRole("button", { name: "Remplacer par allé" }).click();
      await until(async () => (await editor.innerText()).includes("Elle est allé sous"), "la correction n'est pas entrée");
      await until(async () => (await editor.locator(".lt-issue").count()) === 1, "la remarque corrigée reste soulignée");
      // Tout le livre : une seconde scène, vérifiée avec la première.
      await page.keyboard.press("Escape");
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Effacer les soulignements de LanguageTool" }).click();
      await until(async () => (await editor.locator(".lt-issue").count()) === 0, "« Effacer les soulignements » n'efface rien");
      const before = sent.length;
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Vérifier tout le livre avec LanguageTool" }).click();
      await until(async () => (await editor.locator(".lt-issue").count()) === 1, "« Vérifier tout le livre » ne souligne pas « pluit »");
      assert(sent.slice(before).some((x) => x.text.includes("Premier paragraphe") && x.text.includes("pluit")), "tout le livre n'a pas été envoyé");
      // API gratuite : ni pendant la frappe, ni tout le livre.
      await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("cosmos:reglages") ?? "{}");
        localStorage.setItem("cosmos:reglages", JSON.stringify({ ...raw, languageTool: { server: "public", live: true } }));
      });
      await h.reloadAndOpen();
      await h.view(4);
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await until(() => page.getByRole("menuitem", { name: "Vérifier la scène avec LanguageTool" }).isVisible(), "la vérification de la scène a disparu");
      assert(!(await page.getByRole("menuitem", { name: "Vérifier tout le livre avec LanguageTool" }).count()), "« tout le livre » est proposé avec l'API gratuite");
      await page.keyboard.press("Escape");
      const count = sent.length;
      await page.locator(".ProseMirror[contenteditable=true]").first().click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Encore aller.");
      await h.wait(3500);
      assert(sent.length === count, "l'API gratuite a reçu une vérification pendant la frappe");
    },
  },
  {
    name: "LanguageTool dans le scénario : seuls l'action et le dialogue sont relus",
    async run(h) {
      const { page } = h;
      const sent = [];
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", languageTool: { server: "public" } }));
      });
      await page.route("https://api.languagetool.org/v2/check", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        sent.push(new URLSearchParams(route.request().postData() ?? "").get("text") ?? "");
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ matches: [] }) });
      });
      await h.create("Le Quai", "scenario");
      await h.view(4);
      const editor = page.locator(".sp-editor");
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("INT. QUAI - NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La pluie tombe sur le quai.");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await page.keyboard.type("MARC");
      await page.keyboard.press("Enter");
      await page.keyboard.type("On rentre ?");
      await h.wait(400);
      await page.locator(".sp-option").getByRole("button", { name: "Plus d’actions" }).or(page.getByRole("button", { name: "Plus d’actions" }).last()).first().click();
      await page.getByRole("menuitem", { name: "Vérifier la scène avec LanguageTool" }).click();
      await until(() => page.getByText("LanguageTool n’a rien relevé dans cette scène.").isVisible(), "la fin de la vérification n'est pas annoncée");
      const text = sent.at(-1) ?? "";
      assert(text.includes("La pluie tombe sur le quai."), `l'action n'a pas été envoyée : ${JSON.stringify(text)}`);
      assert(!text.includes("INT. QUAI") && !text.includes("MARC"), `l'en-tête ou le nom du personnage ont été envoyés : ${JSON.stringify(text)}`);
    },
  },
  {
    name: "synonymes : Ctrl+Alt+Y sur un mot du manuscrit, le dictionnaire se télécharge, un clic remplace le mot",
    async run(h) {
      const { page } = h;
      // Le site de MondoWrite est simulé (le réseau extérieur est coupé) : liste, puis dictionnaire vérifié par SHA-256.
      const body = JSON.stringify({ marcher: [["avancer", "cheminer"]] });
      const manifest = JSON.stringify({ thesaurus: [{ lang: "fr", file: "fr.json", size: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") }] });
      const cors = { "access-control-allow-origin": "*" };
      await page.route("https://mondowrite.app/thesaurus/thesaurus.json", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: manifest }));
      await page.route("https://mondowrite.app/thesaurus/fr.json", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: cors, body }));
      await h.create("Synonymes");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Marche");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("Elle marchait vite");
      // Le curseur se place dans « marchait » (8 lettres depuis « Elle ») ; on le vérifie avant de demander les
      // synonymes, la machine chargée pouvant ralentir les touches.
      await until(async () => {
        await page.keyboard.press("Home");
        for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
        return (await page.evaluate(() => getSelection()?.anchorOffset)) === 8;
      }, "le curseur n'est pas dans « marchait »");
      await h.wait(200); // ProseMirror lit la sélection du navigateur après coup
      await page.keyboard.press("Control+Alt+y");
      await until(() => page.locator(".synonyms-panel .synonyms-list button").count(), "la fenêtre des synonymes n'a rien proposé");
      const first = await page.locator(".synonyms-panel .synonyms-list button").first().innerText();
      await page.locator(".synonyms-panel .synonyms-list button").first().click();
      await until(async () => !(await page.locator(".synonyms-panel").count()), "la fenêtre est restée ouverte");
      await until(async () => (await editor.innerText()).includes(`Elle ${first} vite`), `le mot n'a pas été remplacé par « ${first} » : ${await editor.innerText()}`);
    },
  },
  {
    name: "noms : « Proposer un nom… » du menu d'une carte Personnage renomme la carte",
    async run(h) {
      const { page } = h;
      await h.create("Noms");
      const id = await h.newCard("Qui");
      await h.node(id).locator(".card-type").click();
      await page.getByRole("option", { name: "Personnage", exact: true }).click();
      await until(() => h.node(id).locator(".card.type-personnage").count(), "la carte n'est pas devenue Personnage");
      await h.node(id).locator(".card-actions button").first().click();
      await page.getByRole("menuitem", { name: "Proposer un nom…" }).click();
      await until(() => page.locator(".names-panel .names-pick").count(), "aucun nom proposé");
      const name = await page.locator(".names-panel .names-pick").first().innerText();
      await page.locator(".names-panel .names-pick").first().click();
      await until(async () => (await h.cardList()).some((c) => c.title === name), `la carte n'a pas pris le nom « ${name} »`);
    },
  },
  {
    name: "point de vue (1.13.0) : narrateur créé depuis le Manuscrit, annulé, rétabli, vu dans la Bible et sur le canevas",
    async run(h) {
      const { page } = h;
      await h.create("Point de vue");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le réveil");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const pill = page.getByRole("button", { name: /^Point de vue de la scène « Le réveil »/ });
      await pill.waitFor();
      assert((await pill.getAttribute("aria-label")).endsWith("Aucun"), "la scène a déjà un point de vue");
      await pill.click();
      const field = page.getByRole("combobox", { name: "Chercher ou créer un personnage" });
      await until(() => field.evaluate((el) => el === document.activeElement), "le champ du menu n'a pas le focus");
      await page.keyboard.type("Ethan");
      await until(() => page.getByRole("option", { name: "Créer « Ethan »" }).isVisible(), "pas d'option pour créer le personnage");
      await page.keyboard.press("Enter");
      await until(async () => (await pill.getAttribute("aria-label")).endsWith("Ethan"), "le point de vue n'est pas Ethan");
      await until(() => pill.evaluate((el) => el === document.activeElement), "le focus n'est pas revenu à la pastille");
      await h.saved((f) => {
        const cards = Object.entries(f).filter(([k]) => k.startsWith("cartes/")).map(([, v]) => v);
        const ethan = cards.find((c) => c.includes("type: personnage") && c.includes('title: "Ethan"'));
        const id = ethan?.match(/^id: (\S+)/m)?.[1];
        return id && cards.some((c) => c.includes("type: scene") && c.includes(`"pov":"${id}"`));
      }, "le point de vue n'a pas été enregistré dans la fiche de la scène");
      // Une étape d'historique pour le personnage créé et choisi.
      await page.keyboard.press("Control+z");
      await until(async () => (await pill.getAttribute("aria-label")).endsWith("Aucun"), "Annuler n'a pas retiré le point de vue");
      await page.keyboard.press("Control+Shift+z");
      await until(async () => (await pill.getAttribute("aria-label")).endsWith("Ethan"), "Rétablir n'a pas remis le point de vue");
      // Bible : « Narrateur de 1 scène », qui ouvre la scène dans le Manuscrit.
      await h.view(3);
      await page.locator(".bible-toc .toc-part-button", { hasText: "Personnages" }).first().click();
      const narrator = page.getByRole("button", { name: /Narrateur de 1 scène/ });
      await narrator.first().waitFor();
      await narrator.first().click();
      await page.getByRole("button", { name: "Ouvrir la scène « Le réveil »" }).click();
      await until(() => page.getByRole("button", { name: /^Point de vue de la scène « Le réveil »/ }).isVisible(), "la scène ne s'ouvre pas dans le Manuscrit");
      // Canevas : la carte Scène montre son narrateur, aussi après rechargement.
      await h.view(1);
      await until(() => page.locator(".card.type-scene .pov-picker.is-set").first().isVisible(), "le narrateur n'est pas sur la carte Scène");
      await h.reloadAndOpen();
      await until(async () => ((await page.locator(".card.type-scene .pov-name").first().textContent()) ?? "").includes("Ethan"), "après rechargement, la carte a perdu son narrateur");
    },
  },
  {
    name: "versions d'une scène (1.13.0) : garder, réécrire, comparer, revenir, retrouver après rechargement",
    async run(h) {
      const { page } = h;
      await h.create("Versions");
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").first().fill("Le réveil");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await h.view(4);
      const editor = page.locator(".ms-page .ProseMirror");
      await editor.click();
      await page.keyboard.type("Le réveil sonne à six heures et Ethan rêve encore de la mer.");
      await h.wait(400);
      // Cmd/Ctrl + Alt + S : la fenêtre s'ouvre, le titre de la version a le focus.
      await page.keyboard.press("Control+Alt+s");
      const dialog = page.locator(".app-dialog.is-versions");
      const title = dialog.getByLabel("Titre de la version (facultatif)");
      await until(() => title.evaluate((el) => el === document.activeElement), "le titre de la version n'a pas le focus");
      await page.keyboard.type("Avec le rêve");
      await page.keyboard.press("Enter");
      const items = dialog.locator(".versions-item");
      await until(async () => (await items.count()) === 1, "la version n'apparaît pas dans la liste");
      await until(async () => ((await dialog.locator(".versions-text").textContent()) ?? "").includes("rêve encore de la mer"), "le texte de la version n'est pas affiché");
      await dialog.getByRole("button", { name: "Fermer" }).click();
      // Réécrire, puis comparer avec le texte actuel.
      await editor.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.type("Le réveil sonne à six heures et Ethan se lève aussitôt.");
      await h.wait(400);
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: /^Versions de la scène/ }).click();
      await until(async () => (await items.count()) === 1, "la liste des versions n'est pas relue");
      await dialog.getByLabel("Comparer avec").selectOption("current");
      await until(() => dialog.locator(".versions-text del", { hasText: "rêve" }).first().isVisible(), "les mots retirés ne sont pas barrés");
      await until(() => dialog.locator(".versions-text ins", { hasText: "lève" }).first().isVisible(), "les mots ajoutés ne sont pas soulignés");
      await until(async () => /mots ajoutés, \d+ retirés/.test((await dialog.locator(".versions-summary").textContent()) ?? ""), "pas de résumé de la comparaison");
      // Revenir : le texte d'avant devient une version, le texte gardé revient dans la page.
      await dialog.getByRole("button", { name: "Revenir à cette version" }).click();
      await until(async () => (await items.count()) === 2, "le texte d'avant n'a pas été gardé en version");
      await dialog.getByRole("button", { name: "Fermer" }).click();
      await until(async () => ((await editor.textContent()) ?? "").includes("rêve encore de la mer"), "le texte gardé n'est pas revenu dans la page");
      await h.saved((f) => (f[Object.keys(f).find((k) => k.startsWith("manuscrit/")) ?? ""] ?? "").includes("rêve encore"), "le texte remis n'a pas été enregistré");
      // Après rechargement : les deux versions sont toujours là, lues à la demande.
      await h.reloadAndOpen();
      await h.view(4);
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: /^Versions de la scène/ }).click();
      await until(async () => (await items.count()) === 2, "après rechargement, les versions ont disparu");
      assert((await dialog.locator(".versions-item-title").allTextContents()).some((x) => x.startsWith("Avant de revenir")), "la version d'avant n'a pas son titre");
    },
  },
  {
    name: "commentaires (1.13.0) : passage commenté au clavier, écrit, dans « À faire », résolu, supprimé puis rétabli, relu après rechargement",
    async run(h) {
      const { page } = h;
      await h.create("Commentaires");
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").first().fill("Le réveil");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await h.view(4);
      const editor = page.locator(".ms-page .ProseMirror");
      await editor.click();
      await page.keyboard.type("Le réveil sonne à six heures et Ethan rêve encore.");
      await h.wait(300);
      // Sélectionner « six heures » à la souris, puis Ctrl + Alt + M.
      const box = await page.evaluate(() => {
        const p = document.querySelector(".ms-page .ProseMirror p");
        const node = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes("six heures"));
        const at = node.textContent.indexOf("six heures");
        const r = document.createRange();
        r.setStart(node, at);
        r.setEnd(node, at + "six heures".length);
        const { left, right, top, bottom } = r.getBoundingClientRect();
        return { left, right, y: (top + bottom) / 2 };
      });
      await page.mouse.move(box.left + 1, box.y);
      await page.mouse.down();
      await page.mouse.move(box.right - 1, box.y, { steps: 5 });
      await page.mouse.up();
      await until(() => page.getByRole("button", { name: /^Commenter le passage/ }).isVisible(), "pas de bouton Commenter dans la barre de mise en forme");
      assert((await page.locator(".format-bar").getByRole("button", { name: /^À reprendre/ }).count()) === 0, "le bouton « à reprendre » est encore dans la barre (Commenter le remplace)");
      assert(await page.locator(".format-bar").getByRole("button", { name: /^Gras/ }).isVisible(), "à la souris, la barre a perdu ses mises en forme");
      await page.keyboard.press("Control+Alt+m");
      const field = page.getByRole("textbox", { name: "Commentaire sur « six heures »" });
      await until(() => field.evaluate((el) => el === document.activeElement), "le champ du commentaire n'a pas le focus");
      await page.keyboard.type("Trop tôt pour lui ?");
      await until(() => page.locator('.ms-page [data-comment]', { hasText: "six heures" }).isVisible(), "le passage n'est pas marqué dans le texte");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("commentaires/") && v.includes("Trop tôt pour lui ?") && v.includes("> six heures")), "le commentaire n'est pas enregistré dans commentaires/");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && /<span data-comment="[^"]+">six heures<\/span>/.test(v)), "la marque n'est pas enregistrée dans le manuscrit");
      // « À faire » le compte, et y mène.
      await page.keyboard.press("Control+Shift+l");
      await until(() => page.getByRole("button", { name: /Trop tôt pour lui/ }).isVisible(), "le commentaire n'est pas dans « À faire »");
      await page.getByRole("button", { name: /Trop tôt pour lui/ }).click();
      await until(async () => (await page.evaluate(() => window.getSelection()?.toString())) === "six heures", "« À faire » ne sélectionne pas le passage commenté");
      // Résoudre, rouvrir.
      const item = page.locator(".comment-item").first();
      await item.getByRole("button", { name: "Résoudre" }).click();
      await until(() => page.getByText("Résolus · 1").isVisible(), "le commentaire résolu n'est pas replié");
      await page.getByText("Résolus · 1").click();
      await page.getByRole("button", { name: "Rouvrir" }).click();
      // Supprimer (menu ⋯), puis Annuler : la marque revient.
      await page.locator(".comment-item").first().getByRole("button", { name: "Autres actions sur le commentaire" }).click();
      await page.getByRole("menuitem", { name: "Supprimer le commentaire" }).click();
      await until(async () => (await page.locator(".ms-page [data-comment]").count()) === 0, "la marque est restée après la suppression");
      await page.getByRole("button", { name: "Annuler", exact: true }).click();
      await until(async () => (await page.locator(".ms-page [data-comment]").count()) === 1, "Annuler n'a pas remis la marque");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("commentaires/") && v.includes("Trop tôt pour lui ?")), "le commentaire rétabli n'est pas enregistré");
      // Après rechargement : le commentaire est relu, un clic dans le passage l'ouvre.
      await h.reloadAndOpen();
      await h.view(4);
      await page.locator('.ms-page [data-comment]').click();
      await until(() => page.getByRole("textbox", { name: "Commentaire sur « six heures »" }).isVisible(), "après rechargement, un clic dans le passage n'ouvre pas son commentaire");
      assert((await page.getByRole("textbox", { name: "Commentaire sur « six heures »" }).inputValue()) === "Trop tôt pour lui ?", "le texte du commentaire a changé");
    },
  },
  {
    name: "commentaires dans un scénario (1.13.0) : un élément commenté, noté dans le Fountain, relu après rechargement",
    async run(h) {
      const { page } = h;
      await h.create("Script commenté", "scenario");
      await h.view(4);
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.click();
      await page.keyboard.type("INT. PHARE - NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Inès monte les marches en courant.");
      await h.wait(500);
      await page.locator(".sp-action", { hasText: "en courant" }).click();
      await page.keyboard.press("Control+Alt+m");
      const field = page.getByRole("textbox", { name: /^Commentaire sur « Inès monte/ });
      await until(() => field.evaluate((el) => el === document.activeElement), "le champ du commentaire n'a pas le focus");
      await page.keyboard.type("Pourquoi en courant ?");
      await h.saved((f) => /Inès monte les marches en courant\. \[\[cosmos:comment:[A-Za-z0-9_-]+\]\]/.test(f["scenario.fountain"] ?? ""), "la note du commentaire n'est pas dans le Fountain");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("commentaires/") && v.includes("Pourquoi en courant ?")), "le commentaire n'est pas enregistré");
      await h.reloadAndOpen();
      await h.view(4);
      await page.locator(".sp-action", { hasText: "en courant" }).click();
      await until(async () => (await page.getByRole("textbox", { name: /^Commentaire sur « Inès monte/ }).inputValue().catch(() => "")) === "Pourquoi en courant ?", "après rechargement, le commentaire ne s'ouvre pas depuis son élément");
      // Le PDF et l'écran n'impriment jamais la note.
      assert(!((await editor.textContent()) ?? "").includes("cosmos:comment"), "la note du commentaire paraît dans le texte");
    },
  },
  {
    name: "notes de bas de page (1.13.0) : posée au clavier, écrite, enregistrée en [^1], rouverte au clic, supprimée",
    async run(h) {
      const { page } = h;
      await h.create("Notes");
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").first().fill("Le réveil");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await h.view(4);
      await page.locator(".ms-page .ProseMirror").click();
      await page.keyboard.type("Le réveil sonne à six heures");
      await page.keyboard.press("Control+Alt+f");
      const field = page.getByRole("textbox", { name: "Note 1" });
      await until(() => field.evaluate((el) => el === document.activeElement), "le champ de la note n'a pas le focus");
      await page.keyboard.type("Heure d’été, en juin.");
      await page.keyboard.press("Enter");
      await until(async () => !(await field.isVisible().catch(() => false)), "la fenêtre de la note ne se ferme pas avec Entrée");
      await page.keyboard.type(" et Ethan rêve encore.");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && v.includes("six heures[^1] et Ethan rêve encore.") && v.includes("[^1]: Heure d’été, en juin.")), "la note n'est pas enregistrée en [^1]");
      // Rechargement : l'appel est relu, un clic rouvre sa note.
      await h.reloadAndOpen();
      await h.view(4);
      await page.locator(".ms-page .footnote-ref").click();
      await until(async () => (await page.getByRole("textbox", { name: "Note 1" }).inputValue().catch(() => "")) === "Heure d’été, en juin.", "après rechargement, la note ne se rouvre pas");
      // Supprimer la note : l'appel disparaît du texte.
      await page.getByRole("button", { name: "Supprimer la note" }).click();
      await until(async () => (await page.locator(".ms-page .footnote-ref").count()) === 0, "l'appel est resté après la suppression");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && v.includes("six heures et Ethan") && !v.includes("[^")), "la suppression de la note n'est pas enregistrée");
    },
  },
  {
    name: "point de vue, lot 2 : narrateurs posés dans le Plan, ruban coloré en plan libre, filtres du Manuscrit et du canevas",
    async run(h) {
      const { page } = h;
      await h.create("Choral");
      await h.view(2);
      for (const title of ["Le réveil", "La rencontre", "Le parc"]) {
        await page.getByPlaceholder("Nouvelle scène…").first().fill(title);
        await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
        await h.wait(150);
      }
      const choose = async (scene, name) => {
        await page.getByRole("button", { name: new RegExp(`^Point de vue de la scène « ${scene} »`) }).click();
        const option = page.getByRole("option", { name, exact: true });
        if (await option.count()) await option.click();
        else {
          await page.keyboard.type(name);
          await page.getByRole("option", { name: `Créer « ${name} »` }).click();
        }
        await until(async () => (await page.getByRole("button", { name: new RegExp(`^Point de vue de la scène « ${scene} »`) }).getAttribute("aria-label")).endsWith(name), `${scene} : point de vue absent`);
      };
      await choose("Le réveil", "Ethan");
      await choose("La rencontre", "Violette");
      await choose("Le parc", "Ethan");
      // Manuscrit en plan libre : le ruban apparaît pour les points de vue, avec sa légende.
      await h.view(4);
      await until(async () => (await page.locator(".ribbon.is-pov .ribbon-scene.has-pov").count()) === 3, "le ruban ne colore pas les trois scènes");
      const legend = await page.locator(".ribbon-legend li").allInnerTexts();
      assert(legend.length === 2 && legend[0].startsWith("Ethan") && legend[0].endsWith("2"), `légende inattendue : ${JSON.stringify(legend)}`);
      // Filtre « Ses scènes en point de vue » : la scène de Violette est repliée, les flèches sautent par-dessus.
      await page.getByLabel("Ses scènes en point de vue").selectOption({ label: "Ethan (2)" });
      await until(async () => (await page.locator(".ms-fold").count()) === 1, "la scène de Violette n'est pas repliée");
      assert((await page.locator(".ms-fold").innerText()).includes("1 autre scène"), "libellé de la ligne repliée");
      await page.locator(".ms-scenes button", { hasText: "Le réveil" }).click();
      await page.getByRole("button", { name: "Scène suivante" }).click();
      await until(async () => (await page.locator("input.ms-title").inputValue()) === "Le parc", "la flèche ne saute pas à la scène suivante d'Ethan");
      // Canevas : filtre sur Violette, une seule scène reste.
      await h.view(1);
      await page.getByRole("button", { name: "Filtrer les cartes", exact: true }).click();
      await page.getByLabel("Scènes en point de vue").selectOption({ label: "Violette (1)" });
      const visibleScenes = () => page.locator(".react-flow__node-card .card.type-scene").evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
      await until(async () => (await visibleScenes()) === 1, "le filtre du canevas laisse d'autres scènes");
      // Le bandeau est caché tant que le panneau du filtre est ouvert : Échap le ferme.
      await page.keyboard.press("Escape");
      await until(() => page.locator(".filter-banner", { hasText: /scènes racontées par Violette/ }).isVisible(), "bandeau du filtre absent");
    },
  },
  {
    name: "corbeille : Suppr met la carte à la corbeille, Ctrl+Z la remet avec son fil",
    async run(h) {
      const { page } = h;
      await h.create("Corbeille");
      const a = await h.newCard("Inès");
      const b = await h.newCard("Yann");
      // Fil par une mention @ : plus sûr qu'un glisser, déjà testé plus haut.
      await h.node(a).locator(".card-title").click();
      await page.keyboard.press("Enter");
      await page.keyboard.type("Elle aime @Yan");
      await until(() => page.getByRole("option", { name: /Yann/ }).first().isVisible(), "le menu des mentions ne propose pas Yann");
      await page.keyboard.press("Enter");
      await until(async () => (await h.edges().count()) === 1, "la mention n'a pas tiré de fil");
      await h.pane();
      // Choisir la carte par sa poignée (pas dans un champ), puis Suppr.
      await h.node(b).click({ position: { x: 120, y: 4 } });
      await until(() => h.node(b).evaluate((el) => el.classList.contains("selected")), "la carte n'est pas sélectionnée");
      await page.keyboard.press("Delete");
      await until(async () => (await h.node(b).count()) === 0, "Suppr n'a pas retiré la carte");
      assert((await h.edges().count()) === 0, "le fil de la carte supprimée est resté");
      await until(() => page.locator(".trash-notice").isVisible(), "pas de message « dans la corbeille »");
      await h.saved((f) => Object.keys(f).some((k) => k === `corbeille/${b}.md`), "la carte n'est pas dans corbeille/");
      await h.pane();
      await page.keyboard.press("Control+z");
      await until(async () => (await h.node(b).count()) === 1, "Ctrl+Z n'a pas remis la carte");
      await until(async () => (await h.edges().count()) === 1, "Ctrl+Z a remis la carte sans son fil");
      await h.saved((f) => !(`corbeille/${b}.md` in f) && `cartes/${b}.md` in f, "la carte remise n'est pas revenue dans cartes/");
    },
  },
  {
    name: "collage depuis Word : un paragraphe du scénario reste d'un seul tenant",
    async run(h) {
      const { page } = h;
      // Word coupe le code source HTML de ses paragraphes par de vrais retours à la ligne.
      const word = '<html><body><p class=MsoNormal>Il pleuvait sur la ville depuis\r\ntrois jours, et personne ne\r\nsortait plus.</p></body></html>';
      const paste = (selector) =>
        page.evaluate(
          ([sel, html]) => {
            const el = document.querySelector(sel);
            const data = new DataTransfer();
            data.setData("text/html", html);
            data.setData("text/plain", "Il pleuvait sur la ville depuis trois jours, et personne ne sortait plus.");
            el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
          },
          [selector, word],
        );
      await h.create("Collage", "scenario");
      await h.view(4);
      const editor = page.getByRole("textbox", { name: "Texte du scénario" });
      await editor.click();
      await paste(".sp-editor");
      const text = await until(() => page.evaluate(() => [...document.querySelectorAll(".sp-editor > [data-el]")].map((e) => e.textContent).join("|")).then((t) => (t.includes("pleuvait") ? t : null)), "le collage n'arrive pas dans le scénario");
      assert(!/[\r\n]/.test(text) && text.includes("depuis trois jours, et personne ne sortait"), `scénario coupé : ${JSON.stringify(text)}`);
    },
  },
  {
    name: "scénario : en-tête, action et réplique donnent leurs cartes Scène, Décor et Personnage",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      const editor = page.getByRole("textbox", { name: "Texte du scénario" });
      await editor.click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne.");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await page.keyboard.type("Inès");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Tu viens ?");
      const kinds = await page.evaluate(() => [...document.querySelectorAll(".sp-editor > [data-el]")].map((e) => e.dataset.el));
      assert(JSON.stringify(kinds) === JSON.stringify(["sceneHeading", "action", "character", "dialogue"]), `éléments : ${kinds.join(", ")}`);
      await h.wait(500);
      await h.view(1);
      const cards = await until(async () => {
        const list = await h.cardList();
        return list.length >= 3 ? list : null;
      }, "les cartes du scénario n'apparaissent pas sur le canevas");
      const has = (type, title) => cards.some((c) => c.type === type && c.title === title);
      assert(has("scene", "INT. PHARE – NUIT"), `pas de carte Scène : ${JSON.stringify(cards)}`);
      assert(has("lieu", "Phare"), `pas de carte Décor : ${JSON.stringify(cards)}`);
      assert(has("personnage", "Inès"), `pas de carte Personnage : ${JSON.stringify(cards)}`);
      assert(cards.length === 3, `3 cartes attendues : ${JSON.stringify(cards)}`);
      await h.saved((f) => /INT\. PHARE – NUIT \[\[cosmos:/.test(f["scenario.fountain"] ?? ""), "le scénario n'a pas été enregistré avec le lien de sa scène");
    },
  },
  {
    name: "actes et séquences (#140, #142) : « + Séquence » regroupe les scènes, bloc repliable du séquencier, renommée, cadre du canevas",
    async run(h) {
      const { page } = h;
      await h.create("Séquences", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      for (const [head, act] of [["INT. PHARE – NUIT", "La lanterne tourne."], ["EXT. QUAI – NUIT", "La pluie."], ["INT. CUISINE – JOUR", "Le café."]]) {
        await page.keyboard.type(head);
        await page.keyboard.press("Enter");
        await page.keyboard.type(act);
        await page.keyboard.press("Enter");
      }
      // Le curseur dans la première scène : la séquence se pose au-dessus de son en-tête.
      await page.locator(".sp-editor [data-el=action]").first().click();
      await page.locator(".sp-bar").getByRole("button", { name: "+ Séquence" }).click();
      await until(() => page.locator('.sp-editor [data-series="seq"]').count(), "la ligne Séquence n'apparaît pas dans la feuille");
      await h.saved((f) => /^## Séquence 1 \[\[cosmos:beat:u1\]\] \[\[cosmos:seq:[A-Za-z0-9_-]+\]\]\s*\n+\s*INT\. PHARE/m.test(f["scenario.fountain"] ?? ""), "la séquence n'est pas enregistrée au-dessus de la première scène");
      await until(() => page.locator(".sp-scene-group.is-seq").count(), "la liste des scènes ne montre pas la séquence");
      await h.view(2);
      // #148 : la séquence est aussi une case de la structure, montrée comme elle (« Séquence 1 sur 1 »).
      const row = page.locator(".sq-section.sq-part.is-beat");
      await row.waitFor();
      assert(/3 scènes/.test(await row.innerText()), `la séquence ne compte pas trois scènes : ${await row.innerText()}`);
      assert(/Séquence 1 sur 1/i.test(await row.innerText()), `pas de rang de séquence : ${await row.innerText()}`);
      await row.locator("input").fill("La nuit");
      await row.locator("input").press("Enter");
      await h.saved((f) => /^## La nuit \[\[cosmos:beat:u1\]\] \[\[cosmos:seq:/m.test(f["scenario.fountain"] ?? ""), "le titre de la séquence n'est pas enregistré");
      await row.getByRole("button", { name: /^Replier/ }).click();
      await until(async () => (await page.locator(".sq-scene").count()) === 0, "replier la séquence ne cache pas ses scènes");
      await row.getByRole("button", { name: /^Déplier/ }).click();
      await h.view(1);
      await page.getByRole("button", { name: "Organiser le canevas" }).first().click();
      await until(async () => (await page.locator(".frame-title").evaluateAll((els) => els.map((e) => e.value))).includes("La nuit"), "pas de cadre pour la séquence après « Organiser »");
      await until(async () => (await page.locator(".frame-kicker").allInnerTexts()).some((x) => /Séquence 1 sur 1/i.test(x)), "le cadre de la séquence n'a pas son rang");
    },
  },
  {
    name: "actes et séquences = structure (#148) : reprise d'une série, l'acte contient ses séquences sur le canevas, rang « Séquence 1 sur 2 »",
    async run(h) {
      const { page } = h;
      await h.create("Série", "scenario");
      await h.wait(1200);
      // Un fichier d'avant : actes et séquences sans note de case dans l'épisode 1, une structure livrée dans le 2.
      const fountain = [
        "# Saison 1 [[cosmos:season:s1]]",
        "## Pilote [[cosmos:episode:e1]]",
        "### Acte 1 [[cosmos:act:a1]]",
        "#### Séquence 1 [[cosmos:seq:q1]]",
        ".INT. PHARE - NUIT",
        "La lanterne.",
        "#### Séquence 2 [[cosmos:seq:q2]]",
        ".EXT. QUAI - NUIT",
        "La pluie.",
        "## Tempête [[cosmos:episode:e2]]",
        "### Ouverture [[cosmos:beat:e_teaser]]",
        ".INT. CUISINE - JOUR",
        "Le café.",
        "",
      ].join("\n\n");
      await page.evaluate((text) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith("cosmos:projet:"));
        const files = JSON.parse(localStorage.getItem(key));
        files["scenario.fountain"] = text;
        localStorage.setItem(key, JSON.stringify(files));
      }, fountain);
      await h.reloadAndOpen();
      await h.saved((f) => /### Acte 1 \[\[cosmos:beat:u\d+\]\] \[\[cosmos:act:a1\]\]/.test(f["scenario.fountain"] ?? "") && /#### Séquence 2 \[\[cosmos:beat:u\d+\]\] \[\[cosmos:seq:q2\]\]/.test(f["scenario.fountain"] ?? ""), "les actes et séquences ne sont pas devenus des cases");
      // L'épisode 2 garde sa structure livrée (il n'a ni acte ni séquence).
      assert(/\[\[cosmos:beat:e_teaser\]\]/.test((await h.files())["scenario.fountain"] ?? ""), "la structure livrée de l'épisode 2 a changé");
      await page.getByRole("button", { name: "Organiser le canevas" }).first().click();
      await until(async () => (await page.locator(".frame-kicker").allInnerTexts()).some((x) => /Séquence 1 sur 2/i.test(x)), "le cadre de la séquence 1 n'a pas son rang");
      // Le cadre de l'acte contient ceux de ses séquences.
      const inside = await page.evaluate(() => {
        const frames = [...document.querySelectorAll(".react-flow__node-frame")].map((n) => ({ title: n.querySelector(".frame-title")?.value, r: n.getBoundingClientRect() }));
        const act = frames.find((f) => f.title === "Acte 1");
        const seq = frames.find((f) => f.title === "Séquence 2");
        return !!act && !!seq && seq.r.left >= act.r.left && seq.r.right <= act.r.right && seq.r.top >= act.r.top && seq.r.bottom <= act.r.bottom;
      });
      assert(inside, "le cadre de la séquence 2 n'est pas dans celui de l'acte 1");
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/structure-148.png` });
      // « + Séquence » dans l'épisode 2 : sa structure livrée devient celle de l'auteur, la séquence une sous-case.
      await h.view(4);
      await page.locator(".sp-editor [data-el=action]", { hasText: "Le café." }).click();
      await page.locator(".sp-bar").getByRole("button", { name: "+ Séquence" }).click();
      await h.saved((f) => {
        const text = f["scenario.fountain"] ?? "";
        return !/e_teaser/.test(text) && /### Pré-générique \[\[cosmos:beat:u\d+\]\]/.test(text) && /#### Séquence 1 \[\[cosmos:beat:u\d+\]\] \[\[cosmos:seq:[A-Za-z0-9_-]+\]\]\s*\n+\s*\.?INT\. CUISINE/.test(text);
      }, "la structure livrée de l'épisode 2 n'est pas devenue celle de l'auteur avec la séquence dessous");
      assert(/d’après Épisode de série/.test(JSON.stringify(JSON.parse((await h.files())["cosmos.json"]).plan?.scriptBeats ?? {})), "le nom « d'après » n'est pas gardé");
    },
  },
  {
    name: "structure livrée (#154) : choisir « Trois actes » annonce la séquence retirée ; Annuler la garde, Remplacer la retire",
    async run(h) {
      const { page } = h;
      await h.create("Remplacer", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      for (const [head, act] of [["INT. PHARE – NUIT", "La lanterne tourne."], ["EXT. QUAI – NUIT", "La pluie."]]) {
        await page.keyboard.type(head);
        await page.keyboard.press("Enter");
        await page.keyboard.type(act);
        await page.keyboard.press("Enter");
      }
      await page.locator(".sp-editor [data-el=action]").first().click();
      await page.locator(".sp-bar").getByRole("button", { name: "+ Séquence" }).click();
      await h.saved((f) => /\[\[cosmos:seq:/.test(f["scenario.fountain"] ?? ""), "la séquence n'est pas enregistrée");
      await h.view(2);
      const select = page.locator(".plan-template select").first();
      await select.selectOption("troisActes");
      const ask = page.getByRole("alertdialog");
      await until(() => ask.isVisible(), "pas de confirmation avant de retirer la séquence");
      assert(/1 séquence/.test(await ask.innerText()), `la confirmation ne compte pas la séquence : ${await ask.innerText()}`);
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/structure-154.png` });
      assert(await ask.getByRole("button", { name: "Annuler" }).evaluate((el) => el === document.activeElement), "« Annuler » n'a pas le focus");
      await ask.getByRole("button", { name: "Annuler" }).click();
      await h.wait(800);
      const kept = (await h.files())["scenario.fountain"] ?? "";
      assert(/\[\[cosmos:seq:/.test(kept) && !/c_setup|a_setup/.test(kept), `Annuler n'a pas tout gardé : ${kept}`);
      await select.selectOption("troisActes");
      await page.getByRole("alertdialog").getByRole("button", { name: "Remplacer" }).click();
      await h.saved((f) => !/\[\[cosmos:seq:/.test(f["scenario.fountain"] ?? "") && /\[\[cosmos:beat:a_/.test(f["scenario.fountain"] ?? ""), "la structure livrée n'a pas remplacé la séquence");
      assert(/La lanterne tourne\./.test((await h.files())["scenario.fountain"] ?? ""), "le texte des scènes a disparu");
    },
  },
  {
    name: "sections importées (#155) : proposées une fois comme actes et séquences, « Les lire ainsi » les transforme",
    async run(h) {
      const { page } = h;
      await h.create("Causality", "scenario");
      await h.wait(1200);
      const fountain = ["# Premier acte", "## Le réveil", ".INT. CHAMBRE - JOUR", "Elle dort.", "## La route", ".EXT. ROUTE - JOUR", "Il roule.", ""].join("\n\n");
      await page.evaluate((text) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith("cosmos:projet:"));
        const files = JSON.parse(localStorage.getItem(key));
        files["scenario.fountain"] = text;
        localStorage.setItem(key, JSON.stringify(files));
      }, fountain);
      await h.reloadAndOpen();
      await h.view(4);
      const ask = page.locator(".sp-sections-ask");
      await until(() => ask.isVisible(), "la proposition de lire les sections n'apparaît pas");
      assert(/3 sections/.test(await ask.innerText()), `mauvais décompte : ${await ask.innerText()}`);
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/sections-155-ask.png` });
      // Rien n'est écrit avant le clic.
      assert(!/cosmos:(act|seq)/.test((await h.files())["scenario.fountain"] ?? ""), "les sections ont changé sans clic");
      await ask.getByRole("button", { name: "Les lire ainsi" }).click();
      await h.saved((f) => {
        const text = f["scenario.fountain"] ?? "";
        return /^# Premier acte \[\[cosmos:beat:u\d+\]\] \[\[cosmos:act:/m.test(text) && /^## Le réveil \[\[cosmos:beat:u\d+\]\] \[\[cosmos:seq:/m.test(text) && /^## La route \[\[cosmos:beat:u\d+\]\] \[\[cosmos:seq:/m.test(text);
      }, "les sections ne sont pas devenues acte et séquences");
      await until(async () => (await ask.count()) === 0, "la proposition reste affichée");
      await until(() => page.locator('.sp-editor [data-series="act"]').count(), "la feuille ne montre pas l'acte");
    },
  },
  {
    name: "sections importées (#155) : « Non » ne change rien ; « Transformer en… » au double-clic et « + Séquence » sur la section la transforment",
    async run(h) {
      const { page } = h;
      await h.create("Highland", "scenario");
      await h.wait(1200);
      const fountain = ["# Ouverture", ".INT. CHAMBRE - JOUR", "Elle dort.", "# Départ", ".EXT. ROUTE - JOUR", "Il roule.", ""].join("\n\n");
      await page.evaluate((text) => {
        const key = Object.keys(localStorage).find((k) => k.startsWith("cosmos:projet:"));
        const files = JSON.parse(localStorage.getItem(key));
        files["scenario.fountain"] = text;
        localStorage.setItem(key, JSON.stringify(files));
      }, fountain);
      await h.reloadAndOpen();
      await h.view(4);
      const ask = page.locator(".sp-sections-ask");
      await until(() => ask.isVisible(), "la proposition n'apparaît pas");
      await ask.getByRole("button", { name: "Non, garder des sections" }).click();
      await until(async () => (await ask.count()) === 0, "la proposition reste affichée");
      const sections = page.locator('.sp-editor .sp-preserved[data-preserved="section"]');
      await sections.nth(1).dblclick();
      const menu = page.getByRole("group", { name: /Transformer « Départ »/ });
      await until(() => menu.isVisible(), "pas de menu « Transformer en… » au double-clic");
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/sections-155-menu.png` });
      await menu.getByRole("button", { name: "Acte", exact: true }).click();
      await h.saved((f) => /^# Départ \[\[cosmos:beat:u\d+\]\] \[\[cosmos:act:/m.test(f["scenario.fountain"] ?? ""), "« Départ » n'est pas devenu un acte");
      // Le curseur sur la première section : « + Séquence » la transforme, sans ligne de plus.
      await sections.nth(0).click();
      await page.locator(".sp-bar").getByRole("button", { name: "+ Séquence" }).click();
      await h.saved((f) => /^# Ouverture \[\[cosmos:beat:u\d+\]\] \[\[cosmos:seq:/m.test(f["scenario.fountain"] ?? ""), "« Ouverture » n'est pas devenue une séquence");
      assert((await sections.count()) === 2, `une ligne de plus a été créée : ${await sections.count()}`);
      await h.reloadAndOpen();
      await h.view(4);
      await h.wait(800);
      assert((await page.locator(".sp-sections-ask").count()) === 0, "la proposition revient après « Non »");
    },
  },
  {
    name: "séquence choisie dans la fiche (#141) : la liste de l'onglet Scène déplace la scène, Ctrl Z rend l'ordre",
    async run(h) {
      const { page } = h;
      await h.create("Places", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      for (const [head, act] of [["INT. PHARE – NUIT", "Un."], ["EXT. QUAI – NUIT", "Deux."], ["INT. CUISINE – JOUR", "Trois."]]) {
        await page.keyboard.type(head);
        await page.keyboard.press("Enter");
        await page.keyboard.type(act);
        await page.keyboard.press("Enter");
      }
      // Les cartes des scènes naissent un instant après la frappe (l'éditeur se recharge alors).
      await h.wait(800);
      await page.locator(".sp-editor [data-el=action]").first().click();
      await page.keyboard.press("Control+Alt+Shift+S");
      await page.locator(".sp-editor [data-el=action]").nth(1).click();
      await page.keyboard.press("Control+Alt+Shift+S");
      await until(async () => (await page.locator('.sp-editor [data-series="seq"]').count()) === 2, "les deux séquences ne sont pas posées");
      // Le curseur reste dans la scène où il était.
      await page.keyboard.type("Z");
      await until(async () => (await page.locator(".sp-editor [data-el=action]").nth(1).innerText()) === "Deux.Z", "le curseur n'est pas resté dans la scène");
      // Curseur dans la deuxième scène (QUAI), qui ouvre la séquence 2 : on la range dans la séquence 1, après CUISINE.
      await h.wait(500);
      await page.locator(".sp-editor [data-el=action]").nth(1).click();
      await until(async () => /QUAI/.test(await page.locator(".sp-side").first().innerText().catch(() => "")), "l'onglet Scène ne montre pas la scène du quai");
      // « Place de la scène » est masquée d'office (lot 17 ter) : on la montre par « Personnaliser le volet ».
      await page.locator(".sp-side .side-parts-customize").click();
      await page.locator(".side-parts-list label", { hasText: "Place de la scène" }).locator("input").check();
      await page.locator(".sp-side").getByRole("button", { name: "Terminé" }).click();
      const select = page.locator(".scene-place select").first();
      await select.waitFor();
      await select.selectOption({ label: "Séquence 1" });
      await h.saved((f) => /## Séquence 1[\s\S]*PHARE[\s\S]*QUAI[\s\S]*## Séquence 2/.test(f["scenario.fountain"] ?? ""), "la scène n'a pas rejoint la séquence 1");
      await h.view(1);
      await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+z");
      await h.saved((f) => /## Séquence 1[\s\S]*PHARE[\s\S]*## Séquence 2[\s\S]*QUAI/.test(f["scenario.fountain"] ?? ""), "Ctrl Z n'a pas rendu l'ordre d'avant");
    },
  },
  {
    name: "synopsis (#147) : montré sous l'en-tête sans changer les pages, lu seul dans sa fenêtre",
    async run(h) {
      const { page } = h;
      await h.create("Synopsis", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne.");
      await h.wait(800);
      await page.getByRole("button", { name: /^Ajouter un synopsis/ }).first().click();
      await page.keyboard.type("Inès veille seule.");
      await page.locator(".sp-editor [data-el=action]").first().click();
      await until(async () => (await page.locator(".sp-editor .sp-sceneHeading").first().getAttribute("data-synopsis")) === "Inès veille seule.", "l'en-tête ne porte pas son synopsis");
      const pagesBefore = await page.locator(".sp-statusbar, .sp-foot").first().innerText().catch(() => "");
      await page.locator(".sp-bar").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Afficher le synopsis sous l’en-tête" }).click();
      await until(() => page.locator(".screenplay.show-synopsis").count(), "l'option n'est pas posée sur la feuille");
      const shown = await page.evaluate(() => getComputedStyle(document.querySelector(".sp-sceneHeading[data-synopsis]"), "::before").content);
      assert(/Inès veille seule/.test(shown), `le synopsis n'est pas dessiné sous l'en-tête : ${shown}`);
      const pagesAfter = await page.locator(".sp-statusbar, .sp-foot").first().innerText().catch(() => "");
      assert(pagesBefore === pagesAfter, `les pages ont changé : ${pagesBefore} → ${pagesAfter}`);
      await page.locator(".sp-bar").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Lire le synopsis seul" }).click();
      await until(() => page.locator(".synopsis-row.is-scene", { hasText: "Inès veille seule." }).count(), "la fenêtre du synopsis ne montre pas la scène");
    },
  },
  {
    name: "fiche de scène (lot 17 bis) : qui parle dans Personnages, « Prépare… » tire le fil, numéros et couleurs sur le canevas",
    async run(h) {
      const { page } = h;
      await h.create("Fiche", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      for (const [head, who, line] of [["INT. PHARE – NUIT", "INÈS", "Il pleut."], ["EXT. QUAI – NUIT", "YANN", "Le bateau."]]) {
        await page.keyboard.type(head);
        await page.keyboard.press("Enter");
        await page.keyboard.type("Le vent.");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        await page.keyboard.type(who);
        await page.keyboard.press("Enter");
        await page.keyboard.type(line);
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
      }
      await h.wait(800);
      await page.locator(".sp-editor [data-el=action]").first().click();
      const pill = page.locator(".sp-side .scene-links .link-pill", { hasText: "INÈS" });
      await until(() => pill.count(), "le personnage qui parle n'est pas dans la rangée Personnages");
      assert(/1 réplique/.test(await pill.innerText()), `pas de nombre de répliques : ${await pill.innerText()}`);
      await page.locator(".sp-side .scene-setups").getByRole("button", { name: "Prépare…" }).click();
      await page.getByRole("searchbox", { name: "Chercher par numéro, titre ou synopsis" }).fill("2");
      await page.locator(".scene-setups-choices button", { hasText: "EXT. QUAI" }).click();
      await page.getByRole("textbox", { name: "Nom du lien (facultatif)" }).fill("le bateau");
      await page.getByRole("button", { name: "Relier", exact: true }).click();
      await h.saved((f) => /"setups"/.test(f["cosmos.json"] ?? "") && /le bateau/.test(f["cosmos.json"] ?? ""), "la préparation n'est pas enregistrée avec son nom");
      await until(() => page.locator(".sp-side .scene-setups-linklabel", { hasText: "le bateau" }).count(), "le nom du lien n'est pas montré");
      // Volet de droite (lot 17 ter) : une rubrique se replie par son en-tête, se masque par « Personnaliser le volet ».
      await page.locator(".sp-side .side-part-head", { hasText: "Synopsis" }).click();
      await until(async () => (await page.locator('.sp-side .side-part[data-part="synopsis"] .side-part-body').count()) === 0, "le synopsis ne se replie pas");
      await page.locator(".sp-side").getByRole("button", { name: "Personnaliser le volet" }).click();
      await page.locator(".side-parts-list label", { hasText: "Préparations" }).locator("input").uncheck();
      await until(async () => (await page.locator('.sp-side .side-part[data-part="setups"]').count()) === 0, "les préparations ne se masquent pas");
      assert(/"hidden":\["setups"\]/.test(await page.evaluate(() => localStorage.getItem("mondowrite.sidePanel") ?? "")), "le volet n'est pas gardé sur l'appareil");
      await page.locator(".side-parts-list label", { hasText: "Préparations" }).locator("input").check();
      await page.locator(".sp-side").getByRole("button", { name: "Terminé" }).click();
      // Renommer une séquence dans la feuille : double-clic sur sa ligne.
      await page.locator(".sp-editor [data-el=action]").first().click();
      await page.keyboard.press("Control+Alt+Shift+KeyS");
      await until(() => page.locator('.sp-editor [data-series="seq"]').count(), "la séquence n'est pas posée");
      await page.locator('.sp-editor [data-series="seq"]').first().dblclick();
      await page.locator(".sp-sheet-rename").fill("La tempête");
      await page.locator(".sp-sheet-rename").press("Enter");
      await until(async () => /La tempête/.test(await page.locator('.sp-editor [data-series="seq"]').first().innerText()), "la séquence n'est pas renommée dans la feuille");
      await h.saved((f) => /## La tempête \[\[cosmos:beat:u\d+\]\] \[\[cosmos:seq:/.test(f["scenario.fountain"] ?? ""), "le nouveau titre perd ses notes");
      // Le volet des scènes filtre aussi par décor (lot 17).
      await page.locator("#sp-filter-name").selectOption({ label: "Quai" });
      await until(() => page.locator(".thread-banner").count(), "le filtre par décor ne pose pas de bandeau");
      await h.view(1);
      await until(async () => (await page.locator(".card-scene-number").allInnerTexts()).sort().join(",") === "1,2", "les cartes Scène n'ont pas leur numéro");
    },
  },
  {
    name: "recherche dans le Scénario (#85) : le mot trouvé dans l'action d'une scène y est sélectionné",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne. Inès écoute la tempête.");
      await page.keyboard.press("Enter");
      await h.wait(500);
      await page.keyboard.press("Control+f");
      await page.locator(".search-input").fill("tempete");
      await until(() => page.locator(".search-result").first().isVisible(), "aucun résultat pour « tempete »");
      await page.locator(".search-input").press("Enter");
      await until(async () => (await page.evaluate(() => String(window.getSelection()))) === "tempête", "le mot trouvé n'est pas sélectionné dans le Scénario");
    },
  },
  {
    name: "série : saison et épisodes dans le séquencier, un seul scenario.fountain (plan des épisodes, lot 1)",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      // Le pilote s'écrit d'abord comme un scénario ordinaire.
      await h.view(4);
      const editor = page.getByRole("textbox", { name: "Texte du scénario" });
      await editor.click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne.");
      await h.wait(500);
      // Séquencier : un premier épisode prend le texte déjà écrit, sous une saison créée.
      await h.view(2);
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      const first = page.getByRole("textbox", { name: "Titre de l’épisode 1" });
      await until(() => first.count(), "pas d'épisode 1 dans le séquencier");
      await first.fill("Le signal");
      await first.press("Enter");
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      const second = page.getByRole("textbox", { name: "Titre de l’épisode 2" });
      await until(() => second.count(), "pas d'épisode 2 dans le séquencier");
      await second.fill("Tempête");
      await second.press("Enter");
      assert(await page.getByRole("textbox", { name: "Titre de la saison" }).count(), "pas de saison dans le séquencier");
      // Aucune carte Épisode : la série est dans le scénario.
      assert((await page.locator(".card.type-episode").count()) === 0, "une carte Épisode a été créée");
      // « Écrire l'épisode » depuis le menu de l'épisode 2.
      await page.getByRole("button", { name: "Actions de « Ép. 2 · Tempête »" }).click();
      await page.getByRole("menuitem", { name: "Écrire l’épisode" }).click();
      await until(() => page.locator(".episode-picker-label").filter({ hasText: "Ép. 2 · Tempête" }).count(), "le sélecteur ne montre pas l'épisode 2");
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("EXT. PORT – JOUR");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Les bateaux rentrent.");
      await h.wait(400);
      assert(!(await page.locator(".sp-editor").innerText()).includes("La lanterne tourne."), "le texte du pilote est dans l'épisode 2");
      // Retour au premier par la flèche : son texte est là, sans celui du deuxième.
      await page.getByRole("button", { name: "Épisode précédent" }).click();
      await until(async () => (await page.locator(".sp-editor").innerText()).includes("La lanterne tourne."), "le texte du pilote n'est pas revenu");
      assert(!(await page.locator(".sp-editor").innerText()).includes("Les bateaux rentrent."), "le texte de l'épisode 2 est dans le pilote");
      const f = await h.saved((f) => {
        const text = f["scenario.fountain"] ?? "";
        return /La lanterne tourne\./.test(text) && /Les bateaux rentrent\./.test(text) && (text.match(/\[\[cosmos:episode:/g) ?? []).length === 2 ? f : null;
      }, "les deux épisodes ne sont pas dans scenario.fountain");
      assert(!Object.keys(f).some((k) => k.startsWith("episodes/")), "un fichier par épisode a été écrit");
      const text = f["scenario.fountain"];
      assert(text.indexOf("Le signal") < text.indexOf("La lanterne tourne.") && text.indexOf("Tempête") < text.indexOf("Les bateaux rentrent."), "l'ordre du fichier est faux");
      // Relu après rechargement : tout le scénario s'ouvre, l'épisode 2 se retrouve.
      await h.reloadAndOpen();
      await h.view(4);
      await until(() => page.locator(".episode-picker-label").filter({ hasText: "Tout le scénario" }).count(), "le scénario entier ne s'ouvre pas après rechargement");
      await page.getByRole("button", { name: "Épisode suivant" }).click();
      await page.getByRole("button", { name: "Épisode suivant" }).click();
      await until(async () => (await page.locator(".sp-editor").innerText()).includes("Les bateaux rentrent."), "le texte de l'épisode 2 n'est pas relu");
    },
  },
  {
    name: "série sur le canevas : Organiser dessine saison › épisodes, une scène lâchée dans un épisode y passe (plan des épisodes, lot 2)",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      for (const [heading, action] of [["INT. PHARE – NUIT", "La lanterne tourne."], ["EXT. PORT – JOUR", "Les bateaux rentrent."]]) {
        await page.keyboard.type(heading);
        await page.keyboard.press("Enter");
        await page.keyboard.type(action);
        await page.keyboard.press("Enter");
      }
      await h.wait(500);
      await h.view(2);
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      await until(() => page.getByRole("textbox", { name: "Titre de l’épisode 1" }).count(), "pas d'épisode 1");
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      await until(() => page.getByRole("textbox", { name: "Titre de l’épisode 2" }).count(), "pas d'épisode 2");
      await h.view(1);
      await page.getByRole("button", { name: "Organiser le canevas" }).first().click();
      const titles = () => page.locator(".frame-title").evaluateAll((els) => els.map((e) => e.value));
      await until(async () => {
        const list = await titles();
        return ["Saison 1", "Ép. 1", "Ép. 2"].every((t) => list.includes(t)) ? list : null;
      }, "« Organiser » n'a pas dessiné saison et épisodes");
      await h.wait(1000);
      // La scène du port, lâchée dans le cadre de l'épisode 2, y passe avec son texte.
      const id = await until(
        () => page.locator(".react-flow__node-card").evaluateAll((els) => els.find((e) => (e.querySelector(".card-title")?.value ?? "").includes("PORT"))?.dataset.id),
        "carte de la scène du port introuvable",
      );
      // On tient la carte par son en-tête, juste à droite de l'étiquette du type (le reste porte des boutons).
      const type = await h.node(id).locator(".card-type").boundingBox();
      const handle = type && { x: type.x + type.width + 6, y: type.y, width: 0, height: type.height };
      const frame = await page.locator(".react-flow__node-frame").filter({ has: page.locator(".frame.is-episode") }).evaluateAll((els) =>
        els.map((e) => ({ title: e.querySelector(".frame-title")?.value, box: e.getBoundingClientRect().toJSON() })),
      );
      const target = frame.find((f) => f.title === "Ép. 2");
      assert(handle && target, "cadre de l'épisode 2 introuvable");
      const tx = target.box.x + target.box.width / 2, ty = target.box.y + target.box.height / 2;
      await page.mouse.move(handle.x, handle.y + handle.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 15; i++) await page.mouse.move(handle.x + ((tx - handle.x - handle.width * 0.6) * i) / 15, handle.y + handle.height / 2 + ((ty - handle.y - handle.height / 2) * i) / 15);
      await page.mouse.up();
      await h.saved((f) => {
        const text = f["scenario.fountain"] ?? "";
        const ep2 = text.indexOf("[[cosmos:episode:", text.indexOf("[[cosmos:episode:") + 1);
        return ep2 > 0 && text.indexOf("EXT. PORT") > ep2 && text.indexOf("Les bateaux rentrent.") > ep2;
      }, "la scène lâchée n'est pas passée dans l'épisode 2 du Fountain");
      const frames = JSON.parse((await h.files())["cosmos.json"]).frames ?? [];
      assert(frames.some((f) => f.season) && frames.filter((f) => f.episode).length === 2, `cadres enregistrés : ${JSON.stringify(frames.map((f) => [f.title, f.season, f.episode]))}`);
    },
  },
  {
    name: "série, lot 3 : gabarit d'un épisode, rubrique Épisodes de la Bible, « Aller à » un épisode",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne.");
      await h.wait(500);
      await h.view(2);
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      await until(() => page.getByRole("textbox", { name: "Titre de l’épisode 1" }).count(), "pas d'épisode 1");
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      const second = page.getByRole("textbox", { name: "Titre de l’épisode 2" });
      await until(() => second.count(), "pas d'épisode 2");
      await second.fill("Tempête");
      await second.press("Enter");
      // Gabarit de l'épisode 2 seul : « Épisode de série ».
      await page.getByLabel("Structure de l’épisode").nth(1).selectOption("episode");
      await h.saved((f) => {
        const text = f["scenario.fountain"] ?? "";
        const ep2 = text.indexOf("Tempête [[cosmos:episode:");
        const beat = text.indexOf("### ");
        return ep2 > 0 && beat > ep2 && text.indexOf("[[cosmos:beat:") > ep2;
      }, "le gabarit n'est pas posé dans l'épisode 2 seul");
      // La Bible liste les épisodes, titres modifiables.
      await h.view(3);
      await page.locator(".bible-toc, nav").getByText("Épisodes", { exact: true }).first().click();
      await until(() => page.locator(".series-bible").getByRole("textbox", { name: "Titre de l’épisode 2" }).count(), "la rubrique Épisodes de la Bible ne montre pas l'épisode 2");
      assert((await page.locator(".series-bible").getByRole("textbox", { name: "Titre de l’épisode 2" }).inputValue()) === "Tempête", "le titre de l'épisode 2 n'est pas dans la Bible");
      // « Aller à » mène à l'épisode 2 dans la vue Scénario.
      await page.keyboard.press("Control+g");
      await page.keyboard.type("Tempête");
      await until(() => page.locator(".goto-kind").filter({ hasText: "Épisode" }).count(), "« Aller à » ne propose pas l'épisode");
      await page.keyboard.press("Enter");
      await until(() => page.locator(".episode-picker-label").filter({ hasText: "Ép. 2 · Tempête" }).count(), "« Aller à » n'a pas ouvert l'épisode 2");
      // Épisode encore vide : le curseur attend sous la première case, et la frappe commence un en-tête de scène.
      await h.wait(300);
      await page.keyboard.type("int. manoir - jour");
      await h.wait(400);
      await page.keyboard.press("Control+s");
      await h.saved((f) => /\[\[cosmos:beat:e_teaser\]\]\n\nINT\. MANOIR - JOUR/i.test(f["scenario.fountain"] ?? ""), "la frappe sous la première case n'a pas fait un en-tête de scène");
    },
  },
  {
    name: "gabarit posé dans le séquencier : la vue Scénario attend sous la première case, et la frappe y fait un en-tête",
    async run(h) {
      const { page } = h;
      await h.create("Le Manoir", "scenario");
      await h.view(2);
      await page.locator(".plan-template select").first().selectOption("episode");
      await h.wait(300);
      await h.view(4);
      await h.wait(300);
      await page.keyboard.type("int. manoir - jour");
      await h.wait(400);
      await page.keyboard.press("Control+s");
      await h.saved((f) => /\[\[cosmos:beat:e_teaser\]\]\n\nINT\. MANOIR - JOUR/i.test(f["scenario.fountain"] ?? ""), "la frappe sous la première case n'a pas fait un en-tête de scène");
    },
  },
  {
    name: "séquencier : « Nouvelle scène… » au bout d'une case, et l'aide de la case dans son cadre du canevas",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(2);
      await page.locator(".plan-template select").first().selectOption("troisActes");
      await h.wait(300);
      const field = page.getByRole("textbox", { name: /^Nouvelle scène dans/ });
      await until(() => field.count(), "pas de champ « Nouvelle scène » dans les cases du séquencier");
      await field.nth(1).fill("INT. PHARE - NUIT");
      await field.nth(1).press("Enter");
      await until(() => page.locator(".sq-scene").filter({ hasText: "INT. PHARE - NUIT" }).count(), "la scène ajoutée n'est pas dans le séquencier");
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/sequencier.png` });
      await page.keyboard.press("Control+s");
      await h.saved((f) => /\[\[cosmos:beat:[a-z_]+\]\][\s\S]*\[\[cosmos:beat:[a-z_]+\]\]\n\n(?:=[^\n]*\n\n)?INT\. PHARE - NUIT/.test(f["scenario.fountain"] ?? ""), "la scène n'est pas sous la deuxième case du gabarit");
      await h.view(1);
      await page.locator(".plan-organize, .canvas-dock button").filter({ hasText: "Organiser" }).first().click();
      await h.wait(600);
      await until(() => page.locator(".frame-hint").count(), "les cadres des cases n'ont pas leur description");
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/canevas.png` });
    },
  },
  {
    name: "séquencier : un gabarit de l'auteur garde son nom et les descriptions de ses cases (séquencier et canevas)",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(2);
      const select = page.locator(".plan-template select").first();
      await select.waitFor();
      const chooser = page.waitForEvent("filechooser");
      await select.selectOption("__import");
      const md = "# Deux temps\n\n## Avant\n\nLe monde tel qu’il est\n\n## Après\n\nLe monde changé\n";
      await (await chooser).setFiles({ name: "deux.md", mimeType: "text/markdown", buffer: Buffer.from(md) });
      const dialog = page.locator("dialog[open]");
      await dialog.getByRole("button", { name: "Utiliser dans ce projet" }).click();
      await until(() => page.locator(".sq-section-hint").filter({ hasText: "Le monde tel qu’il est" }).count(), "la description de la case n'est pas dans le séquencier");
      await until(async () => (await select.locator("option:checked").textContent())?.trim() === "Deux temps", "le menu ne montre pas le nom du gabarit");
      const field = page.getByRole("textbox", { name: /^Nouvelle scène dans/ }).first();
      await field.fill("INT. PHARE - NUIT");
      await field.press("Enter");
      await page.keyboard.press("Control+s");
      await h.saved((f) => JSON.parse(f["cosmos.json"] ?? "{}").plan?.scriptBeats?.u1?.hint === "Le monde tel qu’il est", "les descriptions ne sont pas enregistrées");
      await h.view(1);
      await page.locator(".canvas-dock button").filter({ hasText: "Organiser" }).first().click();
      await until(() => page.locator(".frame-hint").filter({ hasText: "Le monde changé" }).count(), "le cadre de la case n'a pas sa description");
      if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/canevas-gabarit.png` });
    },
  },
  {
    name: "longueur des scènes en huitièmes de page : liste des scènes et séquencier (#44)",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("int. phare - nuit");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne.");
      await h.wait(600);
      await until(() => page.locator(".sp-scene-list .sp-towrite").filter({ hasText: "1/8" }).count(), "la liste des scènes ne donne pas la longueur en huitièmes");
      await h.view(2);
      await until(() => page.locator(".sq-length").filter({ hasText: "1/8 p." }).count(), "le séquencier ne donne pas la longueur en huitièmes");
      assert(await page.locator(".sq-length .sr-only").filter({ hasText: "1 huitième de page" }).count(), "la longueur n'est pas lue en toutes lettres");
    },
  },
  {
    name: "personnage muet : relevé dans « Vérifier » et dans les Statistiques (« Sans réplique »), carte créée d'un clic (#47)",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("int. phare - nuit");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Le GARDIEN monte sans un mot. Un coup de feu : BANG !");
      await h.wait(600);
      await page.locator(".side-tabs").getByRole("button", { name: /^Vérifier/ }).click();
      const item = page.locator(".review-group", { hasText: "Personnage muet sans carte" }).locator(".review-item");
      await until(async () => (await item.count()) === 1, "« Vérifier » ne relève pas le personnage muet");
      assert(((await item.innerText()) ?? "").includes("GARDIEN"), "le muet relevé n'est pas GARDIEN");
      // Les Statistiques le montrent sans réplique.
      await page.locator(".sp-bar").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Statistiques" }).click();
      const silent = page.locator(".char-stats-silent");
      await until(() => silent.isVisible(), "pas de partie « Sans réplique » dans les Statistiques");
      assert((await silent.innerText()).includes("GARDIEN"), "GARDIEN n'est pas dans « Sans réplique »");
      assert(!(await silent.innerText()).includes("BANG"), "un bruit est pris pour un personnage");
      await silent.getByRole("button", { name: "Créer la carte de GARDIEN" }).click();
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("cartes/") && /type: personnage/.test(v) && /title: "Gardien"/.test(v)), "la carte du muet n'a pas été créée");
    },
  },
  {
    name: "scène omise : pages verrouillées, « OMIS » garde sa place et son numéro, la scène revient de la corbeille (#46)",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      for (const [heading, action] of [["int. phare - nuit", "La lanterne tourne."], ["ext. côte - jour", "Yann attend sur la jetée."], ["int. cuisine - nuit", "Le café brûle."]]) {
        await page.keyboard.type(heading);
        await page.keyboard.press("Enter");
        await page.keyboard.type(action);
        await page.keyboard.press("Enter");
      }
      await h.wait(600);
      const more = page.locator(".sp-bar").getByRole("button", { name: "Plus d’actions" });
      // Sans pages verrouillées, pas d'« Omettre ».
      await more.click();
      assert((await page.getByRole("menuitem", { name: "Omettre la scène" }).count()) === 0, "« Omettre la scène » est proposé sans pages verrouillées");
      await page.getByRole("menuitem", { name: "Révisions…" }).click();
      await page.getByRole("button", { name: "Verrouiller les pages" }).click();
      await page.keyboard.press("Escape");
      await h.wait(300);
      // La deuxième scène : on y va par la liste des scènes, puis on l'omet.
      await page.locator(".sp-scene-list button").filter({ hasText: "EXT. CÔTE - JOUR" }).click();
      await h.wait(300);
      await more.click();
      await page.getByRole("menuitem", { name: "Omettre la scène" }).click();
      await until(() => page.locator(".sp-scene-omitted").filter({ hasText: "2. OMIS" }).count(), "la liste des scènes ne montre pas « 2. OMIS »");
      await h.saved((f) => /\.OMIS \[\[cosmos:omitted:[A-Za-z0-9_-]+\]\] #2#/.test(f["scenario.fountain"] ?? "") && !(f["scenario.fountain"] ?? "").includes("Yann attend"), "le fichier n'a pas l'en-tête omis numéroté");
      await h.saved((f) => Object.keys(f).some((k) => k.startsWith("corbeille/") && f[k].includes("Yann attend")), "la scène n'est pas partie à la corbeille avec sa carte");
      // Le séquencier la garde à sa place, en grisé.
      await h.view(2);
      await until(() => page.locator(".sq-scene.is-omitted").filter({ hasText: "2. OMIS" }).count(), "le séquencier ne montre pas la scène omise");
      // Remise depuis la corbeille : le texte reprend la place de « OMIS », avec son numéro.
      await page.locator(".trash-notice").getByRole("button", { name: "Voir la corbeille" }).click();
      await page.getByRole("button", { name: /^Remettre/ }).first().click();
      await h.saved((f) => /EXT\. CÔTE - JOUR \[\[cosmos:[A-Za-z0-9_-]+\]\] #2#\n\nYann attend sur la jetée\.\n\nINT\. CUISINE/.test(f["scenario.fountain"] ?? "") && !(f["scenario.fountain"] ?? "").includes("OMIS"), "la scène remise n'a pas repris sa place");
    },
  },
  {
    name: "série en deux saisons : la scène de la saison 2 dans son cadre, liste groupée par saison et épisode, titres des cadres entiers",
    async run(h) {
      const { page } = h;
      await h.create("Odyssée", "scenario");
      await h.view(2);
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      const e1 = page.getByRole("textbox", { name: "Titre de l’épisode 1" });
      await until(() => e1.count(), "pas d'épisode 1");
      await e1.fill("Le départ");
      await e1.press("Enter");
      await page.locator(".sq-episode-template select").first().selectOption("episode");
      await page.getByRole("button", { name: "+ Nouvelle saison" }).click();
      await page.getByRole("button", { name: "+ Nouvel épisode" }).click();
      await h.wait(300);
      // Écrire dans l'épisode 1 : le curseur attend sous « Pré-générique ».
      await page.getByRole("button", { name: "Actions de « Ép. 1 · Le départ »" }).click();
      await page.getByRole("menuitem", { name: "Écrire l’épisode" }).click();
      await until(() => page.locator(".sp-editor .ProseMirror-gapcursor").count(), "pas de curseur sous la première case");
      assert((await page.locator('.sp-preserved[data-series="beat"]').count()) === 6, "les cases ne sont pas marquées comme cases");
      await page.keyboard.type("int. navette spatiale - nuit");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Le vaisseau dérive.");
      await h.wait(400);
      // L'épisode de la saison 2, même en-tête.
      await page.getByRole("button", { name: "Épisode suivant" }).click();
      await h.wait(400);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("int. navette spatiale - nuit");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Rien ne bouge.");
      await h.wait(400);
      // Tout le scénario : la liste des scènes reprend saisons et épisodes, le ruban des cases n'y est pas.
      await page.locator(".episode-picker-menu").click();
      await page.getByRole("menuitem", { name: "Tout le scénario" }).click();
      await until(async () => (await page.locator(".sp-scene-group.is-season").count()) === 2, "la liste des scènes n'a pas ses deux saisons");
      assert((await page.locator(".sp-scene-group.is-episode").count()) === 2, "la liste des scènes n'a pas ses deux épisodes");
      assert((await page.locator(".sp-center nav.ribbon").count()) === 0, "le ruban des cases mêle les épisodes de toute la série");
      assert((await page.locator('.sp-preserved[data-series="episode"]').count()) === 2, "les sections d'épisode ne sont pas marquées");
      // Canevas : chaque scène dans le cadre de son épisode.
      await h.view(1);
      await h.wait(800);
      const placed = await until(
        () =>
          page.evaluate(() => {
            const frames = [...document.querySelectorAll(".react-flow__node-frame")].map((n) => ({ title: n.querySelector(".frame-title")?.value ?? "", r: n.getBoundingClientRect() }));
            const scenes = [...document.querySelectorAll(".react-flow__node-card")].filter((n) => n.querySelector(".card.type-scene")).map((n) => ({ text: n.textContent ?? "", r: n.getBoundingClientRect() }));
            const holder = (sc) => frames.filter((f) => sc.r.left >= f.r.left && sc.r.right <= f.r.right + 1 && sc.r.top >= f.r.top && sc.r.bottom <= f.r.bottom + 1).map((f) => f.title);
            const a = scenes.find((x) => x.text.includes("Le vaisseau dérive."));
            const b = scenes.find((x) => x.text.includes("Rien ne bouge."));
            if (!a || !b) return null;
            const ha = holder(a);
            const hb = holder(b);
            return ha.includes("Pré-générique") && ha.includes("Saison 1") && hb.includes("Ép. 1") && hb.includes("Saison 2") ? { ha, hb } : null;
          }),
        "une scène n'est pas tout entière dans le cadre de son épisode",
      );
      assert(placed, "scènes mal rangées");
      // Titres des cadres, de près : la copie au premier plan n'est jamais coupée.
      for (let i = 0; i < 4; i++) {
        await page.locator(".react-flow__controls-zoomin").click();
        await h.wait(200);
      }
      await h.wait(400);
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll(".frame-label.is-near .frame-near-title")].filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent),
      );
      assert(cut.length === 0, `titres de cadre coupés : ${cut.join(", ")}`);
    },
  },
  {
    name: "Bible : une fiche Lieu créée dans la Bible a sa carte sur le canevas",
    async run(h) {
      const { page } = h;
      await h.create("Bible");
      await h.view(3);
      // La rubrique Lieux par le sommaire, puis son bouton de création.
      await page.locator(".bible-toc, nav").getByText("Lieux", { exact: true }).first().click();
      await page.getByRole("button", { name: "Nouvelle fiche : Lieu" }).first().click();
      const title = page.locator(".bible-main textarea:focus, .bible textarea:focus");
      await until(() => title.count(), "le titre de la nouvelle fiche n'a pas le focus");
      await page.keyboard.type("Le phare d’Ar-Men");
      await page.keyboard.press("Enter");
      await h.view(1);
      const cards = await until(async () => {
        const list = await h.cardList();
        return list.length ? list : null;
      }, "pas de carte sur le canevas");
      assert(cards.length === 1 && cards[0].type === "lieu" && cards[0].title === "Le phare d’Ar-Men", `carte : ${JSON.stringify(cards)}`);
    },
  },
  {
    name: "recherche : Ctrl+F trouve une carte et la met en avant, Échap ferme",
    async run(h) {
      const { page } = h;
      await h.create("Recherche");
      await h.newCard("Inès Morvan");
      const yann = await h.newCard("Yann Le Goff");
      await h.pane();
      await page.keyboard.press("Control+f");
      const field = page.getByRole("combobox", { name: "Rechercher une carte" });
      await until(() => field.evaluate((el) => el === document.activeElement), "Ctrl+F n'ouvre pas la recherche");
      await page.keyboard.type("goff");
      const results = page.getByRole("listbox", { name: "Cartes trouvées" }).getByRole("option");
      await until(async () => (await results.count()) === 1, "la recherche ne trouve pas une seule carte");
      assert((await results.first().innerText()).includes("Yann Le Goff"), "mauvaise carte trouvée");
      await page.keyboard.press("Enter");
      await until(() => page.locator(`.react-flow__node[data-id="${yann}"].is-spotlit, .react-flow__node[data-id="${yann}"] .is-spotlit`).count(), "la carte trouvée n'est pas mise en avant");
      await page.keyboard.press("Control+f");
      await until(() => field.isVisible(), "Ctrl+F ne rouvre pas la recherche");
      await page.keyboard.press("Escape");
      await until(async () => (await field.count()) === 0 || !(await field.isVisible()), "Échap ne ferme pas la recherche");
    },
  },
  {
    name: "IA : du vrac aux cartes, propositions cochées, création en une étape, Ctrl+Z",
    async run(h) {
      const { page } = h;
      // Un service branché (Claude) et une réponse fabriquée : rien ne sort vers Internet.
      await page.addInitScript(() => localStorage.setItem("cosmos:reglages", JSON.stringify({ ai: { provider: "anthropic", keys: { anthropic: "sk-test" }, models: {}, urls: {} } })));
      let asked = null;
      await page.route("https://api.anthropic.com/**", async (route) => {
        asked = JSON.parse(route.request().postData() ?? "{}");
        const text = JSON.parse(asked.messages[0].content).text;
        const yann = JSON.parse(asked.messages[0].content).existing[0]?.id;
        const cards = [
          { key: "n1", type: "personnage", title: "Inès Morvan", text: "Inès Morvan, gardienne remplaçante, ne supporte pas le silence." },
          { key: "n2", type: "lieu", title: "Le phare de Kerbrat", text: "Le phare de Kerbrat : une tour blanche battue par le vent." },
          { key: "n3", type: "question", title: "La lanterne", text: "Qui a éteint la lanterne ?" },
          { key: "n4", type: "idee", title: "Inventée", text: "Une phrase que l'auteur n'a jamais écrite." },
        ];
        const links = [{ from: "n1", to: "n2", label: "garde" }, { from: "n3", to: "n1" }, { from: "n1", to: yann, label: "remplace" }];
        if (!text.includes("Kerbrat")) throw new Error("texte absent de la requête");
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ cards, links }) }] }) });
      });
      await h.create("Vrac");
      await h.newCard("Yann Le Goff");
      await h.pane();
      await page.getByRole("button", { name: "IA", exact: true }).click();
      await page.getByRole("button", { name: "Du vrac aux cartes…" }).click();
      const field = page.getByRole("textbox", { name: "Texte à découper en cartes" });
      await field.fill("Inès Morvan, gardienne remplaçante, ne supporte pas le silence.\nLe phare de Kerbrat : une tour blanche battue par le vent.\nQui a éteint la lanterne ?");
      await page.getByRole("button", { name: "Découper en cartes" }).click();
      await until(() => page.getByText("Cartes proposées · 3").isVisible(), "les propositions n'apparaissent pas");
      assert(asked?.max_tokens > 1500, "limite de longueur trop courte");
      await until(() => page.getByText(/Passages écartés.*1/).isVisible(), "le passage inventé n'est pas signalé comme écarté");
      // Décocher la Question retire son fil.
      await page.getByRole("checkbox", { name: "Garder la carte « La lanterne »" }).uncheck();
      await until(() => page.getByText("Fils proposés · 2").isVisible(), "le fil de la carte décochée reste proposé");
      const before = await h.cards().count();
      await page.getByRole("button", { name: "Créer les cartes · 2" }).click();
      await until(async () => (await h.cards().count()) === before + 2, "les cartes ne sont pas créées");
      const list = await h.cardList();
      assert(list.some((c) => c.type === "personnage" && c.title === "Inès Morvan") && list.some((c) => c.type === "lieu" && c.title === "Le phare de Kerbrat"), `cartes : ${JSON.stringify(list)}`);
      await until(async () => (await h.edges().count()) === 2, "les deux fils ne sont pas tirés");
      await h.pane();
      await page.keyboard.press("Control+z");
      await until(async () => (await h.cards().count()) === before && (await h.edges().count()) === 0, "Ctrl+Z ne retire pas tout en une fois");
    },
  },
  {
    name: "IA locale : la recherche par le sens trouve le passage sans le mot cherché, et y mène",
    async run(h) {
      const { page } = h;
      // Ollama simulé : rien ne part ailleurs que vers « localhost:11434 », intercepté ici.
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", ai: { provider: "ollama", keys: {}, models: { ollama: "llama3" }, urls: {}, embedModels: { ollama: "nomic-embed-text" } } }));
      });
      const sent = [];
      // Vecteurs fabriqués : un axe pour le courrier, un pour la mer, un pour le reste.
      const vec = (s) => (/lettre|enveloppe|courrier/i.test(s) ? [1, 0.05, 0] : /mer|tempête/i.test(s) ? [0, 1, 0.05] : [0.05, 0, 1]);
      await page.route("http://localhost:11434/**", async (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
        const req = route.request();
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        if (req.url().endsWith("/api/tags")) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ models: [{ name: "llama3" }, { name: "nomic-embed-text" }] }) });
        if (!req.url().endsWith("/api/embed")) return route.fulfill({ status: 404, headers: cors, body: "{}" });
        const body = JSON.parse(req.postData() ?? "{}");
        sent.push(body);
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ model: body.model, embeddings: body.input.map(vec) }) });
      });
      await h.create("Par le sens");
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").first().fill("La nuit au phare");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await h.view(4);
      await page.locator(".ms-page .ProseMirror").click();
      // Deux paragraphes ordinaires (plus de 160 caractères) : deux passages, chacun son endroit exact.
      await page.keyboard.type("La mer grondait sous le phare depuis le début de la nuit, et les vagues montaient si haut qu'elles venaient frapper les vitres de la lanterne, là-haut, où rien ne bougeait.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Inès trouva une enveloppe glissée sous la porte, sans timbre ni adresse, avec seulement son prénom écrit à l'encre bleue d'une main qui tremblait un peu.");
      await h.wait(900);
      // La recherche suit la vue (#85) : depuis le Manuscrit, les passages du texte, et on y reste.
      await page.keyboard.press("Control+f");
      await page.getByRole("button", { name: "Par le sens" }).click();
      const field = page.getByRole("combobox", { name: "Rechercher dans le texte" });
      await field.fill("Où ai-je parlé du courrier ?");
      await field.press("Enter");
      const results = page.getByRole("listbox", { name: "Passages trouvés" }).getByRole("option");
      await until(async () => (await results.count()) > 0, "la recherche par le sens ne rend rien");
      assert((await results.first().innerText()).includes("enveloppe"), `premier passage : ${await results.first().innerText()}`);
      assert(sent.every((b) => b.model === "nomic-embed-text"), "le modèle d'embedding n'est pas celui des Réglages");
      assert(sent.some((b) => b.input.some((t) => t.startsWith("search_document: ") && t.includes("enveloppe"))), "le texte du manuscrit n'a pas été lu");
      assert(sent.some((b) => b.input.length === 1 && b.input[0] === "search_query: Où ai-je parlé du courrier ?"), "la question n'a pas été envoyée");
      // Une seconde recherche ne relit pas le projet : seulement la question.
      const before = sent.length;
      await field.fill("La tempête");
      await field.press("Enter");
      await until(async () => (await results.count()) > 0 && (await results.first().innerText()).includes("grondait"), "la seconde recherche ne trouve pas la mer");
      assert(sent.length === before + 1, `le projet a été relu (${sent.length - before} requêtes)`);
      await field.fill("Où ai-je parlé du courrier ?");
      await field.press("Enter");
      await until(async () => (await results.first().innerText()).includes("enveloppe"), "la troisième recherche ne trouve pas l'enveloppe");
      await field.press("Enter");
      await until(() => page.evaluate(() => getSelection()?.toString().startsWith("Inès trouva une enveloppe")), "le passage n'est pas sélectionné dans le manuscrit");
    },
  },
  {
    name: "IA : ranger les fils, fil proposé avec son passage, tiré sur le canevas, Ctrl+Z",
    async run(h) {
      const { page } = h;
      // Un service branché (Claude) et une réponse fabriquée : rien ne sort vers Internet.
      await page.addInitScript(() => localStorage.setItem("cosmos:reglages", JSON.stringify({ ai: { provider: "anthropic", keys: { anthropic: "sk-test" }, models: {}, urls: {} } })));
      let asked = null;
      await page.route("https://api.anthropic.com/**", async (route) => {
        asked = JSON.parse(route.request().postData() ?? "{}");
        const { cards } = JSON.parse(asked.messages[0].content);
        const id = (title) => cards.find((c) => c.title === title)?.id;
        const items = [
          { from: id("Inès Morvan"), to: id("Le phare de Kerbrat"), label: "travaille à", quote: "Inès travaille au phare de Kerbrat" },
          // Passage inventé : écarté par la relecture.
          { from: id("Yann"), to: id("Inès Morvan"), label: "frère de", quote: "Yann est le frère aîné d'Inès" },
        ];
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ items }) }] }) });
      });
      await h.create("Fils");
      await h.newCard("Inès Morvan");
      await page.keyboard.press("Enter");
      await h.wait(200);
      await page.keyboard.type("Inès travaille au phare de Kerbrat depuis l'hiver.");
      await h.newCard("Le phare de Kerbrat");
      await h.newCard("Yann");
      await h.pane();
      await page.getByRole("button", { name: "IA", exact: true }).click();
      await page.getByRole("button", { name: "Ranger les fils" }).click();
      const quote = page.locator(".ai-quote", { hasText: "Inès travaille au phare de Kerbrat" });
      await until(() => quote.isVisible(), "le fil proposé et son passage n'apparaissent pas");
      assert(asked?.max_tokens > 0, "pas de limite de longueur");
      await until(() => page.getByText(/Une proposition écartée/).isVisible(), "le passage inventé n'est pas signalé comme écarté");
      assert((await h.edges().count()) === 0, "un fil est tiré avant le clic de l'auteur");
      await page.getByRole("button", { name: "Tirer ce fil" }).click();
      await until(async () => (await h.edges().count()) === 1, "le fil n'est pas tiré sur le canevas");
      await until(() => page.locator(".react-flow__edgelabel-renderer, .react-flow").getByText("travaille à", { exact: true }).first().isVisible(), "l'étiquette du fil n'est pas affichée");
      await page.keyboard.press("Escape");
      await h.pane();
      await page.keyboard.press("Control+z");
      await until(async () => (await h.edges().count()) === 0, "Ctrl+Z ne retire pas le fil");
    },
  },
  {
    name: "iPhone (390 × 844) : quatre onglets, une carte créée s'ouvre en grand",
    context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    async run(h) {
      const { page } = h;
      await h.create("Téléphone");
      for (const name of ["Canevas", "Plan", "Manuscrit", "Bible"]) assert(await page.locator(".views").getByRole("button", { name, exact: true }).isVisible(), `onglet ${name} absent`);
      const before = await h.cards().count();
      await page.locator(".add-card-main").tap();
      await page.getByRole("menuitem", { name: "Personnage" }).tap();
      const title = page.locator("dialog[open] .expanded-title");
      await title.waitFor();
      await until(() => title.evaluate((el) => el === document.activeElement), "le titre de la carte agrandie n'a pas le focus");
      await page.keyboard.type("Le bûcheron");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Il coupe du bois.");
      await page.locator("dialog[open] .expanded-close").tap();
      // Une seule carte de plus (pas de seconde carte née d'un double-clic fantôme).
      await until(async () => (await h.cards().count()) === before + 1, "pas exactement une carte de plus");
      await h.saved((f) => Object.values(f).some((v) => v.includes("Le bûcheron") && v.includes("Il coupe du bois.")), "la carte n'est pas enregistrée avec son titre et son texte");
    },
  },
  {
    name: "iPhone : gestes du Manuscrit et de la Bible (écarter = mode focus, pincer = sortir, glisser = volets)",
    context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    async run(h) {
      const { page } = h;
      await h.example();
      await page.locator(".views").getByRole("button", { name: "Manuscrit", exact: true }).tap();
      const ms = page.locator(".manuscript");
      await ms.waitFor();
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
      const swipe = async (from, to, y = 560) => {
        await touch("touchStart", [[from, y]]);
        const step = (to - from) / 5;
        for (let i = 1; i <= 5; i++) await touch("touchMove", [[from + step * i, y]]);
        await touch("touchEnd", []);
      };
      const pinch = async (spread) => {
        const [a, b] = spread ? [20, 120] : [120, 20];
        await touch("touchStart", [[195 - a, 500 - a], [195 + a, 500 + a]]);
        for (let i = 1; i <= 5; i++) {
          const d = a + ((b - a) * i) / 5;
          await touch("touchMove", [[195 - d, 500 - d], [195 + d, 500 + d]]);
        }
        await touch("touchEnd", []);
      };
      const has = async (loc, c) => ((await loc.getAttribute("class")) ?? "").split(" ").includes(c);
      assert(await has(ms, "hide-scenes"), "le volet des scènes est ouvert au départ sur téléphone");
      await swipe(100, 280);
      await until(async () => !(await has(ms, "hide-scenes")), "glisser vers la droite n'ouvre pas le volet des scènes");
      await swipe(300, 120);
      await until(() => has(ms, "hide-scenes"), "glisser vers la gauche ne referme pas le volet des scènes");
      await pinch(true);
      await until(() => has(ms, "is-focus"), "écarter deux doigts n'entre pas en mode focus");
      await pinch(false);
      await until(async () => !(await has(ms, "is-focus")), "pincer ne sort pas du mode focus");
      await page.locator(".views").getByRole("button", { name: "Bible", exact: true }).tap();
      const frame = page.locator(".bible-frame");
      await frame.waitFor();
      // Le glisser part d'un champ de la couverture (sans focus) : la Bible en est couverte.
      const field = page.locator(".bible textarea:visible").first();
      const box = await field.boundingBox();
      assert(box, "pas de champ visible dans la Bible");
      await swipe(60, 300, Math.round(box.y + box.height / 2));
      await until(async () => !(await has(frame, "hide-toc")), "glisser vers la droite n'ouvre pas le sommaire de la Bible");
      await swipe(320, 140);
      await until(() => has(frame, "hide-toc"), "glisser vers la gauche ne referme pas le sommaire de la Bible");
    },
  },
  {
    name: "iPhone : pas de barre de mise en forme sur la sélection (le menu d'iOS reste seul), le Markdown tapé met en forme",
    context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    async run(h) {
      const { page } = h;
      await h.create("Sans barre");
      await page.locator(".views").getByRole("button", { name: "Plan", exact: true }).tap();
      await page.getByPlaceholder("Nouvelle scène…").first().fill("Le réveil");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await page.locator(".views").getByRole("button", { name: "Manuscrit", exact: true }).tap();
      const editor = page.locator(".ms-page .ProseMirror");
      await editor.tap();
      await page.keyboard.type("Ethan rêve **encore** ");
      for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowLeft");
      await h.wait(400);
      assert((await page.locator(".format-bar").count()) === 0, "une barre de mise en forme paraît sur téléphone");
      await h.saved((f) => Object.keys(f).some((k) => k.startsWith("manuscrit/") && f[k].includes("**encore**")), "le Markdown tapé n'a pas mis le mot en gras");
    },
  },
  {
    name: "iPad : la bulle sur la sélection garde Commenter sans les mises en forme ; un glisser ouvre un volet même en écrivant",
    context: { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    async run(h) {
      const { page } = h;
      await h.create("Tablette");
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").first().fill("Le réveil");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await h.view(4);
      const editor = page.locator(".ms-page .ProseMirror");
      await editor.tap();
      await page.keyboard.type("Le réveil sonne et Ethan rêve encore");
      for (let i = 0; i < "encore".length; i++) await page.keyboard.press("Shift+ArrowLeft");
      const bar = page.locator(".format-bar");
      await until(() => bar.getByRole("button", { name: /^Commenter le passage/ }).isVisible(), "pas de Commenter dans la bulle de l'iPad");
      for (const name of [/^Gras/, /^Italique/, /^Citation/, /^À reprendre/]) assert((await bar.getByRole("button", { name }).count()) === 0, `bouton de mise en forme encore là sur iPad : ${name}`);
      // Curseur dans le texte (le clavier serait ouvert) : un glisser vif d'un doigt bouge quand même un volet.
      await page.keyboard.press("ArrowRight");
      assert(await editor.evaluate((el) => el.contains(document.activeElement)), "le texte n'a plus le focus avant le glisser");
      const ms = page.locator(".manuscript");
      const panels = () => ms.evaluate((el) => `${el.classList.contains("hide-scenes")}/${el.classList.contains("hide-side")}`);
      const before = await panels();
      const box = await editor.boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const y = Math.round(box.y + box.height / 2);
      const x0 = Math.round(box.x + box.width / 2);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y, id: 0 }] });
      for (let i = 1; i <= 5; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + i * 40, y, id: 0 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await until(async () => (await panels()) !== before, "un glisser sur le texte en cours d'écriture ne bouge aucun volet");
    },
  },
  {
    name: "trackpad : écarter deux doigts entre en mode focus, les pincer en sort (Manuscrit) ; la molette d'une souris avec Ctrl n'y touche pas",
    async run(h) {
      const { page } = h;
      await h.create("Trackpad");
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").first().fill("Le réveil");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await h.view(4);
      const ms = page.locator(".manuscript");
      await ms.waitFor();
      const focus = () => ms.evaluate((el) => el.classList.contains("is-focus"));
      const pinch = (deltaY, steps = 8) =>
        page.locator(".ms-page").evaluate((el, [d, n]) => {
          for (let i = 0; i < n; i++) el.dispatchEvent(new WheelEvent("wheel", { deltaY: d, ctrlKey: true, bubbles: true, cancelable: true }));
        }, [deltaY, steps]);
      await pinch(-100, 1);
      await h.wait(300);
      assert(!(await focus()), "un cran de molette de souris avec Ctrl a ouvert le mode focus");
      await pinch(-6);
      await until(focus, "écarter deux doigts sur le trackpad n'entre pas en mode focus");
      await h.wait(400); // fin du geste
      await pinch(6);
      await until(async () => !(await focus()), "pincer sur le trackpad ne sort pas du mode focus");
    },
  },
  {
    name: "tactile (iPad 834 × 1194) : exemple ouvert, « Nouvelle carte » crée une carte",
    context: { viewport: { width: 834, height: 1194 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
    async run(h) {
      const { page } = h;
      await h.example();
      const before = await until(async () => {
        const n = await h.cards().count();
        return n >= 21 ? n : 0;
      }, "le projet d'exemple ne s'ouvre pas au doigt");
      // Le bouton ouvre le menu des types ; « Idée » crée la carte (comme la touche N).
      await page.getByRole("button", { name: "Nouvelle carte", exact: true }).tap();
      await page.getByRole("menu").getByRole("menuitem").first().tap();
      await until(async () => (await h.cards().count()) === before + 1, "« Nouvelle carte » n'a pas créé de carte");
    },
  },
  {
    name: "anglais et thème sombre : le projet d'exemple s'ouvre sans erreur",
    context: { locale: "en-US", colorScheme: "dark" },
    async run(h) {
      const { page } = h;
      await h.example();
      assert((await page.locator("html").getAttribute("data-theme")) === "dark", "le thème sombre n'est pas appliqué");
      assert((await page.locator("html").getAttribute("lang"))?.startsWith("en"), "l'interface n'est pas en anglais");
      await until(async () => (await h.cards().count()) >= 21, "moins de 21 cartes dans l'exemple anglais");
      await until(() => page.getByRole("button", { name: "New card", exact: true }).isVisible(), "libellés anglais absents");
      for (const n of [2, 3, 4, 1]) await h.view(n);
    },
  },
  {
    name: "Apple Intelligence (1.10.0) : absent des Réglages du navigateur ; choisi quand même, les actions longues sont refusées",
    async run(h) {
      const { page } = h;
      await h.home();
      await openSettings(page);
      // Réglages en onglets (1.11.1) : le service d'IA est dans l'onglet IA.
      await page.getByRole("tab", { name: "IA", exact: true }).click();
      const service = page.getByLabel("Service", { exact: true });
      await until(() => service.isVisible(), "le choix du service n'apparaît pas");
      const options = await service.locator("option").allTextContents();
      assert(options.length >= 6 && !options.some((o) => /Apple/.test(o)), `Apple Intelligence est proposé dans le navigateur : ${options.join(", ")}`);
      await page.keyboard.press("Escape");
      // Réglage venu d'un Mac (copie du profil) : le service reste nommé, et ce qui lit tout le récit est refusé.
      await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("cosmos:reglages") ?? "{}");
        localStorage.setItem("cosmos:reglages", JSON.stringify({ ...raw, ai: { provider: "apple", keys: {}, models: {}, urls: {} } }));
      });
      await page.reload();
      await h.create("Petit modèle");
      await page.getByRole("button", { name: "IA", exact: true }).click();
      const coherence = page.getByRole("button", { name: "Vérifier la cohérence" });
      await until(() => coherence.isVisible(), "le menu IA ne s'ouvre pas");
      assert(await coherence.isDisabled(), "« Vérifier la cohérence » reste proposé au modèle d'Apple");
      assert(await page.getByRole("button", { name: "Lecteur bêta" }).isDisabled(), "le lecteur bêta reste proposé au modèle d'Apple");
      assert(await page.getByRole("button", { name: "Ranger les idées" }).isEnabled(), "« Ranger les idées » n'est plus proposé");
      await until(() => page.getByText("Trop long pour le modèle d’Apple sur l’appareil", { exact: false }).first().isVisible(), "la raison du refus n'est pas dite");
    },
  },
  {
    name: "atelier : réglage du projet, trois variantes, passage marqué et journalisé",
    async run(h) {
      const { page } = h;
      // Une IA « branchée » (Claude) dont la réponse est fabriquée ici : rien ne sort vers Internet.
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", ai: { provider: "anthropic", keys: { anthropic: "test" }, models: { anthropic: "claude-test" }, urls: {} } }));
      });
      await page.route("https://api.anthropic.com/**", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const text = JSON.stringify({ variants: ["La mer rugissait", "La mer tonnait", "Elle grondait"] });
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text }] }) });
      });
      await h.create("Atelier");
      await openSettings(page);
      await page.getByLabel("Activer le mode Atelier pour ce projet").check();
      await page.keyboard.press("Escape");
      await until(() => page.locator(".atelier-badge").isVisible(), "le repère « Atelier » n'apparaît pas dans la barre du haut");
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").first().fill("La tempête");
      await page.getByPlaceholder("Nouvelle scène…").first().press("Enter");
      await h.view(4);
      await page.locator(".ms-page .ProseMirror").click();
      await page.keyboard.type("La mer grondait sous le phare.");
      // Sélectionne « La mer grondait » : la barre de mise en forme propose « Trois variantes ».
      await page.evaluate(() => {
        const text = document.querySelector(".ms-page .ProseMirror p").firstChild;
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, "La mer grondait".length);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      });
      await page.locator(".format-bar").getByRole("button", { name: "Trois variantes" }).click();
      await page.getByRole("button", { name: "Prendre la variante 2" }).click();
      await until(() => page.locator(".ms-page .ia-mark").count(), "la variante prise n'est pas marquée");
      await h.saved((f) => {
        const meta = JSON.parse(f["cosmos.json"] ?? "{}");
        const scene = Object.entries(f).find(([k]) => k.startsWith("manuscrit/"))?.[1] ?? "";
        return meta.aiMode === "atelier" && /<span data-ia="[\w-]+">La mer tonnait<\/span> sous le phare\./.test(scene) && /· Variante · «\s?La tempête\s?» · anthropic, claude-test · 3 mots/.test(f["ia-journal.md"] ?? "");
      }, "réglage, passage marqué ou ligne du journal non enregistrés");
    },
  },
  {
    name: "atelier : variantes dans une scène de scénario ouverte en carte agrandie (1.8.1)",
    async run(h) {
      const { page } = h;
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", ai: { provider: "anthropic", keys: { anthropic: "test" }, models: { anthropic: "claude-test" }, urls: {} } }));
      });
      await page.route("https://api.anthropic.com/**", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const text = JSON.stringify({ variants: ["La lanterne pivote.", "La lanterne balaie la nuit.", "Le feu tourne."] });
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text }] }) });
      });
      await h.create("Le Phare", "scenario");
      await openSettings(page);
      await page.getByLabel("Activer le mode Atelier pour ce projet").check();
      await page.keyboard.press("Escape");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne.");
      await h.wait(500);
      await h.view(1);
      const card = page.locator(".react-flow__node", { hasText: "INT. PHARE – NUIT" }).first();
      await card.getByRole("button", { name: "Agrandir la carte" }).click();
      const sheet = page.locator(".script-scene .sp-editor");
      await sheet.locator("[data-el=action]").click();
      await page.locator(".script-scene .sp-bar").getByRole("button", { name: "Trois variantes" }).click();
      await page.getByRole("button", { name: "Prendre la variante 2" }).click();
      await until(() => sheet.locator("[data-el=action][data-ia]").count(), "la variante prise n'est pas marquée dans la carte agrandie");
      await page.locator(".script-scene .sp-bar").getByRole("button", { name: "Je l’ai repris" }).click();
      await until(async () => (await sheet.locator("[data-ia]").count()) === 0, "« Je l’ai repris » ne retire pas la marque");
      await page.keyboard.press("Escape");
      await h.saved((f) => /La lanterne balaie la nuit\./.test(f["scenario.fountain"] ?? "") && !/\[\[ia\]\]/.test(f["scenario.fountain"] ?? "") && /· Variante · «\s?INT\. PHARE – NUIT\s?»/.test(f["ia-journal.md"] ?? ""), "variante, marque retirée ou journal non enregistrés");
    },
  },
  {
    name: "atelier : image de référence générée (OpenAI simulé), gardée en portrait, créditée et journalisée (1.10.0)",
    async run(h) {
      const { page } = h;
      // PNG de 1 × 1 pixel, rendu par une API Images d'OpenAI fabriquée ici : rien ne sort vers Internet.
      const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", ai: { provider: "openai", keys: { openai: "test" }, models: { openai: "gpt-test" }, urls: {} } }));
      });
      let sent = null;
      await page.route("https://api.openai.com/**", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        sent = { url: route.request().url(), body: JSON.parse(route.request().postData() ?? "{}") };
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ created: 1, data: [{ b64_json: PNG }, { b64_json: PNG }] }) });
      });
      await h.create("Images");
      await openSettings(page);
      await page.getByLabel("Activer le mode Atelier pour ce projet").check();
      await page.keyboard.press("Escape");
      const id = await h.newCard("Inès Morvan");
      await h.node(id).locator(".card-type").click();
      await page.getByRole("option", { name: "Personnage", exact: true }).click();
      // Sa fiche dans la Bible, puis « Générer une image » dans la galerie.
      await h.node(id).locator(".card-bible").click();
      await page.getByRole("button", { name: "Générer une image" }).first().click();
      await page.getByLabel("Ce que l’image doit montrer").fill("Inès Morvan, une femme de 34 ans, cheveux courts, ciré jaune.");
      await page.getByRole("button", { name: "Générer", exact: true }).click();
      await page.getByRole("button", { name: "Garder l’image proposée 1" }).waitFor();
      assert(sent?.url === "https://api.openai.com/v1/images/generations", `requête : ${sent?.url}`);
      assert(!/Inès|Morvan/.test(sent.body.prompt) && /34 ans/.test(sent.body.prompt) && /fictional/.test(sent.body.prompt), `consigne envoyée : ${sent.body.prompt}`);
      await page.getByRole("button", { name: "Garder l’image proposée 1" }).click();
      await until(() => page.locator(".ia-image-badge").count(), "l'image gardée n'est pas marquée dans la galerie");
      await h.saved((f) => {
        const card = f[`cartes/${id}.md`] ?? "";
        const image = /^image: ([\w-]+\.png)$/m.exec(card)?.[1];
        return image && card.includes(`iaImages: {"${image}":"openai, gpt-image-2.6-flare"}`) && /· Image · «\s?Inès Morvan\s?» · openai, gpt-image-2\.6-flare · 1 × 1 px/.test(f["ia-journal.md"] ?? "");
      }, "image principale, marque ou ligne du journal non enregistrées");
    },
  },
  {
    name: "atelier : synopsis gardé juste après une frappe dans la vue Scénario, rien n'est perdu (1.8.1)",
    async run(h) {
      const { page } = h;
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", ai: { provider: "anthropic", keys: { anthropic: "test" }, models: { anthropic: "claude-test" }, urls: {} } }));
      });
      await page.route("https://api.anthropic.com/**", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: "Inès veille seule pendant la tempête." }] }) });
      });
      await h.create("Le Phare", "scenario");
      await openSettings(page);
      await page.getByLabel("Activer le mode Atelier pour ce projet").check();
      await page.keyboard.press("Escape");
      await h.view(4);
      await page.getByRole("textbox", { name: "Texte du scénario" }).click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne au-dessus de la mer qui gronde fort.");
      await h.wait(500);
      await page.getByRole("button", { name: "Proposer un synopsis" }).click();
      const keep = page.getByRole("button", { name: "Garder ce synopsis" });
      await keep.waitFor();
      // Une frappe qui n'a pas encore été envoyée (250 ms), puis « Garder » aussitôt.
      await page.getByRole("textbox", { name: "Texte du scénario" }).press("End");
      await page.keyboard.type(" Puis rien.");
      await keep.click();
      await h.saved((f) => {
        const fountain = f["scenario.fountain"] ?? "";
        return /= Inès veille seule pendant la tempête\. \[\[ia\]\]/.test(fountain) && /Puis rien\./.test(fountain);
      }, "le synopsis ou la frappe d'avant ont été perdus");
    },
  },
  {
    name: "scénario : le synopsis s'écrit dans la colonne de droite, invisible dans la feuille, et reste sous son en-tête (novembre 2026)",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare", "scenario");
      await h.view(4);
      const editor = page.getByRole("textbox", { name: "Texte du scénario" });
      await editor.click();
      await page.keyboard.type("INT. PHARE – NUIT");
      await page.keyboard.press("Enter");
      await page.keyboard.type("La lanterne tourne.");
      await h.wait(500);
      await page.getByRole("button", { name: /^Ajouter un synopsis à la scène/ }).click();
      await page.keyboard.type("Inès veille seule.");
      await page.keyboard.press("Enter");
      await h.saved((f) => /PHARE – NUIT.*\n\n?= Inès veille seule\./.test(f["scenario.fountain"] ?? ""), "le synopsis n'est pas sous l'en-tête");
      assert(!(await page.locator('.sp-preserved[data-preserved="synopsis"]').first().isVisible()), "le synopsis est visible dans la feuille");
      // Entrée au bout de l'en-tête : le nouvel élément passe sous le synopsis caché, qui reste celui de la scène.
      await page.locator(".sp-sceneHeading").first().click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Le vent souffle.");
      await h.saved((f) => {
        const fountain = f["scenario.fountain"] ?? "";
        return fountain.indexOf("= Inès veille seule.") < fountain.indexOf("Le vent souffle.") && /PHARE – NUIT[^\n]*\n\n?= Inès/.test(fountain);
      }, "le synopsis a quitté son en-tête");
      assert((await page.getByLabel("Montrer les synopsis").count()) === 0, "la case « Montrer les synopsis » est encore là");
    },
  },
  {
    name: "IA : relecture scène par scène, question dans « Vérifier », gardée en carte Question reliée (1.9.0)",
    async run(h) {
      const { page } = h;
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", ai: { provider: "anthropic", keys: { anthropic: "test" }, models: { anthropic: "claude-test" }, urls: {} } }));
      });
      let asked = null;
      await page.route("https://api.anthropic.com/**", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        asked = JSON.parse(route.request().postData() ?? "{}");
        const sent = JSON.parse(asked.messages[0].content);
        const ines = sent.cards.find((c) => c.title === "Inès Morvan")?.id;
        const items = [
          { scenes: ["s1"], cards: [ines], question: "Inès a-t-elle les yeux verts ou bleus ?", quote: "les yeux verts" },
          { scenes: ["s7"], cards: [], question: "Scène inventée ?" },
        ];
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ items }) }] }) });
      });
      await h.create("Relecture");
      const ines = await h.newCard("Inès Morvan");
      await h.node(ines).locator(".card-type").click();
      await page.getByRole("option", { name: "Personnage", exact: true }).click();
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("L’arrivée");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.click();
      await page.keyboard.type("Inès Morvan a les yeux verts. Plus loin, ses yeux bleus brillent.");
      await h.wait(500);
      await page.getByRole("button", { name: "IA", exact: true }).click();
      await page.getByRole("button", { name: "Cohérence scène par scène" }).click();
      const question = page.locator(".ai-review .review-item", { hasText: "les yeux verts ou bleus" });
      await until(() => question.isVisible(), "la question de l'IA n'arrive pas dans « Vérifier »");
      assert(/yeux verts/.test(JSON.parse(asked.messages[0].content).scenes[0].text), "le texte de la scène n'est pas envoyé");
      assert(!/Scène inventée/.test(await page.locator(".ai-review").innerText()), "une scène inconnue a été gardée");
      await question.getByRole("button", { name: "Aller à la scène « L’arrivée »" }).click();
      await until(() => page.evaluate(() => window.getSelection()?.toString() === "les yeux verts"), "le passage cité n'est pas sélectionné");
      const before = await h.files();
      await question.getByRole("button", { name: "Garder en question" }).click();
      await until(async () => (await page.locator(".ai-review .review-item").count()) === 0, "la question gardée reste dans la liste");
      await h.saved((f) => {
        const file = Object.entries(f).find(([k, v]) => k.startsWith("cartes/") && !before[k] && /type: question/.test(v));
        if (!file) return false;
        const id = file[0].slice(7, -3);
        const links = JSON.parse(f["cosmos.json"]).links ?? [];
        return /yeux verts ou bleus/.test(file[1]) && links.filter((l) => l.source === id).length === 2;
      }, "la carte Question reliée à Inès et à la scène n'est pas enregistrée");
    },
  },
  {
    name: "couverture générée : style conseillé selon le genre, nom de l'auteur écrit seulement sur demande, place laissée au titre",
    async run(h) {
      const { page } = h;
      const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      await page.addInitScript(() => {
        if (!localStorage.getItem("cosmos:reglages")) localStorage.setItem("cosmos:reglages", JSON.stringify({ lang: "fr", profile: { penName: "Claire Dumas" }, ai: { provider: "openai", keys: { openai: "test" }, models: { openai: "gpt-test" }, urls: {} } }));
      });
      const prompts = [];
      await page.route("https://api.openai.com/**", (route) => {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        prompts.push(JSON.parse(route.request().postData() ?? "{}").prompt ?? "");
        return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ created: 1, data: [{ b64_json: PNG }] }) });
      });
      await h.create("Le Phare");
      await openSettings(page);
      await page.getByLabel("Activer le mode Atelier pour ce projet").check();
      await page.keyboard.press("Escape");
      await h.view(3);
      await page.getByRole("button", { name: "Choisir : Genre" }).click();
      await page.getByLabel("Genre, saisie libre").fill("Thriller psychologique");
      await page.getByRole("button", { name: "Valider" }).click();
      await page.getByRole("button", { name: "Générer une image" }).first().click();
      const style = page.getByLabel("Style de l’image");
      await style.waitFor();
      const chosen = await style.evaluate((el) => el.selectedOptions[0]?.textContent ?? "");
      assert(/Selon le genre\s?:\s?Photographie/.test(chosen), `style par défaut : ${chosen}`);
      await until(() => page.getByText(/Polar et thriller/).isVisible(), "pas de conseil pour le genre");
      await page.getByRole("button", { name: "1 image" }).click();
      await page.getByRole("button", { name: "Générer", exact: true }).click();
      await until(() => prompts.length === 1, "première demande non partie");
      assert(/Style: cinematic photograph/.test(prompts[0]) && /Composition: leave calm/.test(prompts[0]) && !/Claire|Dumas/.test(prompts[0]), `consigne sans nom : ${prompts[0]}`);
      await page.getByLabel("Écrire ton nom sur l’image").check();
      await style.selectOption("noir");
      await page.getByRole("button", { name: "Générer", exact: true }).click();
      await until(() => prompts.length === 2, "seconde demande non partie");
      assert(/the author's name on the image[^\n]*"Claire Dumas"/.test(prompts[1]) && /Style: black and white/.test(prompts[1]) && /top third for the title/.test(prompts[1]), `consigne avec le nom : ${prompts[1]}`);
    },
  },
  {
    name: "livre broché (#78) : couverture complète de l'exemple, aperçu, contrôles et réglage gardé dans le projet",
    async run(h) {
      const { page } = h;
      await h.example();
      await page.getByRole("button", { name: "Exporter", exact: true }).click();
      await page.getByText("Livre broché (KDP)…", { exact: true }).click();
      const preview = page.locator(".full-cover-preview canvas:not(.is-hidden):not(.is-working)");
      await until(() => preview.isVisible(), "pas d'aperçu de la couverture complète", 30000);
      const size = await preview.evaluate((c) => ({ w: c.width, h: c.height }));
      // Quatrième, dos et premier plat côte à côte : bien plus large que haute.
      assert(size.w > size.h * 1.15, `aperçu de ${size.w} × ${size.h}`);
      // Le petit exemple fait moins de 80 pages : pas de texte sur le dos, et c'est dit.
      await until(() => page.getByText(/Moins de 80 pages/).isVisible(), "le contrôle du dos n'est pas affiché");
      await page.locator(".full-cover select").first().selectOption("bottom");
      await until(() => preview.isVisible(), "l'aperçu ne revient pas après un réglage", 30000);
      await h.saved((f) => JSON.parse(f["cosmos.json"] ?? "{}").coverDesign?.titlePlace === "bottom", "coverDesign n'est pas enregistré");
    },
  },
  {
    name: "Bible (#52) : une couverture importée sous le titre du projet, enregistrée dans pitch.visuel, retirée par son menu",
    async run(h) {
      const { page } = h;
      await h.create("Le Phare");
      await h.view(3);
      const add = page.getByRole("button", { name: "Ajouter une couverture" });
      await until(() => add.isVisible(), "pas de bouton « Ajouter une couverture » sous le titre");
      await add.click();
      const device = page.getByRole("button", { name: "Choisir une image sur l’appareil…" });
      await device.waitFor();
      const chooser = page.waitForEvent("filechooser");
      await device.click();
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      await (await chooser).setFiles({ name: "couverture.png", mimeType: "image/png", buffer: png });
      await until(() => page.getByRole("img", { name: "Couverture du livre" }).isVisible(), "la couverture ne s'affiche pas sous le titre");
      await h.saved((f) => /^[A-Za-z0-9_-]+\.png$/.test(JSON.parse(f["cosmos.json"] ?? "{}").pitch?.visuel ?? ""), "pitch.visuel n'est pas enregistré");
      await h.reloadAndOpen();
      await h.view(3);
      await until(() => page.getByRole("img", { name: "Couverture du livre" }).isVisible(), "après rechargement, la couverture a disparu");
      await page.getByRole("button", { name: "Actions sur l’image" }).click();
      await page.getByRole("menuitem", { name: "Retirer l’image" }).click();
      await until(() => add.isVisible(), "l'image retirée, le bouton ne revient pas");
      await h.saved((f) => !JSON.parse(f["cosmos.json"] ?? "{}").pitch?.visuel, "pitch.visuel est resté après le retrait");
    },
  },
  {
    name: "Plan : gabarit imbriqué (#111), un ensemble et ses sous-cases, décalées dans l'éditeur",
    async run(h) {
      const { page } = h;
      await h.create("Gabarit imbriqué");
      await h.view(2);
      const select = page.locator(".plan-template select");
      await select.waitFor();
      const chooser = page.waitForEvent("filechooser");
      await select.selectOption("__import");
      const md = "# En actes\n\n## Acte I\n\n### Mise en place\n\n### L’appel\n\n## Acte II\n";
      await (await chooser).setFiles({ name: "actes.md", mimeType: "text/markdown", buffer: Buffer.from(md) });
      const dialog = page.locator("dialog[open]");
      await until(() => dialog.locator(".tpl-row.level-2").first().isVisible(), "les sous-cases ne sont pas en retrait dans l'éditeur");
      // « Acte II » décalé à droite devient une sous-case d'« Acte I » ; le bouton suivant est grisé (au plus un niveau de plus).
      await dialog.getByRole("button", { name: "Décaler à droite l’étape « Acte II »" }).click();
      assert((await dialog.locator(".tpl-row.level-2").count()) === 3, "Acte II n'est pas passé au niveau 2");
      await dialog.getByRole("button", { name: "Décaler à gauche l’étape « Acte II »" }).click();
      await dialog.getByRole("button", { name: "Utiliser dans ce projet" }).click();
      await h.saved((f) => {
        const beats = JSON.parse(f["cosmos.json"] ?? "{}").plan?.custom?.beats ?? [];
        return beats.length === 4 && beats[1].level === 2 && beats[2].level === 2 && !beats[3].level;
      }, "les niveaux ne sont pas enregistrés dans le plan");
      // L'ensemble n'a ni rang ni « Nouvelle scène » ; ses sous-cases sont en retrait et numérotées sur trois.
      const group = page.locator(".plan-beat.is-group").first();
      await group.waitFor();
      assert(!(await group.locator(".beat-rank").count()), "un ensemble ne doit pas avoir de rang");
      assert(!(await group.locator(".plan-add").count()), "un ensemble ne doit pas avoir de champ « Nouvelle scène »");
      assert((await page.locator(".plan-beat.level-2").count()) === 2, "les sous-cases ne sont pas en retrait dans le Plan");
      await until(() => page.getByText("Étape 3 sur 3").isVisible(), "le rang ne compte pas que les cases du bas");
    },
  },
  {
    name: "Plan : un gabarit importé d'un fichier Markdown se pose, puis s'exporte",
    async run(h) {
      const { page } = h;
      await h.create("Gabarit importé");
      await h.view(2);
      const select = page.locator(".plan-template select");
      await select.waitFor();
      const chooser = page.waitForEvent("filechooser");
      await select.selectOption("__import");
      const md = "# Mon polar\n\n## Le crime\nUn corps, une question.\n\n## L’enquête\n\n## La vérité\nLe coupable est démasqué.\n";
      await (await chooser).setFiles({ name: "polar.md", mimeType: "text/markdown", buffer: Buffer.from(md) });
      const dialog = page.locator("dialog[open]");
      await until(() => dialog.getByText("Importé de « polar.md »", { exact: false }).isVisible(), "l'éditeur ne dit pas d'où vient le gabarit");
      const labels = await dialog.locator("input[type=text]").evaluateAll((els) => els.map((e) => e.value));
      assert(labels.includes("Mon polar") && labels.includes("Le crime") && labels.includes("La vérité"), `cases lues : ${labels.join(" | ")}`);
      await dialog.getByRole("button", { name: "Utiliser dans ce projet" }).click();
      await h.saved((f) => {
        const plan = JSON.parse(f["cosmos.json"] ?? "{}").plan;
        return plan?.template === "perso" && plan.custom?.name === "Mon polar" && plan.custom.beats.length === 3;
      }, "le gabarit importé n'est pas enregistré dans le plan");
      const download = page.waitForEvent("download");
      await select.selectOption("__export");
      const file = await download;
      assert(file.suggestedFilename() === "Mon polar.md", `nom proposé : ${file.suggestedFilename()}`);
      const text = (await import("node:fs")).readFileSync(await file.path(), "utf8");
      assert(/^# Mon polar/.test(text) && /## L’enquête/.test(text) && /Le coupable est démasqué/.test(text), `fichier exporté : ${text}`);
      // 1.13.1 : « Gérer mes gabarits… » retire un gabarit gardé (⋯, en rouge), Annuler le remet, le projet n'y perd rien.
      const mine = () => select.locator("option", { hasText: "Mon polar" }).count();
      await select.selectOption("__manage");
      const manage = page.locator("dialog.tpl-manage[open]");
      await manage.waitFor();
      const forget = async () => {
        await manage.getByRole("button", { name: "Actions pour « Mon polar »" }).click();
        const item = page.getByRole("menuitem", { name: "Retirer de mes structures" });
        await item.waitFor();
        assert(await item.evaluate((el) => !!el.closest("dialog")), "le menu ⋯ n'est pas dans la fenêtre (il passerait dessous)");
        await item.click();
      };
      await forget();
      await until(() => manage.getByText("est retirée de tes structures", { exact: false }).isVisible(), "pas de message après le retrait");
      await manage.getByRole("button", { name: "Annuler", exact: true }).click();
      await until(() => manage.getByRole("button", { name: "Actions pour « Mon polar »" }).isVisible(), "Annuler n'a pas remis le gabarit");
      await forget();
      await manage.getByRole("button", { name: "Fermer", exact: true }).click();
      await until(async () => !(await page.locator("dialog.tpl-manage[open]").count()), "la fenêtre ne se ferme pas");
      // Le gabarit en place reste celui du projet ; plus aucun gabarit gardé à part lui.
      assert((await select.inputValue()) === "perso", "le projet a perdu son gabarit");
      assert((await select.locator("option[value^='mine:']").count()) === 0 && (await mine()) === 1, "le gabarit retiré est encore proposé");
    },
  },
  {
    name: "import Scrivener : un .scriv zippé devient un roman (chapitres, scènes, synopsis, statuts) avec sa Bible, après le choix des dossiers",
    async run(h) {
      const { page } = h;
      const { zipSync, strToU8 } = await import("fflate");
      // Projet à la façon de Scrivener 3 sur Mac : nom encodé, RTF en cp1252, __MACOSX, index à ignorer.
      const rtf = (body) => `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761{\\fonttbl\\f0\\fnil Palatino;}{\\colortbl;\\red255\\green255\\blue255;}\\pard\\f0\\fs26 ${body}}`;
      const item = (uuid, type, title, meta = "", children = "") => `<BinderItem UUID="${uuid}" Type="${type}"><Title>${title}</Title><MetaData>${meta}</MetaData>${children ? `<Children>${children}</Children>` : ""}</BinderItem>`;
      const binder =
        item("D", "DraftFolder", "Manuscrit", "", item("C1", "Text", "Chapitre 1 - Le d\u00e9part", "<StatusID>4</StatusID>") + item("F2", "Folder", "Chapitre 2", "", item("S21", "Text", "Le quai") + item("S22", "Text", "Le train"))) +
        item("P", "Folder", "Personnages", "", item("E", "Text", "Ethan")) +
        item("N", "Folder", "Notes", "", item("N1", "Text", "Id\u00e9e"));
      const scrivx = `<?xml version="1.0" encoding="UTF-8"?><ScrivenerProject Version="2.0"><Binder>${binder}</Binder><StatusSettings><StatusItems><Status ID="4">Termin\u00e9</Status></StatusItems></StatusSettings></ScrivenerProject>`;
      const root = "Sacr#U00e9 Bonhomme.scriv/";
      const zip = zipSync({
        [`${root}Sacr#U00e9 Bonhomme.scrivx`]: strToU8(scrivx),
        [`${root}Files/Data/C1/content.rtf`]: strToU8(rtf("\\'97 Tu viens\\'a0? demanda Ethan.\\\nL\\'92\\'e9t\\'e9 finissait.\\\n")),
        [`${root}Files/Data/C1/synopsis.txt`]: strToU8("Ethan quitte la ville."),
        [`${root}Files/Data/S21/content.rtf`]: strToU8(rtf("Le quai \\'e9tait vide.\\\n")),
        [`${root}Files/Data/S22/content.rtf`]: strToU8(rtf("Le train partit.\\\n")),
        [`${root}Files/Data/E/content.rtf`]: strToU8(rtf("Role in Story: H\\'e9ros\\\n")),
        [`${root}Files/Data/N1/content.rtf`]: strToU8(rtf("Une id\\'e9e.\\\n")),
        [`${root}Files/search.indexes`]: strToU8("x"),
        [`__MACOSX/${root}._Sacr#U00e9 Bonhomme.scrivx`]: strToU8("x"),
      });
      await h.home();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Importer…", exact: true }).click();
      await (await chooser).setFiles({ name: "Sacré Bonhomme.zip", mimeType: "application/zip", buffer: Buffer.from(zip) });
      // Choix des dossiers : tout est coché ; on décoche « Notes ».
      const choice = page.locator("dialog.scriv-choice[open]");
      await choice.waitFor();
      await choice.getByRole("checkbox", { name: /^Notes/ }).uncheck();
      await choice.getByRole("button", { name: "Importer", exact: true }).click();
      await until(() => page.locator(".scriv-report").getByText("Importé de Scrivener", { exact: false }).isVisible(), "pas de rapport d'import");
      await page.locator(".scriv-report summary").click();
      await until(() => page.locator(".scriv-report").getByText("Dossiers décochés", { exact: false }).isVisible(), "le rapport ne dit pas le dossier décoché");
      await until(() => page.getByText("Le départ", { exact: false }).first().isVisible(), "le premier chapitre n'apparaît pas dans le Manuscrit");
      await h.saved((f) => {
        const meta = JSON.parse(f["cosmos.json"] ?? "{}");
        const texts = Object.entries(f).filter(([k]) => k.startsWith("manuscrit/")).map(([, v]) => v).join("\n");
        const cards = Object.entries(f).filter(([k]) => k.startsWith("cartes/")).map(([, v]) => v);
        return (
          meta.title === "Sacré Bonhomme" &&
          meta.plan?.chapters?.length === 2 &&
          meta.plan.chapters[1].scenes.length === 2 &&
          texts.includes("— Tu viens\u00a0? demanda Ethan.") &&
          texts.includes("L’été finissait.") &&
          cards.some((c) => c.includes('title: "Le départ"') && c.includes('"synopsis":"Ethan quitte la ville."') && c.includes('"statut":"fini"')) &&
          cards.some((c) => c.includes("type: personnage") && c.includes('title: "Ethan"') && c.includes('"role":"Héros"')) &&
          !cards.some((c) => c.includes('title: "Idée"')) &&
          meta.frames?.some((fr) => fr.title === "Personnages")
        );
      }, "le projet importé de Scrivener n'est pas enregistré comme attendu");
    },
  },
  {
    name: "carte agrandie (1.13.1) : statut, point de vue et menu ⋯ s'ouvrent et répondent dans la fenêtre",
    async run(h) {
      const { page } = h;
      await h.create("Carte agrandie");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le réveil");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      await h.wait(300);
      await h.view(1);
      const card = page.locator(".react-flow__node", { hasText: "Le réveil" }).first();
      await card.getByRole("button", { name: "Agrandir la carte" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.waitFor();
      // Statut : le menu est dans la fenêtre et le choix est pris.
      await dialog.getByRole("button", { name: /^Statut de la scène « Le réveil »/ }).click();
      const done = page.getByRole("option", { name: "Terminée" });
      await done.waitFor();
      assert(await done.evaluate((el) => !!el.closest("dialog")), "le menu du statut n'est pas dans la fenêtre");
      await done.click();
      await until(async () => (await dialog.getByRole("button", { name: /^Statut de la scène « Le réveil »/ }).getAttribute("aria-label")).endsWith("Terminée"), "le statut n'a pas changé");
      // Point de vue : narrateur créé depuis la carte agrandie.
      await dialog.getByRole("button", { name: /^Point de vue de la scène « Le réveil »/ }).click();
      const field = page.getByRole("combobox", { name: "Chercher ou créer un personnage" });
      await field.waitFor();
      await field.fill("Ethan");
      await page.getByRole("option", { name: "Créer « Ethan »" }).click();
      await until(async () => (await dialog.getByRole("button", { name: /^Point de vue de la scène « Le réveil »/ }).getAttribute("aria-label")).endsWith("Ethan"), "le point de vue n'a pas changé");
      // Menu ⋯ : « Versions de la scène… » ouvre sa fenêtre.
      await dialog.locator(".expanded-more").click();
      const versions = page.getByRole("menuitem", { name: /^Versions de la scène/ });
      await versions.waitFor();
      await versions.click();
      await until(() => page.locator("dialog[open].is-versions").isVisible(), "le menu ⋯ de la carte agrandie ne répond pas");
      await h.saved((f) => Object.values(f).some((v) => typeof v === "string" && v.includes("type: scene") && v.includes('"statut":"fini"')), "le statut choisi dans la carte agrandie n'est pas enregistré");
    },
  },
  {
    name: "lot 1 (1.18.0) : fusionner une scène avec la suivante, annuler ; police et interligne de la page",
    async run(h) {
      const { page } = h;
      await h.create("Fusion");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Arrivée");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("Début de la scène.");
      // Entrée sur une ligne vide coupe la scène : la suite part dans une nouvelle scène.
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Suite de la scène.");
      await h.saved((f) => Object.keys(f).filter((k) => k.startsWith("manuscrit/")).length === 2, "la coupure n'a pas fait deux scènes");
      // Revenir dans la première scène, puis ⋯ › « Fusionner avec la scène suivante ».
      await editor.getByText("Début de la scène.").click();
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Fusionner avec la scène suivante" }).click();
      const notice = page.locator(".trash-notice");
      await until(() => notice.isVisible(), "pas de message après la fusion");
      await h.saved((f) => {
        const texts = Object.entries(f).filter(([k]) => k.startsWith("manuscrit/")).map(([, v]) => v);
        return texts.length === 1 && texts[0].includes("Début de la scène.") && texts[0].includes("Suite de la scène.");
      }, "les deux textes ne sont pas réunis dans une seule scène");
      await notice.getByRole("button", { name: "Annuler" }).click();
      await h.saved((f) => Object.keys(f).filter((k) => k.startsWith("manuscrit/")).length === 2, "Annuler n'a pas remis les deux scènes");
      // Réglages › Écriture : police et interligne de la page, appliqués à l'écran.
      const before = await page.locator(".ms-page").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize));
      await openSettings(page);
      await page.getByRole("tab", { name: "Écriture" }).click();
      await page.getByLabel("Police de la page (manuscrit)").selectOption("literata");
      await page.getByLabel("Interligne de la page (manuscrit)").selectOption("double");
      await page.keyboard.press("Escape");
      await until(async () => (await page.locator(".ms-page").evaluate((el) => getComputedStyle(el).fontFamily)).includes("Literata"), "la police de la page n'a pas changé");
      const after = await page.locator(".ms-page").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize));
      assert(Math.abs(before - 1.6) < 0.01 && Math.abs(after - 2.4) < 0.01, `interligne ${before} puis ${after}`);
    },
  },
  {
    name: "lot 3 (1.19.0) : palette de commandes, reprendre là où j'en étais",
    async run(h) {
      const { page } = h;
      await h.create("Palette");
      // Ctrl + K : la palette ; « nouvelle carte » puis Entrée crée une carte sur le canevas.
      await page.keyboard.press("Control+k");
      const input = page.getByRole("searchbox", { name: "Commande à lancer" });
      await input.waitFor();
      await input.fill("nouvelle carte");
      await input.press("Enter");
      await until(async () => (await page.locator(".card").count()) === 1, "la palette n'a pas créé de carte");
      // Seules les commandes possibles ici : pas de mode focus sur le canevas.
      await page.keyboard.press("Escape");
      await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
      await page.keyboard.press("Control+k");
      await input.fill("mode focus");
      await until(() => page.getByText("Aucune commande ne correspond.").isVisible(), "le mode focus est proposé sur le canevas");
      await input.fill("manuscrit");
      await input.press("Enter");
      await page.getByPlaceholder("Titre de la première scène…").waitFor();
      await page.getByPlaceholder("Titre de la première scène…").fill("La tempête");
      await page.getByPlaceholder("Titre de la première scène…").press("Enter");
      const editor = page.locator(".ProseMirror[contenteditable=true]").first();
      await editor.waitFor();
      await editor.click();
      await page.keyboard.type("Première phrase. Deuxième phrase.");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && v.includes("Deuxième phrase.")), "le texte n'est pas enregistré");
      // Retour aux projets, puis « Reprendre là où j'en étais » : le Manuscrit, la scène, le curseur au bout du texte.
      await page.getByRole("button", { name: "Projets" }).first().click();
      const resume = page.getByRole("button", { name: /Reprendre là où j’en étais/ });
      await resume.waitFor();
      assert((await resume.textContent()).includes("La tempête"), "la scène n'est pas nommée sur l'accueil");
      await resume.click();
      await page.locator(".ms-page").waitFor();
      await until(
        () => page.evaluate(() => {
          const sel = window.getSelection();
          return !!sel && document.activeElement?.closest(".ProseMirror") != null && (sel.anchorNode?.textContent ?? "").includes("Deuxième") && sel.anchorOffset > 20;
        }),
        "le curseur n'est pas revenu à sa place",
      );
    },
  },
  {
    name: "lot 10 (ergonomie 2) : menu de l'app, une ligne au-dessus de la page, statut dans l'onglet Scène, « Ranger » d'une scène, aides apprises",
    async run(h) {
      const { page } = h;
      await h.example();
      // #57 : le bouton des Réglages ouvre le menu de l'app (Corbeille, Commandes, aide).
      await page.getByRole("button", { name: "Réglages et aide", exact: true }).click();
      await until(() => page.getByRole("menuitem", { name: /^Corbeille \(/ }).isVisible(), "la Corbeille n'est pas dans le menu de l'app");
      await page.getByRole("menuitem", { name: /^Commandes…/ }).click();
      await page.getByRole("searchbox", { name: "Commande à lancer" }).waitFor();
      await page.keyboard.press("Escape");
      // #56 : les mêmes vues, dans le même ordre, avec Cmd/Ctrl + 1 à 4.
      const order = await page.locator(".topbar .views button").allTextContents();
      assert(order.join("|") === "Canevas|Plan|Bible|Manuscrit", `ordre des vues : ${order.join(", ")}`);
      // #54 : au-dessus de la page, ni statut ni point de vue ; ils sont dans l'onglet « Scène ».
      await h.view(4);
      await page.locator(".ms-meta").waitFor();
      assert((await page.locator(".ms-meta .status-picker, .ms-meta select").count()) === 0, "statut, point de vue ou type de page encore au-dessus de la page");
      await until(() => page.locator(".ms-scene-props select").isVisible(), "le type de page n'est pas dans l'onglet Scène");
      await page.locator(".ms-meta .more-button").click();
      await page.getByRole("menuitem", { name: /^Mode focus/ }).click();
      await until(() => page.locator(".manuscript.is-focus").count(), "Mode focus du menu ⋯ sans effet");
      await page.keyboard.press("Escape");
      // Novembre 2026 : le volet des scènes n'a que les titres ; le synopsis est dans la colonne de droite.
      assert((await page.locator(".ms-scenes .synopsis-show").count()) === 0, "des synopsis sont dans le volet des scènes");
      assert((await page.getByLabel("Montrer les synopsis").count()) === 0, "la case « Montrer les synopsis » est encore là");
      // #55 : chapitre et case derrière « Ranger ».
      await h.view(2);
      assert((await page.locator(".plan-meta").count()) === 0, "chapitre et case encore visibles sans « Ranger »");
      await page.getByRole("button", { name: /^Ranger : / }).first().click();
      await until(async () => (await page.locator(".plan-meta select").count()) === 2, "« Ranger » n'ouvre pas chapitre et case");
      // #59 : la consigne du canevas part une fois les trois gestes faits.
      await h.view(1);
      assert(await page.locator(".toile-hint").isVisible(), "la consigne du canevas n'est pas là au départ");
      await h.newCard("Une idée");
      await h.pane();
      // Un seul geste sur trois : la consigne reste, le progrès est noté sur l'appareil.
      await until(() => page.evaluate(() => (JSON.parse(localStorage.getItem("mondowrite.learn") ?? "{}").canvasHint ?? []).includes("card")), "la carte créée n'est pas notée");
      assert(await page.locator(".toile-hint").isVisible(), "la consigne part avant les trois gestes");
      // Apprise (réglage de l'appareil) : elle ne s'affiche plus.
      await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem("cosmos:reglages") ?? "{}");
        localStorage.setItem("cosmos:reglages", JSON.stringify({ ...saved, learned: ["canvasHint"] }));
      });
      await h.reloadAndOpen();
      assert(!(await page.locator(".toile-hint").isVisible()), "la consigne apprise est encore affichée");
    },
  },
  {
    name: "roman interactif (lots 0 à 3) : option des Réglages, création, carte des choix, choix écrit dans le Manuscrit, lecture, relu après rechargement",
    async run(h) {
      const { page } = h;
      await h.home();
      assert((await page.locator('.home-kinds input[value="interactive"]').count()) === 0, "« Un roman interactif » est proposé alors que l'option est coupée");
      await openSettings(page);
      if (await page.getByRole("tab", { name: "Général", exact: true }).count()) await page.getByRole("tab", { name: "Général", exact: true }).click();
      await page.getByRole("checkbox", { name: "Roman interactif" }).check();
      await page.keyboard.press("Escape");
      const radio = page.locator('.home-kinds input[value="interactive"]');
      await until(() => radio.isVisible(), "l'option cochée, « Un roman interactif » n'apparaît pas à la création");
      await page.locator(".home-form input[type=text]").fill("Le Puits");
      await radio.check();
      await page.locator(".home-create").click();
      await h.canvas();
      await h.saved((f) => JSON.parse(f["cosmos.json"] ?? "{}").interactive === true, "le projet n'est pas enregistré en roman interactif");

      // Sections du livre (Plan) : une première scène ; ni chronologie ni carte des choix à part (lot 11).
      await h.view(2);
      await until(() => page.getByRole("heading", { name: "Sections du livre" }).isVisible(), "le Plan d'un roman interactif ne s'appelle pas « Sections du livre »");
      assert((await page.getByRole("button", { name: "Chronologie" }).count()) === 0, "la chronologie est proposée dans un roman interactif");
      assert((await page.getByRole("button", { name: "Carte des choix" }).count()) === 0, "la carte des choix est encore une présentation du Plan");
      await page.getByPlaceholder("Nouvelle scène…").fill("La cour");
      await page.getByPlaceholder("Nouvelle scène…").press("Enter");
      await until(async () => (await page.locator(".plan-section-number").count()) === 1, "la scène n'a pas son numéro de section");

      // Le canevas est la carte des choix : une scène après la première (avec son choix), puis une fin.
      await h.view(1);
      const sceneCards = page.locator(".react-flow__node-card:has(.card.type-scene)");
      await until(async () => (await sceneCards.count()) === 1, "la scène n'est pas sur le canevas");
      await until(() => sceneCards.first().locator(".choice-tag.is-start").isVisible(), "la première scène n'est pas marquée « Départ » sur le canevas");
      await until(async () => (await sceneCards.first().locator(".card-section").textContent()) === "1", "la première scène n'a pas le numéro 1 sur sa carte");
      await sceneCards.first().getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Nouvelle scène après celle-ci" }).click();
      await until(async () => (await sceneCards.count()) === 2, "« Nouvelle scène après celle-ci » n'a pas créé de seconde scène");
      const arrows = page.locator(".react-flow__edge.choice-edge");
      await until(async () => (await arrows.count()) === 1, "pas de flèche de choix entre les deux scènes");
      const first = await sceneCards.first().getAttribute("data-id");
      const second = (await sceneCards.evaluateAll((els) => els.map((e) => e.dataset.id))).find((id) => id !== first);
      const secondCard = page.locator(`.react-flow__node-card[data-id="${second}"]`);
      await secondCard.getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Ajouter un choix « Fin »" }).click();
      await until(() => secondCard.locator(".choice-tag.is-end").isVisible(), "la seconde scène n'est pas marquée « Fin »");
      // Lot 14 : la fin devient une bonne fin par le menu ⋯ de la carte, écrite `#good` dans le bloc.
      await secondCard.getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "En faire une bonne fin" }).click();
      await until(async () => (await secondCard.locator(".choice-tag.is-end.is-good").textContent()) === "Bonne fin", "la seconde scène n'est pas marquée « Bonne fin »");
      await h.saved((f) => (f[`manuscrit/${second}.md`] ?? "").includes("-> END #good"), "la bonne fin n'est pas écrite #good");
      await h.saved((f) => {
        const blocks = Object.entries(f).filter(([k]) => k.startsWith("manuscrit/")).map(([, v]) => v);
        const meta = JSON.parse(f["cosmos.json"] ?? "{}");
        const wires = (meta.links ?? []).length;
        return blocks.length === 2 && blocks.every((v) => v.includes("```choix")) && (f[`manuscrit/${second}.md`] ?? "").includes("-> END") && wires === 0 && !meta.choiceMap;
      }, "les choix ne sont pas enregistrés en bloc ```choix (avec -> END pour la fin), ou une flèche est devenue un fil");
      // Une flèche choisie par son étiquette en pilule : son bandeau, dont le texte s'écrit dans le bloc de la scène.
      const pill = page.locator(".edge-pill");
      await until(async () => (await pill.count()) === 1, "l'étiquette du choix n'est pas une pilule");
      await pill.first().click();
      const edgeText = page.locator(".choice-edge-editor").getByRole("textbox", { name: "Texte du choix", exact: true });
      await until(() => edgeText.isVisible(), "choisir une flèche n'ouvre pas son bandeau");
      await edgeText.fill("Avancer");
      await edgeText.press("Enter");
      await h.saved((f) => (f[`manuscrit/${first}.md`] ?? "").includes("[Avancer]"), "le texte du choix tapé sur le canevas n'est pas enregistré");
      await until(async () => (await pill.first().textContent()) === "Avancer", "la pilule ne montre pas le texte du choix");
      await h.view(2);

      // Lecture depuis les sections du livre : le choix puis la fin.
      await page.getByRole("button", { name: "Lire l’histoire" }).click();
      const play = page.locator(".play-panel");
      await until(async () => (await play.locator(".play-choices button").count()) === 1, "la lecture ne propose pas le choix de la première scène");
      await page.keyboard.press("1");
      await until(async () => (await play.locator(".play-chose").count()) === 1, "la touche 1 n'a pas choisi");
      await play.locator(".play-choices button").first().click();
      await until(() => play.getByText("Fin de l’histoire.").isVisible(), "la lecture n'arrive pas à la fin");
      await play.getByRole("button", { name: "Revenir au choix précédent" }).click();
      await until(async () => (await play.locator(".play-choices button").count()) === 1, "« Revenir au choix précédent » ne rend pas le choix");
      await page.keyboard.press("Escape");

      // Manuscrit : le texte du choix se tape dans l'encadré, il est enregistré, puis relu.
      await h.view(4);
      const label = page.getByRole("textbox", { name: "Texte du choix 1" }).first();
      await until(() => label.isVisible(), "pas d'encadré des choix dans le Manuscrit");
      const marks = await page.locator(".scene-mark-label").allTextContents();
      assert(marks.length === 2 && marks[0].startsWith("1. ") && marks[1].startsWith("2. "), `repères des scènes dans le Manuscrit : ${marks.join(" | ")}`);
      await label.fill("Descendre au puits");
      await label.press("Tab");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("manuscrit/") && v.includes("[Descendre au puits]")), "le texte du choix n'est pas enregistré");
      await h.reloadAndOpen();
      await h.view(4);
      await until(async () => (await page.getByRole("textbox", { name: "Texte du choix 1" }).first().inputValue()) === "Descendre au puits", "après rechargement, le texte du choix a changé");
      // Mode code : le bloc tel qu'il est écrit, modifiable ; « Voir les choix » montre le changement.
      await page.getByRole("button", { name: "Voir le code" }).first().click();
      const code = page.getByRole("textbox", { name: "Code des choix de la scène" }).first();
      await until(async () => (await code.inputValue()).includes("[Descendre au puits]"), "le code du bloc ne montre pas le choix");
      await code.fill((await code.inputValue()).replace("[Descendre au puits]", "[Descendre au fond]"));
      await page.getByRole("button", { name: "Voir les choix" }).first().click();
      await until(async () => (await page.getByRole("textbox", { name: "Texte du choix 1" }).first().inputValue()) === "Descendre au fond", "le choix modifié dans le code n'est pas repris");
      await page.getByRole("button", { name: "Voir les choix" }).first().click().catch(() => {});

      // Outils du roman linéaire masqués : ni chapitre ni fusion dans le menu, ni ruban.
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      assert((await page.getByRole("menuitem", { name: /Nouveau chapitre/ }).count()) === 0, "« Nouveau chapitre » est proposé dans un roman interactif");
      assert((await page.getByRole("menuitem", { name: /Fusionner/ }).count()) === 0, "« Fusionner » est proposé dans un roman interactif");
      await page.keyboard.press("Escape");
      assert((await page.locator("nav.ribbon").count()) === 0, "le ruban du récit est affiché dans un roman interactif");

      // Couper une scène (Entrée deux fois) : la scène coupée mène à la nouvelle par « Continuer ».
      const scenesBefore = Object.keys(await h.files()).filter((k) => k.startsWith("cartes/")).length;
      await page.locator(".ms-page .ProseMirror p").first().click();
      await page.keyboard.type("Avant la coupure.");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Après la coupure.");
      await h.saved((f) => {
        const cards = Object.keys(f).filter((k) => k.startsWith("cartes/"));
        const before = Object.values(f).find((v) => v.includes("Avant la coupure.") && v.includes("```choix"));
        return cards.length === scenesBefore + 1 && !!before && /\* \[\] -> \S+/.test(before);
      }, "la scène coupée n'a pas de « Continuer » vers la nouvelle");
      await page.getByRole("button", { name: "Annuler", exact: true }).first().click();
      await h.saved((f) => {
        const cards = Object.keys(f).filter((k) => k.startsWith("cartes/"));
        const text = Object.values(f).find((v) => v.includes("Avant la coupure."));
        return cards.length === scenesBefore && !!text && text.includes("Après la coupure.") && !/\* \[\] -> /.test(text);
      }, "annuler la coupure laisse un « Continuer » ou une scène de trop");

      // Un roman ordinaire ne voit rien de tout cela.
      await page.locator(".topbar .tb-back").click();
      await page.locator(".home-form input[type=text]").fill("Roman ordinaire");
      await page.locator('.home-kinds input[value="roman"]').check();
      await page.locator(".home-create").click();
      await h.canvas();
      await h.view(2);
      await h.wait(300);
      assert((await page.getByRole("button", { name: "Chronologie" }).count()) === 1, "un roman ordinaire n'a plus la chronologie");
      assert((await page.getByRole("button", { name: "Carte des choix" }).count()) === 0, "un roman ordinaire montre la carte des choix");
      await h.view(4);
      await page.getByPlaceholder("Titre de la première scène…").fill("Le phare");
      await page.getByRole("button", { name: "Créer la scène" }).click();
      await until(() => page.locator(".ms-page .ProseMirror").isVisible(), "pas d'éditeur dans le Manuscrit");
      assert((await page.locator(".scene-mark-label").count()) === 0, "un roman ordinaire montre le repère des scènes");
    },
  },
  {
    name: "roman interactif : la pilule d'une flèche qui passe derrière une autre scène reste cliquable",
    async run(h) {
      const { page } = h;
      await page.addInitScript(() => {
        const key = "cosmos:reglages";
        const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (!saved.experimental?.interactive) localStorage.setItem(key, JSON.stringify({ ...saved, lang: "fr", experimental: { interactive: true } }));
      });
      await h.home();
      await page.locator(".home-form input[type=text]").fill("Trois scènes");
      await page.locator('.home-kinds input[value="interactive"]').check();
      await page.locator(".home-create").click();
      await h.canvas();
      await h.view(2);
      await page.getByPlaceholder("Nouvelle scène…").fill("A");
      await page.getByPlaceholder("Nouvelle scène…").press("Enter");
      await h.view(1);
      const cards = page.locator(".react-flow__node-card:has(.card.type-scene)");
      await until(async () => (await cards.count()) === 1, "la scène A n'est pas sur le canevas");
      const idA = await cards.first().getAttribute("data-id");
      const cardA = page.locator(`.react-flow__node-card[data-id="${idA}"]`);
      // A, puis B à sa droite, puis C à droite de B : la flèche A → C passe derrière B.
      await cardA.getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Nouvelle scène après celle-ci" }).click();
      await until(async () => (await cards.count()) === 2, "pas de scène B");
      const idB = (await cards.evaluateAll((els) => els.map((e) => e.dataset.id))).find((id) => id !== idA);
      await page.locator(`.react-flow__node-card[data-id="${idB}"]`).getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Nouvelle scène après celle-ci" }).click();
      await until(async () => (await cards.count()) === 3, "pas de scène C");
      await cardA.getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: "Ajouter un choix vers…" }).click();
      await page.locator(".choice-picker button", { hasText: /^3\./ }).click();
      const pills = page.locator(".edge-pill");
      await until(async () => (await pills.count()) === 3, "les trois choix n'ont pas leur pilule");
      await page.waitForTimeout(300);
      // Tout le canevas à l'écran.
      await page.locator(".react-flow__controls-fitview").click();
      await page.waitForTimeout(500);
      // Chaque pilule est sous le pointeur à sa place (aucune carte ne la couvre) et ouvre le bandeau de son choix.
      for (let i = 0; i < 3; i++) {
        const pill = pills.nth(i);
        const r = await pill.boundingBox();
        assert(r, `la pilule ${i + 1} n'est pas dessinée`);
        const on = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".edge-pill"), [r.x + r.width / 2, r.y + r.height / 2]);
        assert(on, `la pilule ${i + 1} (${await pill.getAttribute("aria-label")}) est couverte par une carte`);
        await pill.click();
        await until(() => page.locator(".choice-edge-editor").isVisible(), `la pilule ${i + 1} n'ouvre pas son bandeau`);
        await page.keyboard.press("Escape");
      }
    },
  },
  {
    name: "roman interactif : l'exemple « Le Puits » s'ouvre sur sa visite et sa carte des choix",
    async run(h) {
      const { page } = h;
      await page.addInitScript(() => {
        const key = "cosmos:reglages";
        const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (!saved.experimental?.interactive) localStorage.setItem(key, JSON.stringify({ ...saved, lang: "fr", experimental: { interactive: true } }));
      });
      await h.home();
      await page.getByRole("button", { name: "Essayer « Le Puits », un roman interactif" }).click();
      await page.getByRole("heading", { name: "Le canevas est la carte de l’histoire" }).waitFor({ timeout: 20_000 });
      await until(async () => (await page.locator(".react-flow__node").count()) > 20, "les scènes du Puits ne sont pas sur le canevas");
      await page.getByRole("button", { name: "Suivant", exact: true }).click();
      await page.getByRole("heading", { name: "Les choix se lisent en fin de scène" }).waitFor();
      await h.saved((f) => JSON.parse(f["cosmos.json"] ?? "{}").interactive === true && !Object.values(f).some((v) => v.includes("data-ia")));
      // Les gravures sont dans medias/ : la première scène s'ouvre sur la sienne, et la Bible a sa couverture.
      await page.getByRole("button", { name: "Fermer la visite" }).click();
      await h.view(4);
      await until(async () => (await page.locator(".ms-page img").count()) > 0 && (await page.locator(".ms-page img").first().evaluate((img) => img.naturalWidth > 0)), "les images du Puits ne s'affichent pas");
      await page.screenshot({ path: "scripts/e2e/captures/puits-manuscrit.png" });
      await h.view(3);
      await page.waitForTimeout(800);
      await page.screenshot({ path: "scripts/e2e/captures/puits-bible.png" });
    },
  },
  {
    name: "roman interactif (#103, #104) : choix fermés montrés en lecture, et lecture reprise après une correction",
    async run(h) {
      const { page } = h;
      await page.addInitScript(() => {
        const key = "cosmos:reglages";
        const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (!saved.experimental?.interactive) localStorage.setItem(key, JSON.stringify({ ...saved, lang: "fr", experimental: { interactive: true } }));
      });
      // Deux choix rejoignent « Le puits » ; seul le premier donne la clé, que demande le coffre.
      const twee = [
        ":: StoryTitle\nLe coffre\n",
        ':: StoryData\n{"start": "La cour", "format": "SugarCube"}\n',
        ":: La cour\nIl fait nuit.\n<<link [[Prendre la clé->Le puits]]>><<set $cle to true>><</link>>\n[[Aller au puits->Le puits]]\n",
        ":: Le puits\nL’eau est noire.\n<<if $cle>>[[Ouvrir le coffre->La lettre]]<</if>>\n[[Remonter->La cour]]\n",
        ":: La lettre\nUne lettre.\n",
      ].join("\n");
      await h.home();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Importer…", exact: true }).click();
      await (await chooser).setFiles({ name: "coffre.twee", mimeType: "text/plain", buffer: Buffer.from(twee) });
      await page.locator(".topbar").waitFor({ timeout: 20_000 });
      await h.saved((f) => Object.values(f).some((v) => /\{ cle \} \[Ouvrir le coffre\]/.test(v)), "le coffre n'est pas un choix à condition");
      await h.view(2);
      await page.getByRole("button", { name: "Lire l’histoire" }).click();
      const play = page.locator(".play-panel");
      const open = play.locator(".play-choices:not(.is-closed) button");
      await until(async () => (await open.count()) === 2, "la cour ne propose pas deux choix");
      await open.filter({ hasText: "Aller au puits" }).click();
      // Arrivé sans la clé : le coffre est fermé, et la raison est dite.
      const closed = play.locator(".play-closed");
      await until(async () => (await closed.count()) === 1, "le choix fermé n'est pas montré");
      const shown = (await closed.first().textContent()) ?? "";
      assert(/Ouvrir le coffre/.test(shown) && /avec «\s?cle\s?»/.test(shown), `choix fermé : ${shown}`);
      // La case le cache, pour lire comme un lecteur.
      await play.getByRole("checkbox", { name: "Montrer les choix fermés" }).uncheck();
      await until(async () => (await closed.count()) === 0, "décochée, la case ne cache pas les choix fermés");
      await play.getByRole("checkbox", { name: "Montrer les choix fermés" }).check();
      await page.keyboard.press("Escape");
      // Rouverte, la lecture propose de reprendre : un clic rejoue « Aller au puits ».
      await page.getByRole("button", { name: "Lire l’histoire" }).click();
      const resume = play.getByRole("button", { name: "Reprendre là où j’en étais (1 choix)" });
      await until(() => resume.isVisible(), "la lecture rouverte ne propose pas de reprendre");
      await resume.click();
      await until(async () => (await play.locator(".play-chose").allTextContents()).join("|") === "› Aller au puits", "la reprise n'a pas rejoué le choix");
      await until(async () => (await closed.count()) === 1, "après la reprise, le choix fermé n'est plus montré");
      assert(!(await resume.isVisible()), "le bouton de reprise reste après la reprise");
      // « Revenir au choix précédent » marche après une reprise.
      await play.getByRole("button", { name: "Revenir au choix précédent" }).click();
      await until(async () => (await open.count()) === 2, "après une reprise, le retour ne rend pas les choix de la cour");
    },
  },
  {
    name: "roman interactif (lots 5, 7, 8 et 9) : import Twee, lecture, « Vérifier », page web jouable, livre-jeu EPUB et livre broché, Ink",
    async run(h) {
      const { page } = h;
      const fs = await import("node:fs");
      await page.addInitScript(() => {
        const key = "cosmos:reglages";
        const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
        if (!saved.experimental?.interactive) localStorage.setItem(key, JSON.stringify({ ...saved, lang: "fr", experimental: { interactive: true } }));
      });
      const twee = [
        ":: StoryTitle\nLe Puits\n",
        ':: StoryData\n{"start": "La cour"}\n',
        ":: La cour\nIl fait nuit dans la cour.\n[[Descendre au puits->Le puits]]\n[[Rentrer->La maison]]\n",
        ":: Le puits\nL’eau est noire.\n[[Remonter->La cour]]\n",
        ":: La maison\nTu t’endors.\n",
        ":: Oubliée\nPersonne ne vient ici.\n",
      ].join("\n");
      await h.home();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Importer…", exact: true }).click();
      await (await chooser).setFiles({ name: "puits.twee", mimeType: "text/plain", buffer: Buffer.from(twee) });
      // Un import ouvre le Manuscrit.
      await page.locator(".topbar").waitFor({ timeout: 20_000 });
      await h.saved((f) => {
        const meta = JSON.parse(f["cosmos.json"] ?? "{}");
        const texts = Object.entries(f).filter(([k]) => k.startsWith("manuscrit/")).map(([, v]) => v).join("\n");
        return meta.interactive === true && meta.title === "Le Puits" && /\[Descendre au puits\] -> /.test(texts) && /Personne ne vient ici/.test(texts);
      }, "le fichier Twee n'est pas devenu un roman interactif avec ses choix");

      // Lecture : choix au clavier et à la souris, jusqu'à la fin.
      await h.view(2);
      await until(async () => (await page.locator(".plan-section-number").count()) === 4, "les sections du livre ne sont pas quatre");
      const numbers = await page.locator(".plan-section-number").allTextContents();
      assert(numbers.join(",") === "1,2,3,4", `sections pas dans l'ordre de leurs numéros : ${numbers.join(",")}`);
      // Lot 12 : les numéros sont figés dans cosmos.json ; on en change un (il est gardé), puis on renumérote.
      await h.saved((f) => Object.keys(JSON.parse(f["cosmos.json"] ?? "{}").sections ?? {}).length === 4, "les numéros des sections ne sont pas gardés dans cosmos.json");
      // Le titre d'une scène est un champ : on retrouve sa ligne par sa valeur.
      const puitsId = await page.locator(".plan-scene").evaluateAll((els) => els.find((e) => [...e.querySelectorAll("input, textarea")].some((f) => f.value === "Le puits"))?.dataset.scene);
      const puitsRow = page.locator(`.plan-scene[data-scene="${puitsId}"]`);
      const numberButton = puitsRow.locator("button.plan-section-number");
      const numberName = (await numberButton.getAttribute("aria-label")) ?? "";
      assert(/^Numéro de «\s?Le puits/.test(numberName), `nom du bouton du numéro : ${JSON.stringify(numberName)}`);
      await numberButton.click();
      const numberField = puitsRow.locator("input.plan-section-number");
      await numberField.fill("2");
      await numberField.press("Enter");
      await h.saved((f) => {
        const meta = JSON.parse(f["cosmos.json"] ?? "{}");
        return new Set(Object.values(meta.sections ?? {})).size === 4 && (meta.sectionLocks ?? []).length === 1;
      }, "le numéro tapé n'est pas gardé");
      await until(async () => (await puitsRow.locator(".plan-section-number").textContent())?.trim() === "2", "Le puits n'a pas pris le numéro 2");
      await page.getByRole("button", { name: "Renuméroter", exact: true }).click();
      await page.getByRole("group", { name: "Refaire le mélange des numéros ?" }).getByRole("button", { name: "Renuméroter" }).click();
      await until(async () => (await puitsRow.locator(".plan-section-number").textContent())?.trim() === "2", "renuméroter a changé un numéro gardé");
      await until(() => page.locator(".plan-renumber-result").isVisible(), "renuméroter ne dit pas ce que le mélange a donné");
      await page.getByRole("button", { name: "Lire l’histoire" }).click();
      const play = page.locator(".play-panel");
      await until(() => play.getByText("Il fait nuit dans la cour.").isVisible(), "la lecture ne commence pas par la scène de départ");
      await page.keyboard.press("1");
      await until(() => play.getByText("L’eau est noire.").isVisible(), "la touche 1 ne mène pas au puits");
      await play.getByRole("button", { name: /Remonter/ }).click();
      await play.getByRole("button", { name: /Rentrer/ }).last().click();
      await until(() => play.getByText("Fin de l’histoire.").isVisible(), "la lecture n'arrive pas à la fin");
      // Lot 15 : parcours annoté. Le chemin en numéros, une note gardée en commentaire de sa scène.
      await until(async () => /^Parcours\u00a0: 1 → \d+/.test((await play.locator(".play-path-line").textContent()) ?? ""), "le parcours de lecture n'est pas écrit en numéros");
      await play.locator(".play-note-add").nth(1).click();
      const noteField = play.locator(".play-note-field");
      await noteField.fill("trop facile");
      await noteField.press("Enter");
      await play.getByRole("button", { name: "Garder les notes (1)" }).click();
      await until(() => play.getByText("1 note(s) gardée(s) en commentaires.").isVisible(), "la note du parcours n'est pas gardée");
      await h.saved((f) => Object.entries(f).some(([k, v]) => k.startsWith("commentaires/") && v.includes("Parcours de lecture\u00a0: trop facile")), "la note du parcours n'est pas enregistrée en commentaire");
      await page.keyboard.press("Escape");

      // « Vérifier » signale la scène que rien n'atteint.
      await h.view(4);
      await page.locator(".ms-meta").getByRole("button", { name: "Plus d’actions" }).click();
      await page.getByRole("menuitem", { name: /^Vérifier/ }).click();
      await until(() => page.getByText("Une scène qu’aucun choix n’atteint").first().isVisible(), "« Vérifier » ne signale pas la scène inaccessible");

      // « Organiser » range les scènes en arbre selon les choix : départ en haut, sans cadre « Scènes » ni chapitre.
      await h.view(1);
      await page.getByRole("button", { name: "Organiser le canevas" }).first().click();
      await h.wait(800);
      const tops = await page.locator(".react-flow__node-card").evaluateAll((els) =>
        Object.fromEntries(els.map((e) => [e.querySelector(".card-title")?.value ?? "", e.getBoundingClientRect().top])),
      );
      assert(tops["La cour"] < tops["Le puits"] && tops["Le puits"] === tops["La maison"] && tops["La maison"] < tops["Oubliée"], `scènes pas en arbre : ${JSON.stringify(tops)}`);
      const frameTitles = await page.locator(".frame-title").evaluateAll((els) => els.map((e) => e.value));
      assert(!frameTitles.includes("Scènes"), `cadre « Scènes » dans un roman interactif : ${frameTitles.join(", ")}`);

      // Exports.
      const exportFile = async (label) => {
        await page.getByRole("button", { name: "Exporter", exact: true }).click();
        const download = page.waitForEvent("download", { timeout: 30_000 });
        await page.locator(".export-panel").getByRole("button", { name: label }).click();
        const file = await download;
        return { name: file.suggestedFilename(), data: fs.readFileSync(await file.path()) };
      };
      // #122 : la page web passe par sa fenêtre, où le thème se choisit et reste dans le projet.
      await page.getByRole("button", { name: "Exporter", exact: true }).click();
      await page.locator(".export-panel").getByRole("button", { name: "Page web jouable…" }).click();
      await page.locator(".wpage").getByText("Noir", { exact: true }).click();
      await h.saved((f) => JSON.parse(f["cosmos.json"] ?? "{}").webPage?.theme === "noir", "le thème de la page web n'est pas gardé dans le projet");
      // #125 : le poids est donné avant d'enregistrer.
      await until(() => page.getByText(/^Poids estimé\u00a0: /).isVisible(), "la fenêtre de la page web ne donne pas le poids", 20_000);
      const savePage = async () => {
        const download = page.waitForEvent("download", { timeout: 30_000 });
        await page.getByRole("button", { name: "Enregistrer la page" }).click();
        const file = await download;
        return { name: file.suggestedFilename(), data: fs.readFileSync(await file.path()) };
      };
      const web = await savePage();
      // #125 : l'archive pour itch.io, la page et ses images à part.
      await page.locator(".wpage").getByRole("radio", { name: /^Archive pour itch\.io \(\.zip\)/ }).check();
      const archive = await savePage();
      assert(archive.name.endsWith(".zip") && archive.data.subarray(0, 2).toString() === "PK" && archive.data.includes("index.html"), `archive de la page web : ${archive.name}`);
      assert(!archive.data.includes("data:image/"), "l'archive garde des images en data:");
      await page.locator(".wpage").getByRole("radio", { name: /^Une seule page \(\.html\)/ }).check();
      await page.keyboard.press("Escape");
      assert(web.name.endsWith(".html"), `nom de la page web : ${web.name}`);
      assert(web.data.includes("--paper: #f0f0ee;"), "la page web n'a pas le thème Noir");
      const reader = await page.context().newPage();
      await reader.route("http://127.0.0.1:9/puits.html", (r) => r.fulfill({ body: web.data, contentType: "text/html; charset=utf-8" }));
      await reader.goto("http://127.0.0.1:9/puits.html");
      // #121 : l'accueil d'abord, puis l'histoire.
      await until(() => reader.getByRole("heading", { name: "Le Puits" }).isVisible(), "la page web ne s'ouvre pas sur son accueil");
      await reader.getByRole("button", { name: "Commencer" }).click();
      await until(() => reader.getByText("Il fait nuit dans la cour.").isVisible(), "la page web ne montre pas la première scène");
      // #126 : tout au clavier ; le choix est annoncé avec son rang.
      await until(async () => /^Choix 1 sur \d+\u00a0: /.test((await reader.locator("#story .choices .sr").first().textContent()) ?? ""), "les choix n'ont pas leur rang pour les lecteurs d'écran");
      await reader.getByRole("button", { name: /Descendre au puits/ }).click();
      await until(() => reader.getByText("L’eau est noire.").isVisible(), "dans la page web, le choix ne mène pas au puits");
      await reader.reload();
      await reader.getByRole("button", { name: "Continuer" }).click();
      await until(() => reader.getByText("L’eau est noire.").isVisible(), "après rechargement, la page web n'a pas gardé la lecture");
      await reader.close();
      const epub = await exportFile("Livre-jeu (EPUB)");
      assert(epub.name.endsWith(".epub") && epub.data.subarray(0, 2).toString() === "PK" && epub.data.includes("mimetype"), `EPUB du livre-jeu : ${epub.name}, ${epub.data.length} octets`);
      assert(epub.data.includes("rendez-vous au"), "le livre-jeu EPUB n'écrit pas « rendez-vous au »");
      // Livre-jeu imprimé : le livre broché (KDP) d'un roman interactif compose les sections à la suite.
      await page.getByRole("button", { name: "Exporter", exact: true }).click();
      assert((await page.locator(".export-panel").getByRole("button", { name: "Livre-jeu (PDF)" }).count()) === 0, "le livre-jeu en PDF Courier est encore proposé");
      await page.locator(".export-panel").getByRole("button", { name: "Livre broché (KDP)…" }).click();
      const interior = page.getByRole("button", { name: "Enregistrer l’intérieur (PDF)" });
      await until(() => interior.isEnabled(), "le livre broché du livre-jeu ne se compose pas", 20_000);
      await until(() => page.getByText(/^Livre-jeu\u00a0: (aucun choix|\d+ choix montrent)/).isVisible(), "le livre broché ne dit pas si une suite est visible sur la même double page");
      const bookDownload = page.waitForEvent("download", { timeout: 30_000 });
      await interior.click();
      const bookFile = fs.readFileSync(await (await bookDownload).path());
      assert(bookFile.subarray(0, 4).toString() === "%PDF" && bookFile.length > 5000, `intérieur du livre-jeu : ${bookFile.length} octets`);
      await page.keyboard.press("Escape");
      const ink = await exportFile("Ink (.ink)");
      const inkText = ink.data.toString("utf8");
      assert(ink.name.endsWith(".ink") && /^=== la_cour ===$/m.test(inkText) && inkText.includes("Descendre au puits"), `fichier Ink : ${ink.name}\n${inkText.slice(0, 300)}`);
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Exécution

const filters = process.argv.slice(2).map((s) => s.toLowerCase());
const chosen = filters.length ? scenarios.filter((s) => filters.some((f) => s.name.toLowerCase().includes(f))) : scenarios;
if (!chosen.length) {
  console.error("Aucun scénario ne correspond à :", filters.join(" "));
  process.exit(2);
}

let server;
let browser;
const results = [];
try {
  server = await startVite();
  const executablePath = findChromium();
  browser = await chromium.launch({ headless: !process.env.E2E_HEADED, executablePath, args: ["--no-sandbox"] });
  console.log(`MondoWrite servi sur ${server.url}, ${chosen.length} scénario(s)\n`);

  for (const sc of chosen) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", colorScheme: "light", ...sc.context });
    // Rien ne sort vers Internet (exemples en ligne, photos, IA) : les tests ne dépendent pas du réseau.
    await context.route(/^(?!https?:\/\/(127\.0\.0\.1|localhost)[:/])/, (r) => r.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(`erreur de la page : ${e.message}`));
    page.on("console", (m) => {
      const text = m.text();
      if (NOISE.some((r) => r.test(text))) return;
      if (m.type() === "error" || (m.type() === "warning" && REACT_ERRORS.some((r) => r.test(text)))) errors.push(`console.${m.type()} : ${text.split("\n")[0].slice(0, 300)}`);
    });
    const started = Date.now();
    let failure = null;
    try {
      await sc.run(helpers(page, server.url));
      await page.waitForTimeout(300); // une erreur levée juste après la dernière action
    } catch (e) {
      failure = e instanceof Failure ? e.message : `${e.message.split("\n").slice(0, 4).join(" | ")}`;
    }
    if (!failure && errors.length) failure = errors[0];
    if (failure) {
      mkdirSync(SHOTS, { recursive: true });
      const file = join(SHOTS, `${results.length + 1}.png`);
      await page.screenshot({ path: file }).catch(() => {});
      failure += `\n      capture : ${file}`;
      if (errors.length > 1) failure += `\n      ${errors.length} erreurs de la page, dont : ${errors.slice(0, 3).join(" ; ")}`;
    }
    const known = KNOWN.has(sc.name);
    results.push({ name: sc.name, failure, known });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (!failure) console.log(`  ✓ ${sc.name} (${secs} s)${known ? "  [connu comme cassé, mais passe : retirer de KNOWN]" : ""}`);
    else console.log(`  ${known ? "~" : "✗"} ${sc.name} (${secs} s)${known ? "  [bogue connu]" : ""}\n      ${failure}`);
    await context.close();
  }
} catch (e) {
  console.error(`\nLes tests n'ont pas pu tourner : ${e.message}`);
  if (/Executable doesn't exist|browserType.launch/.test(e.message)) console.error("Installe Chromium : npx playwright-core install chromium (ou indique CHROMIUM=<chemin>).");
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.child.kill();
}

if (results.length) {
  const failed = results.filter((r) => r.failure && !r.known);
  const known = results.filter((r) => r.failure && r.known);
  const passed = results.filter((r) => !r.failure);
  console.log(`\n${passed.length} réussi(s), ${failed.length} échoué(s)${known.length ? `, ${known.length} bogue(s) connu(s)` : ""} sur ${results.length}.`);
  if (failed.length) process.exitCode = 1;
}
