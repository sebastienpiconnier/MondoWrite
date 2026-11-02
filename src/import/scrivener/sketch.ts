// Fiches de personnage et de lieu des modèles de Scrivener (« Character Sketch », « Setting Sketch », en anglais
// ou en français) : chaque intitulé reconnu remplit un champ de la fiche MondoWrite, le reste garde son intitulé
// dans le texte de la carte. Une fiche qui n'a que ses intitulés (jamais remplie) est vide : on ne l'importe pas.
// Pur.

import { titleCase } from "../../screenplay/editor/autocomplete";
import type { ImportedPara } from "../manuscript";

export type SketchKind = "personnage" | "lieu";

/** Intitulé replié (sans casse, accents, ponctuation) → champ de la fiche, ou "" pour un intitulé gardé dans le texte. */
const LABELS: Record<SketchKind, Record<string, string>> = {
  personnage: {
    charactername: "@title",
    nomdupersonnage: "@title",
    nom: "@title",
    name: "@title",
    roleinstory: "role",
    role: "role",
    roledanslhistoire: "role",
    roledanslerecit: "role",
    occupation: "metier",
    profession: "metier",
    metier: "metier",
    physicaldescription: "apparence",
    descriptionphysique: "apparence",
    apparence: "apparence",
    personality: "personnalite",
    personnalite: "personnalite",
    physique: "apparence",
    physical: "apparence",
    evolution: "arc",
    arc: "arc",
    situation: "",
    particularites: "",
    traits: "",
    race: "",
    espece: "",
    internalconflicts: "blessure",
    internalconflict: "blessure",
    conflitsinternes: "blessure",
    conflitinterieur: "blessure",
    conflitsinterieurs: "blessure",
    goal: "objectif",
    goals: "objectif",
    objectif: "objectif",
    objectifs: "objectif",
    age: "age",
    habitsmannerisms: "",
    habitudesmanies: "",
    habitudes: "",
    background: "",
    passe: "",
    antecedents: "",
    externalconflicts: "",
    conflitsexternes: "",
    notes: "",
  },
  lieu: {
    locationname: "@title",
    settingname: "@title",
    nomdulieu: "@title",
    nom: "@title",
    name: "@title",
    roleinstory: "importance",
    roledanslhistoire: "importance",
    roledanslerecit: "importance",
    importance: "importance",
    sights: "ambiance",
    sounds: "ambiance",
    smells: "ambiance",
    sightssoundssmells: "ambiance",
    vuessonsodeurs: "ambiance",
    ambiance: "ambiance",
    epoque: "epoque",
    period: "epoque",
    description: "",
    notes: "",
  },
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export interface Sketch {
  /** Titre tiré de la fiche (« Character Name : Inès »), si le document n'en a pas. */
  title: string;
  fiche: Record<string, string>;
  /** Paragraphes restants (intitulés non repris et leur texte, texte libre), en HTML. */
  body: string[];
  /** Vrai si la fiche n'a que ses intitulés : rien à importer. */
  empty: boolean;
  /** Vrai si au moins un intitulé du modèle a été reconnu (c'était bien une fiche). */
  matched: boolean;
}

/** Intitulé d'un paragraphe (« Role in Story: », « Personnalité : ») et ce qui le suit sur la même ligne. */
function labelOf(text: string, kind: SketchKind): { key: string; label: string; rest: string } | null {
  // Un élément de liste (« • Âge : 35 ans ») se lit comme une ligne.
  text = text.replace(/^[•◦▪]\s*/, "");
  const m = text.match(/^([^:\n]{2,40}?)\s*:\s*([\s\S]*)$/) ?? (text.length <= 40 ? [text, text, ""] : null);
  if (!m) return null;
  const key = LABELS[kind][fold(m[1])];
  return key === undefined ? null : { key, label: m[1].trim(), rest: m[2].trim() };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Lit une fiche de modèle. Les paragraphes avant le premier intitulé reconnu restent du texte libre. */
export function readSketch(paras: ImportedPara[], kind: SketchKind): Sketch {
  const fiche: Record<string, string> = {};
  const body: string[] = [];
  let title = "";
  let matched = false;
  let current: { key: string; label: string; values: string[]; html: string[] } | null = null;
  const close = () => {
    if (!current) return;
    const value = current.values.join("\n").trim();
    if (value) {
      if (current.key === "@title") title = title || value.split("\n")[0];
      else if (current.key) fiche[current.key] = fiche[current.key] ? `${fiche[current.key]}\n${value}` : value;
      else body.push(`<p><strong>${escapeHtml(current.label)}</strong></p>`, ...current.html);
    }
    current = null;
  };
  for (const p of paras) {
    if (!p.text) continue;
    const label = labelOf(p.text, kind);
    if (label) {
      close();
      matched = true;
      current = { key: label.key, label: label.label, values: label.rest ? [label.rest] : [], html: label.rest ? [`<p>${escapeHtml(label.rest)}</p>`] : [] };
      continue;
    }
    if (current) {
      current.values.push(p.text);
      current.html.push(`<p>${p.html}</p>`);
    } else body.push(`<p>${p.html}</p>`);
  }
  close();
  return { title, fiche, body, empty: matched && !title && Object.keys(fiche).length === 0 && body.length === 0, matched };
}

/** Un personnage d'une liste de personnages : sa fiche, son accroche, et s'il est rangé parmi les principaux. */
export interface ListedCharacter extends Sketch {
  accroche: string;
  principal: boolean;
}

const isCaps = (s: string) => /\p{Lu}/u.test(s) && s === s.toLocaleUpperCase("fr");

/**
 * Une liste de personnages dans un seul document (« ETHAN MOREAU - Le protagoniste », puis « Âge : … »,
 * « Profession : … » ; testé sur un vrai projet, 1.14.0) : un personnage par intitulé suivi de lignes de fiche.
 * Les intitulés sans lignes de fiche sont des parties (« PERSONNAGES PRINCIPAUX ») : la partie des principaux
 * (et pas des « secondaires principaux ») coche « Personnage principal ». null s'il y a moins de deux personnages.
 */
export function readCharacterList(paras: ImportedPara[]): ListedCharacter[] | null {
  const blocks: { head: ImportedPara | null; lines: ImportedPara[] }[] = [{ head: null, lines: [] }];
  for (const p of paras) {
    if (!p.text) continue;
    if (p.heading) blocks.push({ head: p, lines: [] });
    else blocks[blocks.length - 1].lines.push(p);
  }
  const out: ListedCharacter[] = [];
  let principal = false;
  for (const block of blocks) {
    if (!block.head) continue;
    const labelled = block.lines.filter((p) => {
      const label = labelOf(p.text, "personnage");
      return label && label.key !== "@title" && label.rest;
    }).length;
    if (labelled === 0) {
      const part = fold(block.head.text);
      if (/personnage|character|cast|protagon/.test(part)) principal = /princip|main|lead/.test(part) && !/secondair|second|support|minor/.test(part);
      continue;
    }
    const head = block.head.text.trim();
    const cut = head.match(/^(.+?)\s+[-–—:]\s+(.+)$/);
    const rawName = (cut ? cut[1] : head).trim();
    const sketch = readSketch(block.lines, "personnage");
    out.push({
      ...sketch,
      title: isCaps(rawName) ? titleCase(rawName, "fr") : rawName,
      accroche: cut ? cut[2].trim() : "",
      principal,
    });
  }
  return out.length >= 2 ? out : null;
}
