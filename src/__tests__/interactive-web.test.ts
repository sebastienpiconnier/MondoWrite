// @vitest-environment happy-dom
// Roman interactif, lot 7 : page web jouable. La page est fabriquée avec le vrai moteur d'inkjs, puis jouée ici.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Compiler } from "inkjs/full";
import { choicesHtml, sceneSlugs } from "../interactive/choices";
import { projectToInk } from "../interactive/ink";
import { bookId, jsonForScript, progressKey, scriptSafe, storyImageNames, storyPage, type WebPageInput } from "../interactive/webPage";
import { dedupeImages, imageWeight, pickFormat, type WebImage } from "../interactive/webImages";

// Les mêmes fichiers que l'app.
import runtime from "../../node_modules/inkjs/dist/ink.js?raw";
import license from "../../node_modules/inkjs/LICENSE.md?raw";

const scenes = [
  { id: "s1", title: "La grille" },
  { id: "s2", title: "La cour" },
  { id: "s3", title: "Le village" },
];
const manuscript = {
  s1: `<p>La grille est entrouverte.</p><img data-media="grille.jpg" alt=""><p>Une &lt;/script&gt; dans le texte.</p>${choicesHtml("* [Pousser la grille] -> la_cour\n  ~ cle = true\n* [Rentrer] -> le_village")}`,
  s2: `<p>La cour est vide.</p>${choicesHtml("* { cle } [Ouvrir la porte] -> END\n* [Repartir] -> la_grille")}`,
  s3: `<p>Le village dort.</p>${choicesHtml("* [Dormir] -> END")}`,
};
const source = projectToInk(scenes, sceneSlugs(scenes), manuscript, { cle: "La clé" });
const storyJson = new Compiler(source.ink).Compile().ToJson()!;

const texts = {
  restart: "Recommencer",
  back: "Revenir au choix précédent",
  end: "Fin de l’histoire.",
  known: "Ce que sait le lecteur :",
  value: "{fact} : {value}",
  noScript: "JavaScript requis.",
  failed: "Échec.",
  madeWith: "Écrit avec MondoWrite",
  start: "Commencer",
  continue: "Continuer",
  home: "Accueil",
  skip: "Aller à l’histoire",
  choices: "Que faites-vous ?",
  choiceOf: "Choix {n} sur {total} :",
  image: "Image : {alt}",
  display: "Affichage",
  theme: "Thème",
  modeAuto: "Auto",
  modeLight: "Clair",
  modeDark: "Sombre",
  textSize: "Taille du texte",
  sizeSmall: "Petit texte",
  sizeMedium: "Texte normal",
  sizeLarge: "Grand texte",
  endingsFound: "Fins découvertes : {n} sur {total}",
  endingsGood: "bonnes : {n} sur {total}",
  endingsBad: "mauvaises : {n} sur {total}",
  endGood: "Bonne fin",
  endBad: "Mauvaise fin",
  exportSave: "Exporter ma partie",
  importSave: "Importer une partie",
  importDone: "Partie reprise.",
  importOther: "Autre livre.",
  importVersion: "Autre version.",
  importBad: "Pas une partie.",
  noStorage: "Pas de stockage.",
};
const input = (over: Partial<WebPageInput> = {}): WebPageInput => ({
  title: "La <grille>",
  author: "Sébastien",
  lang: "fr",
  storyJson,
  runtime,
  runtimeLicense: license,
  sources: { "a1.jpg": "data:image/jpeg;base64,AAAA" },
  images: { "grille.jpg": "a1.jpg" },
  facts: [{ name: "cle", label: "La clé" }],
  texts,
  ...over,
});

/** Pose la page dans le document de test et lance ses scripts, comme le ferait un navigateur. */
function load(html: string) {
  const body = /<body>([\s\S]*)<\/body>/.exec(html)![1];
  const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  document.body.innerHTML = body.replace(/<script>[\s\S]*?<\/script>/g, "");
  for (const code of scripts) new Function(code)();
  const story = document.getElementById("story")!;
  return {
    paragraphs: () => [...story.querySelectorAll("p:not(.known):not(.end-tools)")].map((p) => p.textContent),
    choices: () => [...story.querySelectorAll(".choices button .label")].map((b) => b.textContent),
    choose: (label: string) => ([...story.querySelectorAll<HTMLButtonElement>(".choices button")].find((b) => b.querySelector(".label")!.textContent === label)!).click(),
    known: () => story.querySelector(".known")?.textContent ?? null,
    images: () => [...story.querySelectorAll("img")].map((i) => i.getAttribute("src")),
    back: () => document.getElementById("mw-back") as HTMLButtonElement,
    restart: () => (document.getElementById("mw-restart") as HTMLButtonElement).click(),
    ended: () => story.querySelector(".end")?.textContent ?? null,
    button: (id: string) => document.getElementById(id) as HTMLButtonElement,
    shown: (id: string) => !(document.getElementById(id) as HTMLElement).hidden,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("page web d'un roman interactif", () => {
  it("échappe ce qui pourrait fermer une balise", () => {
    expect(jsonForScript({ a: "</script><!--" })).not.toMatch(/[<>]/);
    expect(scriptSafe('var a = "</script>"; // <!--')).toBe('var a = "<\\/script>"; // <\\!--');
    const html = storyPage(input());
    expect(html).toContain("<title>La &lt;grille&gt;</title>");
    // Une seule fermeture par balise ouverte : le texte de l'histoire ne coupe rien.
    expect(html.match(/<script/g)!.length).toBe(html.match(/<\/script>/g)!.length);
    expect(html).toContain("Copyright (c) 2017 inkle Ltd.");
  });

  it("relève les images de l'histoire, noms sûrs seulement", () => {
    expect(storyImageNames(source)).toEqual(["grille.jpg"]);
    expect(storyImageNames({ ink: "# image: ../secret.jpg\n# image: a.png\n# image: a.png\n" })).toEqual(["a.png"]);
  });

  it("garde la progression sous une clé propre à l'histoire", () => {
    expect(progressKey("A", "{}")).toBe(progressKey("A", "{}"));
    expect(progressKey("A", "{}")).not.toBe(progressKey("B", "{}"));
    expect(progressKey("A", "{}")).not.toBe(progressKey("A", "{ }"));
  });

  it("se joue : texte, images, choix, faits, fin", () => {
    const page = load(storyPage(input()));
    expect(page.paragraphs()).toEqual(["La grille est entrouverte.", "Une </script> dans le texte."]);
    expect(page.images()).toEqual(["data:image/jpeg;base64,AAAA"]);
    expect(page.choices()).toEqual(["Pousser la grille", "Rentrer"]);
    expect(page.back().disabled).toBe(true);
    page.choose("Pousser la grille");
    expect(page.paragraphs().slice(-2)).toEqual(["Pousser la grille", "La cour est vide."]);
    expect(page.known()).toBe("Ce que sait le lecteur : La clé");
    expect(page.choices()).toEqual(["Ouvrir la porte", "Repartir"]);
    expect(page.back().disabled).toBe(false);
    page.choose("Ouvrir la porte");
    expect(page.ended()).toBe("Fin de l’histoire.");
  });

  it("revient au choix précédent et recommence", () => {
    const page = load(storyPage(input()));
    page.choose("Rentrer");
    expect(page.choices()).toEqual(["Dormir"]);
    page.back().click();
    expect(page.paragraphs()).toEqual(["La grille est entrouverte.", "Une </script> dans le texte."]);
    expect(page.choices()).toEqual(["Pousser la grille", "Rentrer"]);
    page.choose("Pousser la grille");
    page.restart();
    expect(page.known()).toBeNull();
    expect(page.choices()).toEqual(["Pousser la grille", "Rentrer"]);
  });

  it("reprend là où le lecteur s'était arrêté", () => {
    const html = storyPage(input());
    load(html).choose("Pousser la grille");
    const again = load(html);
    expect(again.paragraphs().slice(-1)).toEqual(["La cour est vide."]);
    expect(again.choices()).toEqual(["Ouvrir la porte", "Repartir"]);
    expect(again.back().disabled).toBe(false);
  });

  it("ne relit jamais du HTML depuis la progression gardée", () => {
    const html = storyPage(input());
    load(html).choose("Rentrer");
    const key = progressKey("La <grille>", storyJson);
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.log.push({ k: "p", v: "<img src=x onerror=alert(1)>" }, { k: "script", v: "x" });
    localStorage.setItem(key, JSON.stringify(saved));
    const again = load(html);
    expect(document.querySelectorAll("#story img[src=x]").length).toBe(0);
    expect(again.paragraphs()).toContain("<img src=x onerror=alert(1)>");
  });

  it("dit l'échec si l'histoire ne se charge pas", () => {
    const page = load(storyPage(input({ storyJson: '{"inkVersion": 1}' })));
    expect(page.paragraphs()).toEqual(["Échec."]);
  });

  it("s'ouvre sur l'accueil : couverture, titre, auteur, accroche, Commencer", () => {
    const page = load(
      storyPage(input({ sources: { "a1.jpg": "data:image/jpeg;base64,AAAA", "c1.webp": "data:image/webp;base64,QUJD" }, cover: { file: "c1.webp", alt: "Couverture : Le puits" }, tagline: "Ne regarde pas en bas." })),
    );
    expect(page.shown("mw-home")).toBe(true);
    expect(page.shown("mw-reader")).toBe(false);
    const cover = document.querySelector<HTMLImageElement>(".cover img")!;
    expect(cover.getAttribute("src")).toBe("data:image/webp;base64,QUJD");
    expect(cover.alt).toBe("Couverture : Le puits");
    expect(document.querySelector("#mw-home h1")!.textContent).toBe("La <grille>");
    expect(document.querySelector(".tagline")!.textContent).toBe("Ne regarde pas en bas.");
    expect(page.shown("mw-start")).toBe(true);
    expect(page.shown("mw-continue")).toBe(false);
    page.button("mw-start").click();
    expect(page.shown("mw-reader")).toBe(true);
    expect(page.shown("mw-home")).toBe(false);
  });

  it("sans couverture, l'accueil n'a que le titre et l'auteur", () => {
    load(storyPage(input()));
    expect(document.querySelector(".cover")).toBeNull();
    expect(document.querySelector(".tagline")).toBeNull();
    expect(document.querySelector("#mw-home .author")!.textContent).toBe("Sébastien");
    // Une adresse qui n'est ni une image en data: ni un fichier images/ n'entre pas dans la page.
    load(storyPage(input({ sources: { "c1.jpg": "javascript:alert(1)" }, cover: { file: "c1.jpg", alt: "x" } })));
    expect(document.querySelector(".cover")).toBeNull();
    const page = load(storyPage(input({ sources: { "a1.jpg": "../../etc/x.jpg" } })));
    expect(page.images()).toEqual([]);
  });

  it("Continuer ramène au dernier choix, Recommencer repart du début", () => {
    const html = storyPage(input());
    load(html).choose("Pousser la grille");
    const again = load(html);
    expect(again.shown("mw-start")).toBe(false);
    expect(again.shown("mw-continue")).toBe(true);
    expect(again.shown("mw-again")).toBe(true);
    again.button("mw-continue").click();
    expect(again.shown("mw-reader")).toBe(true);
    expect((document.activeElement as HTMLElement).className).toBe("turn");
    expect(document.activeElement?.querySelector(".chose")?.textContent).toBe("Pousser la grille");
    expect(again.choices()).toEqual(["Ouvrir la porte", "Repartir"]);
    again.button("mw-home-btn").click();
    expect(again.shown("mw-home")).toBe(true);
    expect(document.activeElement?.id).toBe("mw-continue");
    again.button("mw-again").click();
    expect(again.shown("mw-reader")).toBe(true);
    expect(again.choices()).toEqual(["Pousser la grille", "Rentrer"]);
    expect(again.back().disabled).toBe(true);
  });

  it("garde le thème clair ou sombre et la taille du texte choisis par le lecteur", () => {
    load(storyPage(input()));
    const dark = document.querySelector<HTMLButtonElement>('[data-set-mode="dark"]')!;
    dark.click();
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    expect(dark.getAttribute("aria-pressed")).toBe("true");
    document.querySelector<HTMLButtonElement>('[data-set-size="l"]')!.click();
    expect(document.documentElement.getAttribute("data-size")).toBe("l");
    expect(JSON.parse(localStorage.getItem("mondowrite-display")!)).toEqual({ mode: "dark", size: "l" });
    document.documentElement.removeAttribute("data-mode");
    document.documentElement.removeAttribute("data-size");
    load(storyPage(input()));
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    expect(document.querySelector('[data-set-size="l"]')!.getAttribute("aria-pressed")).toBe("true");
    document.querySelector<HTMLButtonElement>('[data-set-mode="auto"]')!.click();
    expect(document.documentElement.hasAttribute("data-mode")).toBe(false);
    document.documentElement.removeAttribute("data-size");
  });

  it("dit aux lecteurs d'écran le rang de chaque choix, dans une liste nommée", () => {
    load(storyPage(input()));
    const list = document.querySelector("#story ol.choices")!;
    expect(list.getAttribute("aria-label")).toBe("Que faites-vous ?");
    const first = list.querySelector("button")!;
    expect(first.querySelector(".sr")!.textContent).toBe("Choix 1 sur 2 : ");
    expect(first.querySelector(".n")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.getElementById("story")!.hasAttribute("aria-live")).toBe(false);
    expect(document.querySelector("a.skip")!.textContent).toBe("Aller à l’histoire");
  });

  it("après un choix, le focus va sur tout le passage qui suit, choix compris", () => {
    const page = load(storyPage(input()));
    page.button("mw-start").click();
    // Au départ, le focus est sur le premier passage, choix compris.
    expect((document.activeElement as HTMLElement).className).toBe("turn");
    expect(document.activeElement!.querySelector(".choices")).not.toBeNull();
    page.choose("Rentrer");
    // Le bloc du passage entier : le choix fait, le texte qui suit, puis les choix proposés.
    const focused = document.activeElement as HTMLElement;
    expect(focused.className).toBe("turn");
    expect(focused.getAttribute("tabindex")).toBe("-1");
    expect(focused.querySelector(".chose")!.textContent).toBe("Rentrer");
    expect([...focused.querySelectorAll("p:not(.chose)")].map((p) => p.textContent)).toEqual(["Le village dort."]);
    expect(focused.querySelector(".choices button .label")!.textContent).toBe("Dormir");
    expect(document.querySelectorAll("#story .turn").length).toBe(2);
  });

  it("donne aux images la description écrite par l'auteur", () => {
    const page = load(storyPage(input({ alts: { "grille.jpg": "Une grille rouillée" } })));
    expect(page.images()).toEqual(["data:image/jpeg;base64,AAAA"]);
    // Dite en paragraphe du passage, hors de tout <figure> (VoiceOver n'y entre pas), l'image restant décorative.
    expect(document.querySelector<HTMLImageElement>("#story img")!.alt).toBe("");
    expect(document.querySelector("#story figure")).toBeNull();
    expect(document.querySelector("#story .illus")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("#story .turn > p.sr")!.textContent).toBe("Image : Une grille rouillée");
    expect(document.querySelector("#story .turn")!.textContent).toContain("Image : Une grille rouillée");
    // Sans description : rien à dire.
    load(storyPage(input()));
    expect(document.querySelector("#story p.sr")).toBeNull();
  });

  it("garde le gras et l'italique, sans jamais lire de HTML", () => {
    const rich = { s1: "<p>Un <strong>mot fort</strong> et un <em>autre</em>, &lt;b&gt;pas du HTML&lt;/b&gt;.</p>" };
    const one = [{ id: "s1", title: "Seule" }];
    const src = projectToInk(one, sceneSlugs(one), rich, {}, "…", { marks: true });
    const json = new Compiler(src.ink).Compile().ToJson()!;
    const page = load(storyPage(input({ storyJson: json, title: "Riche" })));
    expect(page.paragraphs()[0]).toBe("Un mot fort et un autre, <b>pas du HTML</b>.");
    expect(document.querySelector("#story strong")!.textContent).toBe("mot fort");
    expect(document.querySelector("#story em")!.textContent).toBe("autre");
    expect(document.querySelector("#story b")).toBeNull();
    // Sans l'option, l'Ink n'a aucune marque (export Ink, « Lire l'histoire »).
    expect(projectToInk(one, sceneSlugs(one), rich).ink).not.toMatch(/[\uE000-\uE003]/);
  });

  it("pose le thème choisi, puis le CSS de l'auteur rendu inerte", () => {
    const html = storyPage(input({ theme: "terminal", customCss: "body { --accent: red; } </style><script>alert(1)</script> x { background: url(javascript:alert(1)) }" }));
    expect(html).toContain("monospace");
    expect(html).toContain("--accent: red;");
    const custom = /<style id="mw-custom">([\s\S]*?)<\/style>/.exec(html)![1];
    expect(custom).not.toMatch(/</);
    expect(custom).not.toMatch(/javascript\s*:/i);
    expect(html.match(/<script/g)!.length).toBe(html.match(/<\/script>/g)!.length);
    // Sans réglage : le thème Classique, comme avant.
    expect(storyPage(input())).toContain("--paper: #fdfcf9;");
    expect(storyPage(input())).not.toContain("mw-custom");
  });
});

// Fins découvertes et partie à emporter (#124) : l'Ink de la page note la scène en cours.
const endScenes = [
  { id: "e1", title: "Le seuil" },
  { id: "e2", title: "Le trésor" },
  { id: "e3", title: "Le gouffre" },
  { id: "e4", title: "La route" },
];
const endManuscript = {
  e1: `<p>Trois chemins.</p>${choicesHtml("* [Descendre] -> le_tresor\n* [Sauter] -> le_gouffre\n* [Partir] -> la_route")}`,
  e2: `<p>De l’or.</p>${choicesHtml("* [Finir] -> END #good")}`,
  e3: `<p>Le vide.</p>${choicesHtml("* [Tomber] -> END #bad")}`,
  e4: "<p>La route continue.</p>",
};
const endSource = projectToInk(endScenes, sceneSlugs(endScenes), endManuscript, {}, "…", { track: true });
const endJson = new Compiler(endSource.ink).Compile().ToJson()!;
const endings = [
  { id: "le_tresor", kind: "good" as const },
  { id: "le_gouffre", kind: "bad" as const },
  { id: "la_route", kind: null },
];
const endInput = (over: Partial<WebPageInput> = {}) => input({ storyJson: endJson, title: "Trois fins", facts: [], book: bookId("p1"), endings, ...over });

describe("page web : fins découvertes et partie à emporter (#124)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("compte les fins trouvées, bonnes et mauvaises, même après Recommencer", () => {
    const html = storyPage(endInput());
    const page = load(html);
    page.button("mw-start").click();
    page.choose("Descendre");
    page.choose("Finir");
    expect(document.querySelector("#story .end-kind")!.textContent).toBe("Bonne fin");
    expect(document.querySelector("#story .found")!.textContent).toBe("Fins découvertes : 1 sur 3 (bonnes : 1 sur 1, mauvaises : 0 sur 1)");
    page.restart();
    page.choose("Partir");
    // Une fin sans type : pas d'étiquette, mais comptée.
    expect(document.querySelector("#story .end-kind")).toBeNull();
    expect(document.querySelector("#story .found")!.textContent).toBe("Fins découvertes : 2 sur 3 (bonnes : 1 sur 1, mauvaises : 0 sur 1)");
    // Sur l'accueil d'une page rouverte.
    const again = load(html);
    expect(again.shown("mw-found")).toBe(true);
    expect(document.getElementById("mw-found")!.textContent).toContain("2 sur 3");
  });

  it("n'affiche rien tant qu'aucune fin n'est trouvée, ni pour une seule fin", () => {
    const page = load(storyPage(endInput()));
    expect(page.shown("mw-found")).toBe(false);
    expect(page.shown("mw-export")).toBe(false);
    page.button("mw-start").click();
    page.choose("Descendre");
    page.choose("Finir");
    const one = load(storyPage(endInput({ endings: [endings[0]], book: bookId("p2") })));
    expect(one.shown("mw-found")).toBe(false);
  });

  it("exporte une partie et la reprend au même endroit, faits compris", async () => {
    let blob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => ((blob = b as Blob), "blob:partie"));
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const html = storyPage(input({ book: bookId("p1"), saveName: "grille (partie).json" }));
    const page = load(html);
    page.button("mw-start").click();
    page.choose("Pousser la grille");
    page.button("mw-home-btn").click();
    expect(page.shown("mw-export")).toBe(true);
    page.button("mw-export").click();
    const text = await blob!.text();
    expect(JSON.parse(text)).toMatchObject({ mondowrite: "playthrough", version: 1, book: bookId("p1") });
    // Un navigateur qui a tout oublié reprend la partie importée.
    localStorage.clear();
    const fresh = load(html);
    expect(fresh.shown("mw-continue")).toBe(false);
    await importFile(text);
    expect(document.getElementById("mw-status")!.textContent).toBe("Partie reprise.");
    expect(fresh.shown("mw-continue")).toBe(true);
    fresh.button("mw-continue").click();
    expect(fresh.choices()).toEqual(["Ouvrir la porte", "Repartir"]);
    expect(fresh.known()).toBe("Ce que sait le lecteur : La clé");
  });

  it("refuse la partie d'un autre livre, d'une autre version, ou un fichier quelconque", async () => {
    load(storyPage(input({ book: bookId("p1") })));
    const file = (over: object) => JSON.stringify({ mondowrite: "playthrough", version: 1, book: bookId("p1"), key: progressKey("La <grille>", storyJson), state: "{}", log: [], steps: [], ...over });
    await importFile(file({ book: bookId("autre") }));
    expect(document.getElementById("mw-status")!.textContent).toBe("Autre livre.");
    await importFile(file({ key: "mondowrite-story-ancienne" }));
    expect(document.getElementById("mw-status")!.textContent).toBe("Autre version.");
    await importFile("pas du JSON");
    expect(document.getElementById("mw-status")!.textContent).toBe("Pas une partie.");
  });

  it("peut retirer « Revenir au choix précédent »", () => {
    const page = load(storyPage(input({ allowBack: false })));
    page.button("mw-start").click();
    page.choose("Rentrer");
    expect(page.shown("mw-back")).toBe(false);
    expect(page.shown("mw-restart")).toBe(true);
  });

  it("dit discrètement que le navigateur ne garde rien, et reste jouable", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const page = load(storyPage(input()));
    expect(page.shown("mw-nostore")).toBe(true);
    page.button("mw-start").click();
    page.choose("Rentrer");
    expect(page.choices()).toEqual(["Dormir"]);
  });

  it("charge les images de l'histoire à mesure (#125)", () => {
    load(storyPage(input()));
    expect(document.querySelector<HTMLImageElement>("#story img")!.getAttribute("loading")).toBe("lazy");
  });
});

/** Choisit un fichier dans le champ caché « Importer une partie », comme le ferait le lecteur. */
async function importFile(text: string) {
  const field = document.getElementById("mw-file") as HTMLInputElement;
  Object.defineProperty(field, "files", { configurable: true, value: [new File([text], "partie.json", { type: "application/json" })] });
  field.dispatchEvent(new Event("change"));
  await new Promise((r) => setTimeout(r, 20));
}

describe("images de la page web (#125)", () => {
  const img = (bytes: number[], ext: WebImage["ext"] = "webp"): WebImage => ({ data: new Uint8Array(bytes), ext, mime: ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg" });

  it("choisit WebP s'il sait l'écrire, sinon PNG pour une image transparente et JPEG pour les autres", () => {
    expect(pickFormat(true, true)).toBe("webp");
    expect(pickFormat(false, true)).toBe("png");
    expect(pickFormat(false, false)).toBe("jpg");
  });

  it("ne garde qu'une fois une même image, sous un nom tiré de son contenu", () => {
    const set = dedupeImages({ "Portrait A.jpg": img([1, 2, 3]), "copie.jpg": img([1, 2, 3]), "autre.png": img([4, 5], "png") });
    expect(Object.keys(set.files)).toHaveLength(2);
    expect(set.byName["Portrait A.jpg"]).toBe(set.byName["copie.jpg"]);
    for (const file of Object.keys(set.files)) expect(file).toMatch(/^[0-9a-f]{8}(-\d+)?\.(webp|png|jpg)$/);
    // Le même contenu donne le même nom d'un export à l'autre.
    expect(dedupeImages({ x: img([1, 2, 3]) }).byName.x).toBe(set.byName["copie.jpg"]);
  });

  it("compte le tiers de plus d'une image en data:", () => {
    expect(imageWeight(img([1, 2, 3, 4, 5, 6]), true)).toBe(8);
    expect(imageWeight(img([1, 2, 3, 4, 5, 6]), false)).toBe(6);
  });
});
