// Projet d'exemple : « Le Petit Chaperon rouge » de Charles Perrault (1697), avec trois gravures de
// Gustave Doré (gravées par Pannemaker, édition Hetzel, 1862). Texte et images sont du domaine public.
//
// Il montre un projet à mi-chemin du chaos au monde ordonné : des cartes encore en vrac sur le canevas
// (une idée, une question, une source, une gravure), une Bible remplie (couverture, moteurs des personnages, intrigue),
// un plan en trois actes avec deux chapitres, et le conte écrit scène par scène dans le manuscrit.
// Les textes sont dans `t.demo` (langue de l'appareil) ; les images, dans demoMedia.ts (chargé à la demande).

import { getT } from "./i18n";
import { newId, p } from "./projectState";
import type { CardData, CardLayout, Link, Project } from "./types";

/** Images du projet d'exemple, écrites dans medias/ à sa création (voir demoMedia.ts). */
export const DEMO_IMAGES = { foret: "dore-foret.jpg", lit: "dore-lit.jpg", mereGrand: "dore-mere-grand.jpg" } as const;

const paragraphs = (texts: readonly string[]) => texts.map(p).join("");
/** Vers de la Moralité : un seul paragraphe, un vers par ligne. */
const verses = (lines: readonly string[]) => p(lines.join("\n")).replace(/\n/g, "<br>");

export function demoProject(): Project {
  const d = getT().demo;
  const s = d.scenes;
  const id = {
    chaperon: newId(), loup: newId(), mereGrand: newId(), mere: newId(),
    village: newId(), bois: newId(), maison: newId(),
    intrigue: newId(), naivete: newId(), apparences: newId(),
    question: newId(), idee: newId(), source: newId(), gravure: newId(),
    galette: newId(), rencontre: newId(), chemins: newId(), toctoc: newId(), porte: newId(), dents: newId(),
    moral: newId(),
  };
  const scene = (key: keyof typeof s): CardData => ({ id: id[key], type: "scene", title: s[key].title, html: "", fiche: { synopsis: s[key].synopsis } });

  const cards: CardData[] = [
    { id: id.idee, type: "idee", title: "", html: p(d.idea) },
    { id: id.question, type: "question", title: d.question.title, html: p(d.question.body) },
    { id: id.source, type: "lien", title: d.source.title, html: p(d.source.body), fiche: { url: d.source.url, auteur: "Charles Perrault", publication: "1697" } },
    {
      id: id.gravure, type: "image", title: d.gravure.title, html: p(d.gravure.body), image: DEMO_IMAGES.foret,
      fiche: { auteur: "Gustave Doré", publication: "1862" },
    },
    {
      id: id.chaperon, type: "personnage", title: d.chaperon.title, html: p(d.chaperon.body), image: DEMO_IMAGES.foret,
      fiche: { role: d.chaperon.role, age: d.chaperon.age, apparence: d.chaperon.apparence, objectif: d.chaperon.objectif, besoin: d.chaperon.besoin, arcType: "negatif" },
      questions: [d.chaperon.question],
    },
    {
      id: id.loup, type: "personnage", title: d.loup.title, html: p(d.loup.body), image: DEMO_IMAGES.lit, images: [DEMO_IMAGES.foret],
      fiche: { role: d.loup.role, surnoms: d.loup.surnoms, motivation: d.loup.motivation, force: d.loup.force, faille: d.loup.faille, arcType: "plat" },
    },
    { id: id.mereGrand, type: "personnage", title: d.mereGrand.title, html: p(d.mereGrand.body), image: DEMO_IMAGES.mereGrand, fiche: { role: d.mereGrand.role, surnoms: d.mereGrand.surnoms } },
    { id: id.mere, type: "personnage", title: d.mere.title, html: p(d.mere.body), fiche: { role: d.mere.role } },
    { id: id.village, type: "lieu", title: d.village.title, html: p(d.village.body) },
    { id: id.bois, type: "lieu", title: d.bois.title, html: p(d.bois.body), fiche: { ambiance: d.bois.ambiance } },
    { id: id.maison, type: "lieu", title: d.maison.title, html: p(d.maison.body) },
    { id: id.intrigue, type: "intrigue", title: d.intrigue.title, html: "", fiche: { question: d.intrigue.question, enjeu: d.intrigue.enjeu } },
    { id: id.naivete, type: "theme", title: d.naivete.title, html: p(d.naivete.body) },
    { id: id.apparences, type: "theme", title: d.apparences.title, html: p(d.apparences.body) },
    scene("galette"), scene("rencontre"), scene("chemins"), scene("toctoc"), scene("porte"), scene("dents"),
    { id: id.moral, type: "scene", title: d.moral.title, html: "", page: "epilogue" },
  ];

  // Le canevas : les personnages à gauche, les lieux au milieu, les scènes en bas, ce qui reste en vrac à droite.
  const at = (key: keyof typeof id, x: number, y: number): CardLayout => ({ id: id[key], x, y });
  const layout: CardLayout[] = [
    at("chaperon", 40, 40), at("loup", 360, 40), at("mereGrand", 680, 40), at("mere", 40, 580),
    at("village", 360, 580), at("bois", 680, 580), at("maison", 1000, 580),
    at("intrigue", 1000, 40), at("naivete", 1000, 330), at("apparences", 1320, 330),
    at("idee", 1320, 40), at("question", 1640, 40), at("source", 1640, 330), at("gravure", 1960, 40),
    at("galette", 40, 920), at("rencontre", 360, 920), at("chemins", 680, 920),
    at("toctoc", 1000, 920), at("porte", 1320, 920), at("dents", 1640, 920),
    at("moral", 1960, 920),
  ];

  const l = d.links;
  const link = (source: keyof typeof id, target: keyof typeof id, label: string): Link => ({ id: newId(), source: id[source], target: id[target], label });
  const links: Link[] = [
    link("chaperon", "mereGrand", l.grandDaughter),
    link("mere", "chaperon", l.motherOf),
    link("loup", "chaperon", l.wantsToEat),
    link("loup", "mereGrand", l.devours),
    link("mereGrand", "maison", l.livesIn),
    link("mere", "village", l.livesIn),
    link("galette", "village", l.setIn),
    link("rencontre", "bois", l.setIn),
    link("chemins", "bois", l.runsThrough),
    link("toctoc", "maison", l.setIn),
    link("porte", "maison", l.setIn),
    link("dents", "maison", l.setIn),
    link("mere", "galette", l.sends),
    link("intrigue", "rencontre", l.knots),
    link("intrigue", "dents", l.unties),
    link("naivete", "rencontre", l.themeIn),
    link("apparences", "dents", l.themeIn),
  ];

  return {
    meta: {
      version: 1,
      title: d.title,
      kind: "roman",
      layout,
      links,
      plan: {
        template: "troisActes",
        beats: {
          a_setup: [id.galette], a_incident: [id.rencontre], a_confrontation: [id.chemins],
          a_midpoint: [id.toctoc], a_crisis: [id.porte], a_climax: [id.dents],
        },
        chapters: [
          { id: newId(), title: d.chapterWood, scenes: [id.galette, id.rencontre, id.chemins] },
          { id: newId(), title: d.chapterHouse, scenes: [id.toctoc, id.porte, id.dents] },
        ],
      },
      pitch: { ...d.pitch },
    },
    cards,
    manuscript: {
      [id.galette]: paragraphs(s.galette.text),
      [id.rencontre]: paragraphs(s.rencontre.text),
      [id.chemins]: paragraphs(s.chemins.text),
      [id.toctoc]: paragraphs(s.toctoc.text),
      [id.porte]: paragraphs(s.porte.text),
      [id.dents]: paragraphs(s.dents.text),
      [id.moral]: verses(d.moral.verses),
    },
    screenplay: null,
  };
}
