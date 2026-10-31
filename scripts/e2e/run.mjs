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
