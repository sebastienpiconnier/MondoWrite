// @vitest-environment happy-dom
// Images de référence générées (1.10.0, mode Atelier) : services, requêtes, lecture prudente des réponses, consigne
// sans noms propres, marque `iaImages` (frontmatter, versions d'avant), « Garder » (une étape, crédit, journal).

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { NO_FILTER } from "../canvasFilter";
import { storage } from "../storage";
import { cardToFile, fileToCard } from "../storage/markdown";
import { journalLine, type JournalLabels } from "../atelier";
import {
  DEFAULT_IMAGE_MODELS,
  IMAGE_MODEL_CHOICES,
  imageModelChoice,
  isRetiredImageModel,
  canGenerateImages,
  clampCount,
  decodeBase64,
  describeCard,
  iaImageCount,
  iaImagesOf,
  imageModelOf,
  imagePrompt,
  imageRequest,
  isImageUrl,
  properNames,
  readIaImageSource,
  readIaImages,
  readImages,
  sniffImage,
  stripNames,
  subjectOf,
  castDescription,
  describeCover,
  readChatImages,
  referenceRequest,
  sceneCast,
  REFERENCE_MAX,
} from "../ai/imageGen";
import { coverOf } from "../export/biblePack";
import { COVER_NONE, cleanOptions } from "../bibleExport";
import { readPitch, setPitchVisual } from "../pitch";
import type { CardData } from "../types";

// PNG de 1 × 1 pixel.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const png = () => decodeBase64(PNG)!;
const openai = { provider: "openai" as const, key: "k", model: "gpt-test", url: "" };
const openrouter = { provider: "openrouter" as const, key: "k", model: "x", url: "" };

describe("services", () => {
  it("seuls OpenAI et OpenRouter génèrent des images ; tout autre service (même ajouté plus tard) : non", () => {
    expect(canGenerateImages("openai")).toBe(true);
    expect(canGenerateImages("openrouter")).toBe(true);
    for (const p of ["anthropic", "ollama", "lmstudio", "apple", null, undefined]) expect(canGenerateImages(p)).toBe(false);
  });

  it("modèle d'image : celui de l'auteur, sinon celui par défaut", () => {
    expect(imageModelOf("openai", "")).toBe(DEFAULT_IMAGE_MODELS.openai);
    expect(imageModelOf("openai", "  gpt-image-1.5 ")).toBe("gpt-image-1.5");
  });

  it("#66 : GPT Image 2.6 Flare par défaut, Sunburst au choix, GPT-Image-2 arrêté vaut le défaut", () => {
    expect(DEFAULT_IMAGE_MODELS).toEqual({ openai: "gpt-image-2.6-flare", openrouter: "openai/gpt-image-2.6-flare" });
    expect(IMAGE_MODEL_CHOICES.openai.sunburst).toBe("gpt-image-2.6-sunburst");
    expect(IMAGE_MODEL_CHOICES.openrouter.sunburst).toBe("openai/gpt-image-2.6-sunburst");
    expect(imageModelOf("openai", "gpt-image-2")).toBe("gpt-image-2.6-flare");
    expect(imageModelOf("openrouter", " openai/gpt-image-2 ")).toBe("openai/gpt-image-2.6-flare");
    expect(isRetiredImageModel("gpt-image-2.5-flare")).toBe(false);
    expect(imageModelChoice("openai", "")).toBe("flare");
    expect(imageModelChoice("openai", "gpt-image-2")).toBe("flare");
    expect(imageModelChoice("openai", "gpt-image-2.6-sunburst")).toBe("sunburst");
    expect(imageModelChoice("openrouter", "openai/gpt-image-2.6-sunburst")).toBe("sunburst");
    expect(imageModelChoice("openai", "gpt-image-1.5")).toBe("other");
  });

  it("le réglage `imageModels` est gardé sur l'appareil, comme `embedModels`", () => {
    useSettings.getState().setAi({ ...useSettings.getState().ai, imageModels: { openai: "gpt-image-1" } });
    expect(useSettings.getState().ai.imageModels?.openai).toBe("gpt-image-1");
  });
});

describe("requêtes", () => {
  it("OpenAI : API Images, taille selon le sujet, nombre borné de 1 à 4", () => {
    const r = imageRequest(openai, "gpt-image-2", "p", 9, "portrait");
    expect(r.url).toBe("https://api.openai.com/v1/images/generations");
    expect(r.headers.authorization).toBe("Bearer k");
    expect(JSON.parse(r.body!)).toEqual({ model: "gpt-image-2", prompt: "p", n: 4, size: "1024x1536" });
    expect(JSON.parse(imageRequest(openai, "gpt-image-2", "p", 0, "place").body!)).toMatchObject({ n: 1, size: "1536x1024" });
    expect(clampCount(Number.NaN)).toBe(1);
  });

  it("OpenAI dall-e : base64 demandé, dall-e-3 une image à la fois", () => {
    expect(JSON.parse(imageRequest(openai, "dall-e-3", "p", 3, "object").body!)).toEqual({ model: "dall-e-3", prompt: "p", n: 1, size: "1024x1024", response_format: "b64_json" });
  });

  it("OpenRouter : point d'entrée Images, proportions", () => {
    const r = imageRequest(openrouter, "openai/gpt-image-2", "p", 2, "portrait");
    expect(r.url).toBe("https://openrouter.ai/api/v1/images");
    expect(r.headers["x-title"]).toBe("MondoWrite");
    expect(JSON.parse(r.body!)).toEqual({ model: "openai/gpt-image-2", prompt: "p", n: 2, aspect_ratio: "2:3" });
  });
});

describe("réponses jamais crues sur parole", () => {
  it("octets reconnus à leur signature, pas au type annoncé", () => {
    expect(sniffImage(png())).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("base64 : data: accepté, texte qui n'en est pas refusé", () => {
    expect(decodeBase64(`data:image/png;base64,${PNG}`)?.length).toBe(png().length);
    expect(decodeBase64("pas du base64 !")).toBeNull();
    expect(decodeBase64("")).toBeNull();
  });

  it("readImages : images lisibles seulement, adresse https d'un hôte attendu, au plus `max`", () => {
    const svg = btoa("<svg xmlns='http://www.w3.org/2000/svg'/>");
    const got = readImages({
      data: [
        { b64_json: PNG, media_type: "image/svg+xml" },
        { b64_json: svg, media_type: "image/png" },
        { url: "https://oaidalleapiprodscus.blob.core.windows.net/a.png" },
        { url: "http://oaidalleapiprodscus.blob.core.windows.net/a.png" },
        { url: "https://evil.example/a.png" },
        { b64_json: PNG },
      ],
    });
    expect(got).toHaveLength(3);
    expect(got[0]).toMatchObject({ mime: "image/png" });
    expect(got[1]).toEqual({ url: "https://oaidalleapiprodscus.blob.core.windows.net/a.png" });
    expect(readImages({ data: [{ b64_json: PNG }, { b64_json: PNG }, { b64_json: PNG }] }, 2)).toHaveLength(2);
    expect(readImages(null)).toEqual([]);
    expect(readImages({ data: "x" })).toEqual([]);
    expect(isImageUrl("javascript:alert(1)")).toBe(false);
  });
});

const ines: CardData = {
  id: "ines000001",
  type: "personnage",
  title: "Inès Morvan",
  html: "<p>Gardienne du phare de Kerbel. Elle remplace Yann Le Goff, qui l’appelle Nénette. Elle porte une broche rose.</p>",
  fiche: { genre: "Femme", age: "34 ans", apparence: "Cheveux courts, ciré jaune", origine: "Bretonne", role: "Protagoniste", surnoms: "Nénette" },
};
const yann: CardData = { id: "yann000001", type: "personnage", title: "Yann Le Goff", html: "" };
const rose: CardData = { id: "rose000001", type: "personnage", title: "Rose", html: "" };
const phare: CardData = { id: "phare00001", type: "lieu", title: "Phare de Kerbel", html: "", fiche: { epoque: "1912", ambiance: "Vent, sel, lumière tournante" } };
const labels = { genre: "Genre", age: "Âge", apparence: "Apparence", metier: "Métier", epoque: "Époque", ambiance: "Ambiance" };

describe("consigne : la description de l'auteur, jamais un nom propre", () => {
  it("description préremplie : champs utiles (jamais l'origine ni le rôle), puis les notes", () => {
    const text = describeCard(ines, labels, " : ");
    expect(text).toContain("Âge : 34 ans");
    expect(text).toContain("Apparence : Cheveux courts, ciré jaune");
    expect(text).not.toMatch(/Bretonne|Protagoniste/);
    expect(describeCard(phare, labels)).toContain("Ambiance: Vent, sel, lumière tournante");
    expect(subjectOf("lieu")).toBe("place");
    expect(subjectOf("image")).toBe("mood");
  });

  it("noms retirés : personnages (titres entiers, prénoms et noms avec leur majuscule, surnoms) et nom de l'auteur ; le titre d'un lieu reste (#52)", () => {
    const names = properNames([ines, yann, rose, phare], ["Sébastien Piconnier"]);
    const out = stripNames("Inès Morvan, gardienne du Phare de Kerbel, remplace Yann Le Goff. Nénette porte une broche rose ; Rose l’attend. Écrit par Sébastien Piconnier.", names);
    expect(out).not.toMatch(/Inès|Morvan|Yann|Goff|Nénette|Rose|Sébastien|Piconnier/);
    expect(out).toContain("Phare de Kerbel");
    // Un mot ordinaire qui ressemble à un prénom reste (« rose » en minuscule), comme « Le » seul.
    expect(out).toContain("broche rose");
    expect(out).not.toMatch(/ {2}| ,| \./);
  });

  it("imagePrompt : sujet, personne fictive, ni texte ni logo, et aucune trace des noms", () => {
    const names = properNames([ines, yann]);
    const prompt = imagePrompt("portrait", describeCard(ines, labels), names);
    expect(prompt).toMatch(/fictional/i);
    expect(prompt).toMatch(/must not resemble any real person/i);
    expect(prompt).toMatch(/No text, letters/i);
    expect(prompt).toContain("34 ans");
    expect(prompt).not.toMatch(/Inès|Morvan|Yann|Goff|Nénette/);
  });
});

describe("marque iaImages (frontmatter)", () => {
  const card: CardData = { id: "img0000001", type: "personnage", title: "Inès", html: "", image: "a1b2.png", images: ["c3d4.jpg"], iaImages: { "a1b2.png": "openai, gpt-image-2", "gone.png": "openai, x" } };

  it("écrite une fois, seulement pour les images que la carte porte encore, et relue", () => {
    const file = cardToFile(card);
    expect(file.match(/^iaImages:/gm)).toHaveLength(1);
    expect(file).toContain(`iaImages: {"a1b2.png":"openai, gpt-image-2"}`);
    const back = fileToCard(file)!;
    expect(back.iaImages).toEqual({ "a1b2.png": "openai, gpt-image-2" });
    // Connue de cette version : pas gardée en plus dans `keep` (sinon écrite deux fois).
    expect(back.keep?.front?.iaImages).toBeUndefined();
    expect(cardToFile(back)).toBe(file);
  });

  it("image remplacée : la marque n'est plus écrite", () => {
    expect(cardToFile({ ...card, image: "autre.png" })).not.toContain("iaImages");
  });

  it("noms de fichiers piégés ignorés, valeurs sur une ligne", () => {
    expect(readIaImages({ "../x.png": "a", "ok.png": "openai,\n gpt", "doc.pdf": "a", "b.png": 3 })).toEqual({ "ok.png": "openai, gpt" });
    expect(readIaImages([])).toBeUndefined();
  });

  it("une version d'avant (qui ne connaît pas iaImages) la garde comme ligne inconnue et la réécrit telle quelle", () => {
    // Même chemin que toute ligne inconnue d'une version plus récente (`keep.front`), vérifié ici sur une clé voisine.
    const text = "---\nid: img0000001\ntype: personnage\ntitle: \"Inès\"\nimage: a1b2.png\niaImagesV2: {\"a1b2.png\":\"x\"}\n---\n\n";
    const read = fileToCard(text)!;
    expect(read.keep?.front?.iaImagesV2).toBe(`{"a1b2.png":"x"}`);
    expect(cardToFile(read)).toContain(`iaImagesV2: {"a1b2.png":"x"}`);
  });

  it("affichage et décompte", () => {
    expect(readIaImageSource("openrouter, openai/gpt-image-2", { openrouter: "OpenRouter" })).toBe("OpenRouter, openai/gpt-image-2");
    expect(iaImagesOf(card)).toEqual({ "a1b2.png": "openai, gpt-image-2" });
    expect(iaImageCount([card, { ...card, iaImages: undefined }])).toBe(1);
  });
});

describe("journal", () => {
  const LABELS: JournalLabels = { header: "# J", actions: { variants: "V", synopsis: "S", directions: "D", pitch: "P", sheet: "F", image: "Image", external: "E" }, words: "{n} mots", quoted: "« {title} »" };
  it("une image : sa taille à la place des mots", () => {
    const line = journalLine({ at: new Date(2026, 9, 31, 14, 5), action: "image", target: "Inès", service: "openai", model: "gpt-image-2", words: 0, detail: "1024 × 1536 px" }, LABELS);
    expect(line).toBe("- 2026-10-31 14:05 · Image · « Inès » · openai, gpt-image-2 · 1024 × 1536 px");
  });
});

describe("« Garder » une image générée", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr", ai: { ...useSettings.getState().ai, provider: "openai", keys: { openai: "k" }, models: { openai: "gpt-test" } } as never });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, trash: [], lastFiles: {}, past: [], future: [], filter: NO_FILTER, spotlightId: null, journal: "", aiMode: "atelier" });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
  });
  const source = { provider: "openai", model: "gpt-image-2", detail: "1024 × 1536 px" };

  it("galerie d'un personnage sans image : image principale, marquée, une étape, une ligne du journal", async () => {
    const id = state().addTitledCard("personnage", "Inès Morvan");
    state().openImageGen({ kind: "gallery", id });
    expect(state().photoGenerate).toBe(true);
    const past = state().past.length;
    expect(await state().keepGeneratedImage({ mime: "image/png", data: png() }, source)).toBe(true);
    const card = state().nodes.find((n) => n.id === id)!.data;
    expect(card.image).toMatch(/^[A-Za-z0-9_-]+\.png$/);
    expect(card.iaImages).toEqual({ [card.image!]: "openai, gpt-image-2" });
    expect(await storage.mediaUrl(card.image!)).toMatch(/^data:image\/png;base64,/);
    expect(state().past.length).toBe(past + 1);
    expect(state().journal).toMatch(/· Image · «\s?Inès Morvan\s?» · openai, gpt-image-2 · 1024 × 1536 px/);
    // Une seconde image va dans la galerie, la première reste l'image principale.
    expect(await state().keepGeneratedImage({ mime: "image/png", data: png() }, source)).toBe(true);
    const after = state().nodes.find((n) => n.id === id)!.data;
    expect(after.image).toBe(card.image);
    expect(after.images).toHaveLength(1);
    expect(Object.keys(after.iaImages ?? {})).toHaveLength(2);
    // Annuler retire l'image de la carte ; le journal garde sa ligne.
    state().undo();
    expect(state().nodes.find((n) => n.id === id)!.data.images).toBeUndefined();
    expect(state().journal.match(/· Image ·/g)).toHaveLength(2);
  });

  it("image d'une carte Image : crédit « Image générée » à l'endroit de celui des photos libres", async () => {
    const id = state().addTitledCard("image", "Brume");
    state().openPhotos({ kind: "card", id });
    expect(await state().keepGeneratedImage({ mime: "image/png", data: png() }, source)).toBe(true);
    expect(state().nodes.find((n) => n.id === id)!.data.fiche?.publication).toBe("Image générée · OpenAI, gpt-image-2");
  });

  it("canevas : une nouvelle carte Image créditée et marquée, une étape", async () => {
    state().openPhotos({ kind: "canvas" });
    const before = state().nodes.length;
    const past = state().past.length;
    expect(await state().keepGeneratedImage({ mime: "image/png", data: png() }, { ...source, title: "Brume sur le port" })).toBe(true);
    const card = state().nodes[state().nodes.length - 1].data;
    expect(state().nodes.length).toBe(before + 1);
    expect(card).toMatchObject({ type: "image", title: "Brume sur le port", fiche: { publication: "Image générée · OpenAI, gpt-image-2" } });
    expect(card.iaImages).toEqual({ [card.image!]: "openai, gpt-image-2" });
    expect(state().past.length).toBe(past + 1);
  });

  it("sans cible : rien", async () => {
    useCosmos.setState({ photoTarget: null });
    expect(await state().keepGeneratedImage({ mime: "image/png", data: png() }, source)).toBe(false);
  });
});

describe("#52 : couverture, titres et personnages d'une scène", () => {
  const scene: CardData = { id: "scene00001", type: "scene", title: "La tempête", html: "", fiche: { pov: "ines000001", synopsis: "La lanterne s’éteint." } };
  const labelsAll = { ...labels, genre: "Genre", ton: "Ton", cible: "Public", format: "Format", themes: "Thèmes" };

  it("le titre d'un lieu, d'un objet ou d'une scène entre dans la description ; jamais celui d'un personnage", () => {
    expect(describeCard(phare, labels, " : ")).toMatch(/^Phare de Kerbel/);
    expect(describeCard(ines, labels, " : ")).not.toContain("Inès");
    const text = describeCard(scene, labels, " : ", { synopsis: "La lanterne s’éteint.", text: "Inès monte l’escalier." });
    expect(text).toContain("La tempête");
    expect(text).toContain("La lanterne s’éteint.");
    expect(subjectOf("scene")).toBe("scene");
  });

  it("personnages d'une scène : narrateur, ceux qui parlent, ceux que le texte nomme, puis les fils ; jamais une autre carte", () => {
    const yannCard = { ...yann, fiche: { apparence: "Barbe grise" } };
    const roman = sceneCast(scene, [ines, yannCard, rose, phare], [{ source: scene.id, target: rose.id }], { html: "<p>Yann attend en bas.</p>" });
    expect(roman.map((c) => c.id)).toEqual([ines.id, yann.id, rose.id]);
    const script = sceneCast({ id: scene.id }, [ines, yannCard, phare], [], { elements: [{ type: "character", text: "YANN (V.O.)" }, { type: "dialogue", text: "Inès !" }] });
    expect(script.map((c) => c.id)).toEqual([yann.id]);
  });

  it("description d'un personnage : ses champs visibles, sans nom", () => {
    const text = castDescription(ines, labels, " : ");
    expect(text).toContain("Âge : 34 ans");
    expect(text).not.toMatch(/Inès|Bretonne/);
  });

  it("consigne : titre écrit seulement sur demande, personnages décrits et références numérotées, noms retirés", () => {
    const names = properNames([ines, yann]);
    const plain = imagePrompt("cover", "Un phare dans la nuit", names);
    expect(plain).toMatch(/No text, letters/);
    const titled = imagePrompt("cover", "Un phare", names, { title: "Le \"Phare\" des Absents" });
    expect(titled).toContain("Write this title on the image");
    expect(titled).toContain("Le 'Phare' des Absents");
    const cast = imagePrompt("scene", "Inès monte", names, { cast: [{ description: "Femme, Inès Morvan", reference: true }, { description: "Barbe grise", reference: false }] });
    expect(cast).toContain("Character 1 (reference image 1)");
    expect(cast).toContain("Character 2: Barbe grise");
    expect(cast).toMatch(/Keep each one's face/);
    expect(cast).not.toMatch(/Inès|Morvan/);
  });

  it("couverture : tagline, logline, pastilles et thèmes", () => {
    const text = describeCover({ tagline: "Ils reviennent", logline: "Une gardienne…", genre: "Fantastique", resume: "long" }, ["Le deuil"], labelsAll, " : ");
    expect(text.split("\n")).toEqual(["Ils reviennent", "Une gardienne…", "Genre : Fantastique", "Thèmes : Le deuil"]);
  });

  it("références : OpenAI en multipart sur l'API d'édition, OpenRouter en chat avec les images en data URL", () => {
    const refs = Array.from({ length: 9 }, () => ({ mime: "image/png" as const, data: png() }));
    const o = referenceRequest(openai, "gpt-image-2", "p", 2, "scene", refs);
    expect(o.url).toBe("https://api.openai.com/v1/images/edits");
    expect(o.headers["content-type"]).toBeUndefined();
    const form = o.body as FormData;
    expect(form.getAll("image[]")).toHaveLength(REFERENCE_MAX);
    expect(form.get("size")).toBe("1536x1024");
    const r = referenceRequest(openrouter, "google/gemini-image", "p", 1, "cover", refs.slice(0, 2));
    expect(r.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(r.body as string);
    expect(body.modalities).toEqual(["image", "text"]);
    expect(body.image_config).toEqual({ aspect_ratio: "2:3" });
    expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it("réponse d'OpenRouter en chat : seulement des images lisibles, au plus `max`", () => {
    const ok = { image_url: { url: `data:image/png;base64,${PNG}` } };
    const json = { choices: [{ message: { images: [ok, { image_url: { url: "https://evil.example/a.png" } }, { image_url: { url: `data:image/svg+xml;base64,${btoa("<svg/>")}` } }, ok] } }] };
    expect(readChatImages(json)).toHaveLength(2);
    expect(readChatImages(json, 1)).toHaveLength(1);
    expect(readChatImages(null)).toEqual([]);
  });

  it("pitch.visuel : un nom de medias/ seulement, marque et crédit sur une ligne, retiré proprement", () => {
    expect(readPitch({ visuel: "../x.png", visuelIa: "a" })).toEqual({});
    expect(readPitch({ visuel: "a1b2.png", visuelCredit: "Photo de X\nY" })).toEqual({ visuel: "a1b2.png", visuelCredit: "Photo de X Y" });
    const p = setPitchVisual({ tagline: "t" }, "a1b2.png", { ia: "openai, gpt-image-2" });
    expect(p).toEqual({ tagline: "t", visuel: "a1b2.png", visuelIa: "openai, gpt-image-2" });
    expect(setPitchVisual(p, "a1b2.png", { ia: "openai, gpt-image-2" })).toBe(p);
    expect(setPitchVisual(p, null)).toEqual({ tagline: "t" });
  });

  it("couverture du PDF de la Bible : celle du projet par défaut, « Aucune » la retire, un autre choix l'emporte", () => {
    expect(coverOf("", "a1b2.png")).toBe("a1b2.png");
    expect(coverOf(COVER_NONE, "a1b2.png")).toBeNull();
    expect(coverOf("c3d4.jpg", "a1b2.png")).toBe("c3d4.jpg");
    expect(coverOf("", undefined)).toBeNull();
    expect(cleanOptions({ cover: COVER_NONE }).cover).toBe(COVER_NONE);
    expect(cleanOptions({ cover: "../x" }).cover).toBe("");
  });
});
