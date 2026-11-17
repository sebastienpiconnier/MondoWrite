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
    choices: () => [...story.querySelectorAll(".choices button")].map((b) => b.textContent),
    choose: (label: string) => ([...story.querySelectorAll<HTMLButtonElement>(".choices button")].find((b) => b.textContent === label)!).click(),
    known: () => story.querySelector(".known")?.textContent ?? null,
    images: () => [...story.querySelectorAll("img")].map((i) => i.getAttribute("src")),
    back: () => document.getElementById("mw-back") as HTMLButtonElement,
    restart: () => (document.getElementById("mw-restart") as HTMLButtonElement).click(),
    ended: () => story.querySelector(".end")?.textContent ?? null,
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
});
