// Images de l'exemple « Le Puits » (prompts dans docs/exemple-puits-images.md), communes aux deux langues.
// Chaque image est placée dans le texte d'une scène (après le paragraphe `after`, 0 = en tête) avec sa place dans le
// livre broché, et sert d'image à des fiches de la Bible. La couverture va dans la couverture du projet.

export const COVER = "puits-10-couverture.jpg";

export const SCENE_IMAGES = [
  { scene: "2gJB3nW4Wv", file: "puits-01-cour.jpg", place: "chapter", after: 0, alt: { fr: "La cour de la ferme la nuit : le puits ouvert, son couvercle appuyé contre la margelle, et la lanterne qui attend sur l'établi.", en: "The farmyard at night: the open well, its lid leaning against the rim, and the lantern waiting on the workbench." } },
  { scene: "YaUbjIKvHl", file: "puits-02-lanterne.jpg", place: "inline", after: 5, alt: { fr: "Le mur aux outils dessinés à la craie, éclairé par la lanterne : il manque la petite pelle, et des traces de mains d'enfant marquent l'établi.", en: "The tool wall with chalk outlines, lit by the lantern: the little spade is missing, and a child’s handprints mark the workbench." } },
  { scene: "IXCnze5N1V", file: "puits-07-carnet.jpg", place: "inline", after: 12, alt: { fr: "Le carnet d'Odile ouvert sur le secrétaire, rempli de dessins de la ferme à l'envers, à côté de l'enveloppe et de la clé de fer.", en: "Odile’s notebook open on the desk, full of drawings of the farm upside down, beside the envelope and the iron key." } },
  { scene: "PhtHHaiM37", file: "puits-03-echelle.jpg", place: "chapter", after: 0, alt: { fr: "Vue plongeante dans le puits : des mains agrippent un barreau, la flamme de la lanterne se couche, et un barreau plus bas est cassé.", en: "Looking down into the well: hands grip a rung, the lantern flame is blown sideways, and a rung further down is broken." } },
  { scene: "cIDbtdWvEc", file: "puits-04-niche.jpg", place: "inline", after: 4, alt: { fr: "La niche aux trésors : un soldat de plomb, un ruban, une toupie, un harmonica, une tête de poupée et la bille œil-de-dragon.", en: "The niche of treasures: a tin soldier, a ribbon, a spinning top, a harmonica, a doll’s head and the dragon’s-eye marble." } },
  { scene: "HrtEXK9NKI", file: "puits-08-cour-d-en-bas.jpg", place: "page", after: 1, alt: { fr: "La cour d'en bas, identique à celle de la ferme, sous un ciel d'eau noire ; une silhouette de dos lève la lanterne.", en: "The yard below, identical to the farmyard, under a sky of black water; a figure seen from behind raises the lantern." } },
  { scene: "2-UWo3X4YD", file: "puits-05-paul.jpg", place: "page", after: 2, alt: { fr: "Paul, de dos, en pyjama rayé, assis au bord du lac noir, aligne des cailloux.", en: "Paul, seen from behind in striped pyjamas, sits at the edge of the black lake, lining up pebbles." } },
  { scene: "kElYuabMSz", file: "puits-09-celui-qui-boit.jpg", place: "page", after: 1, alt: { fr: "Celui qui boit : une colonne d'eau noire où dorment des visages d'enfants ; devant elle, une silhouette lève la lanterne, Paul accroché à elle.", en: "The one who drinks: a column of black water where children’s faces sleep; in front of it, a figure raises the lantern, Paul clinging on." } },
  { scene: "XmRrwnIWKh", file: "puits-06-matin.jpg", place: "chapter", after: 0, alt: { fr: "L'aube dans la cour : Paul, assis sur la margelle du puits refermé, enfile ses sandales.", en: "Dawn in the yard: Paul, sitting on the rim of the closed well, puts on his sandals." } },
];

/** Image principale des fiches (cartes non Scène) : identifiant → fichier. */
export const CARD_IMAGES = {
  "5xmLViOKEx": "puits-01-cour.jpg", // Ferme des Combes
  ldQZvO2Het: "puits-03-echelle.jpg", // Le puits
  ZPv3kYSJv7: "puits-04-niche.jpg", // La niche
  WNh9vyU3T6: "puits-08-cour-d-en-bas.jpg", // La ferme d'en bas
  ark_Sk6atM: "puits-05-paul.jpg", // Le lac noir
  "8290ZuJdRK": "puits-05-paul.jpg", // Paul
  nKFYoFi_Cw: "puits-09-celui-qui-boit.jpg", // Ourdas
  FFP5HuhWqQ: "puits-02-lanterne.jpg", // La lanterne
  iSUsAp4YwJ: "puits-07-carnet.jpg", // Le carnet d'Odile
  "9syeP6zIjz": "puits-06-matin.jpg", // Les sandales de Paul
};

/** Pose les images dans les fichiers d'un projet (texte des scènes, fiches, couverture), dans la langue donnée. */
export function withImages(files, lang) {
  const out = { ...files };
  for (const img of SCENE_IMAGES) {
    const path = `manuscrit/${img.scene}.md`;
    const text = out[path];
    if (text === undefined) throw new Error(`Scène sans texte pour ${img.file}`);
    const title = img.place === "inline" ? "" : ` "${img.place}"`;
    const line = `![${img.alt[lang]}](../medias/${img.file}${title})`;
    const paras = text.split("\n\n");
    // Jamais après le bloc de choix : il reste en fin de scène.
    const at = Math.min(img.after, paras.findIndex((p) => p.startsWith("```choix")));
    paras.splice(at, 0, line);
    out[path] = paras.join("\n\n");
  }
  for (const [id, file] of Object.entries(CARD_IMAGES)) {
    const path = `cartes/${id}.md`;
    if (!out[path]) throw new Error(`Fiche absente : ${id}`);
    out[path] = out[path].replace(/^(title: .*)$/m, `$1\nimage: ${file}`);
  }
  const meta = JSON.parse(out["cosmos.json"]);
  meta.pitch = { ...(meta.pitch ?? {}), visuel: COVER };
  out["cosmos.json"] = `${JSON.stringify(meta, null, 2)}\n`;
  return out;
}
