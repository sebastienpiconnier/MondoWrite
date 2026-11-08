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
      await page.getByLabel("Gabarit de l’épisode").nth(1).selectOption("episode");
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
      await h.view(1);
      await h.pane();
      await page.keyboard.press("Control+f");
      await page.getByRole("button", { name: "Par le sens" }).click();
      const field = page.getByRole("combobox", { name: "Rechercher une carte" });
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
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
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
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
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
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
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
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
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
        return image && card.includes(`iaImages: {"${image}":"openai, gpt-image-2"}`) && /· Image · «\s?Inès Morvan\s?» · openai, gpt-image-2 · 1 × 1 px/.test(f["ia-journal.md"] ?? "");
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
      await page.getByRole("button", { name: "Réglages", exact: true }).click();
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
        const item = page.getByRole("menuitem", { name: "Retirer de mes gabarits" });
        await item.waitFor();
        assert(await item.evaluate((el) => !!el.closest("dialog")), "le menu ⋯ n'est pas dans la fenêtre (il passerait dessous)");
        await item.click();
      };
      await forget();
      await until(() => manage.getByText("est retiré de tes gabarits", { exact: false }).isVisible(), "pas de message après le retrait");
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
      await page.getByRole("button", { name: "Réglages" }).first().click();
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
