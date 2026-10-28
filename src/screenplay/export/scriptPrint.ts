// Réglages de l'export PDF du scénario (fenêtre « Exporter le scénario en PDF »), gardés dans le projet sous
// `scriptPdf` dans cosmos.json. Module léger (le store le lit) : la composition est dans typeset.ts. Les clés
// et valeurs sont écrites dans le fichier : ne jamais les renommer. Décochées, les options donnent le format
// standard, celui qu'on envoie.

export interface ScriptPrint {
  /** "" : tout le scénario ; sinon le nom d'un personnage (ses scènes seulement, ses répliques surlignées). */
  character: string;
  titlePage: boolean;
  /** Synopsis des scènes (lignes « = … »). */
  synopsis: boolean;
  /** Sections (« # Acte I ») et cases du gabarit du séquencier. */
  sections: boolean;
  /** Notes [[…]] de l'auteur (jamais les notes de lien cosmos:). */
  notes: boolean;
  /** En haut de chaque page, à gauche : {date}, {titre}, {auteur} (ou {title}, {author}) remplacés. */
  header: string;
  /** Grand texte en travers de chaque page (« Confidentiel »). */
  watermark: string;
  /** Réplique coupée par la page : (À SUIVRE) en bas, (SUITE) après le nom en haut de la suivante. Aussi à l'écran. */
  breaks: boolean;
  /** Le même personnage reprend après une action, dans la même scène : (SUITE) après son nom. Aussi à l'écran. */
  resumes: boolean;
}

export const DEFAULT_SCRIPT_PRINT: ScriptPrint = { character: "", titlePage: true, synopsis: false, sections: false, notes: false, header: "", watermark: "", breaks: true, resumes: false };

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Réglages relus (cosmos.json) : toute valeur inconnue reprend sa valeur par défaut. */
export function cleanScriptPrint(raw: unknown): ScriptPrint {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SCRIPT_PRINT;
  return {
    character: line(p.character, 80),
    titlePage: flag(p.titlePage, d.titlePage),
    synopsis: flag(p.synopsis, d.synopsis),
    sections: flag(p.sections, d.sections),
    notes: flag(p.notes, d.notes),
    header: line(p.header, 120),
    watermark: line(p.watermark, 60),
    breaks: flag(p.breaks, d.breaks),
    resumes: flag(p.resumes, d.resumes),
  };
}

/** Ce qui s'écrit dans cosmos.json : rien tant que l'auteur n'a rien changé. */
export const scriptPrintToMeta = (p: ScriptPrint): ScriptPrint | undefined => {
  const clean = cleanScriptPrint(p);
  return JSON.stringify(clean) === JSON.stringify(DEFAULT_SCRIPT_PRINT) ? undefined : clean;
};

/** En-tête de page : {date}, {titre} / {title}, {auteur} / {author} remplacés ; le reste tel quel. */
export function fillHeader(template: string, values: { date: string; title: string; author: string }): string {
  return template
    .replace(/\{date\}/gi, values.date)
    .replace(/\{(titre|title)\}/gi, values.title)
    .replace(/\{(auteur|author)\}/gi, values.author)
    .replace(/\s+/g, " ")
    .trim();
}
