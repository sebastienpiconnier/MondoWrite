// @vitest-environment happy-dom
// Roman interactif, lot 7 : page web jouable. La page est fabriquée avec le vrai moteur d'inkjs, puis jouée ici.

import { beforeEach, describe, expect, it } from "vitest";
import { Compiler } from "inkjs/full";
import { choicesHtml, sceneSlugs } from "../interactive/choices";
import { projectToInk } from "../interactive/ink";
import { jsonForScript, progressKey, scriptSafe, storyImageNames, storyPage, type WebPageInput } from "../interactive/webPage";

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
};
const input = (over: Partial<WebPageInput> = {}): WebPageInput => ({
  title: "La <grille>",
  author: "Sébastien",
  lang: "fr",
  storyJson,
  runtime,
  runtimeLicense: license,
  images: { "grille.jpg": "data:image/jpeg;base64,AAAA" },
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
    const page = load(storyPage(input({ cover: { src: "data:image/jpeg;base64,QUJD", alt: "Couverture : Le puits" }, tagline: "Ne regarde pas en bas." })));
    expect(page.shown("mw-home")).toBe(true);
    expect(page.shown("mw-reader")).toBe(false);
    const cover = document.querySelector<HTMLImageElement>(".cover img")!;
    expect(cover.getAttribute("src")).toBe("data:image/jpeg;base64,QUJD");
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
    // Une couverture qui n'est pas une image en data: n'entre pas dans la page.
    load(storyPage(input({ cover: { src: "javascript:alert(1)", alt: "x" } })));
    expect(document.querySelector(".cover")).toBeNull();
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
    // Dite en texte dans le bloc du passage, l'image restant décorative (pas lue deux fois).
    expect(document.querySelector<HTMLImageElement>("#story img")!.alt).toBe("");
    expect(document.querySelector("#story figure .sr")!.textContent).toBe("Image : Une grille rouillée");
    expect(document.querySelector("#story .turn")!.textContent).toContain("Image : Une grille rouillée");
    // Sans description : rien à dire.
    load(storyPage(input()));
    expect(document.querySelector("#story figure .sr")).toBeNull();
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
