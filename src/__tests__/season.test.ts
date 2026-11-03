// Série écrite épisode par épisode (docs/plan-episodes.md, lot 1) : la saison en mémoire (season.ts), et le passage
// par le disque (scenario.fountain pour le premier épisode, episodes/<id>.fountain pour les autres).
// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";
import {
  addEpisode,
  episodeAt,
  episodeIds,
  episodeOfCard,
  episodeOffset,
  episodeScript,
  inEpisode,
  isSeason,
  joinSeason,
  newEpisodeTitlePage,
  removeEpisode,
  resolveEpisode,
  startSeason,
  withEpisodeScript,
} from "../screenplay/season";
import { appendScene } from "../screenplay/link";
import { trashCard } from "../trash";
import { readSeason, toProject } from "../projectState";
import { deserialize, serialize as serializeProject } from "../storage";
import { EPISODES_DIR, SCREENPLAY_FILE, episodeIdOf, episodePath, isProjectFilePath } from "../storage/paths";
import { conflictSubject } from "../conflicts";

const pilot = parse("Title: Le Phare\n\nINT. PHARE - NUIT [[cosmos:s1]]\n\nLa lampe est froide.\n");
const second = parse("Title: Le Phare\n\nEXT. PORT - JOUR [[cosmos:s2]]\n\nLes bateaux rentrent.\n");

describe("saison en mémoire", () => {
  const season = joinSeason([
    { id: "e1", script: pilot },
    { id: "e2", script: second },
  ]);

  it("garde chaque épisode à part, jamais écrit avec ses repères", () => {
    expect(isSeason(season)).toBe(true);
    expect(isSeason(pilot)).toBe(false);
    expect(episodeIds(season)).toEqual(["e1", "e2"]);
    expect(serialize(episodeScript(season, "e2"))).toBe(serialize(second));
    // Un texte entier qui atteindrait serialize n'y laisserait aucune trace de repère.
    expect(serialize(season)).not.toMatch(/^#/m);
  });

  it("rend le même objet tant que l'épisode ne change pas", () => {
    const a = episodeScript(season, "e1");
    expect(episodeScript(season, "e1")).toBe(a);
    // Un changement dans un autre épisode ne touche pas à celui-ci.
    const other = episodeScript(season, "e2");
    const changed = withEpisodeScript(season, "e2", { ...other, elements: [...other.elements, { type: "action", text: "La nuit tombe." }] });
    expect(episodeScript(changed, "e1")).toBe(a);
    expect(withEpisodeScript(season, "e1", a)).toBe(season);
  });

  it("écrit dans l'épisode donné, et l'éditeur relit exactement ce qu'il a envoyé", () => {
    const script = { titlePage: { Title: "Ép. 2" }, elements: [{ type: "action" as const, text: "Autre texte." }] };
    const next = withEpisodeScript(season, "e2", script);
    expect(episodeScript(next, "e2")).toBe(script);
    expect(serialize(episodeScript(next, "e1"))).toBe(serialize(pilot));
  });

  it("donne les rangs de la saison et l'épisode d'une scène", () => {
    expect(episodeOffset(season, "e1")).toBe(1);
    const offset = episodeOffset(season, "e2");
    expect(season.elements[offset].cardId).toBe("s2");
    expect(episodeAt(season, offset)).toBe("e2");
    expect(episodeAt(season, 1)).toBe("e1");
    expect(episodeOfCard(season, "s2")).toBe("e2");
    expect(episodeOfCard(season, "inconnu")).toBeNull();
    expect(episodeOffset(pilot, null)).toBe(0);
  });

  it("retombe sur le premier épisode quand l'épisode demandé n'existe pas", () => {
    expect(resolveEpisode(season, "parti")).toBe("e1");
    expect(resolveEpisode(pilot, "e1")).toBeNull();
    expect(episodeScript(pilot, "e1")).toBe(pilot);
  });

  it("ajoute une scène à la fin de l'épisode ouvert, pas de la saison", () => {
    const next = inEpisode(season, "e1", (sp) => appendScene(sp, { id: "s3", title: "INT. CAVE - NUIT" }));
    expect(episodeOfCard(next, "s3")).toBe("e1");
    expect(episodeScript(next, "e2").elements.some((el) => el.cardId === "s3")).toBe(false);
  });

  it("commence une saison avec le texte déjà écrit, puis ajoute et retire des épisodes", () => {
    const started = startSeason(pilot, "e1");
    expect(startSeason(started, "autre")).toBe(started);
    expect(serialize(episodeScript(started, "e1"))).toBe(serialize(pilot));
    const added = addEpisode(started, "e2", { titlePage: newEpisodeTitlePage({ Title: "Le Phare", "Draft date": "1er mai" }), elements: [] });
    expect(episodeIds(added)).toEqual(["e1", "e2"]);
    expect(episodeScript(added, "e2").titlePage).toEqual({ Title: "Le Phare" });
    const cut = removeEpisode(added, "e1");
    expect(episodeIds(cut.screenplay)).toEqual(["e2"]);
    expect(serialize(cut.removed!)).toBe(serialize(pilot));
    // Le dernier épisode retiré : un scénario vide qui garde sa page de titre.
    const last = removeEpisode(cut.screenplay, "e2");
    expect(isSeason(last.screenplay)).toBe(false);
    expect(last.screenplay).toEqual({ titlePage: { Title: "Le Phare" }, elements: [] });
  });

  it("met une scène à la corbeille sans déborder sur l'épisode suivant", () => {
    const { entry, screenplay } = trashCard({ id: "s1", type: "scene", title: "INT. PHARE - NUIT", html: "" }, { x: 0, y: 0 }, [], season, "2026-11-03");
    expect(entry.trashed.scene).toContain("La lampe est froide.");
    expect(entry.trashed.scene).not.toContain("PORT");
    expect(episodeIds(screenplay)).toEqual(["e1", "e2"]);
    expect(serialize(episodeScript(screenplay!, "e2"))).toBe(serialize(second));
  });
});

describe("saison sur disque", () => {
  it("reconnaît les chemins des épisodes, et rien d'autre", () => {
    expect(episodePath("e2")).toBe(`${EPISODES_DIR}/e2.fountain`);
    expect(episodeIdOf("episodes/e2.fountain")).toBe("e2");
    expect(episodeIdOf("episodes/../cosmos.fountain")).toBeNull();
    expect(episodeIdOf("episodes/.cache.fountain")).toBeNull();
    expect(episodeIdOf("episodes/e2.md")).toBeNull();
    expect(isProjectFilePath("episodes/e2.fountain")).toBe(true);
    expect(isProjectFilePath("episodes/e2 (MondoWrite).fountain")).toBe(false);
    expect(isProjectFilePath("episodes/sous/e2.fountain")).toBe(false);
    expect(conflictSubject("episodes/e2.fountain")).toEqual({ kind: "screenplay" });
  });

  it("écrit le premier épisode dans scenario.fountain et les autres à part, puis les relit dans l'ordre de la série", () => {
    const meta = { version: 1, title: "Le Phare", kind: "scenario", layout: [], links: [], pilot: "e1" } as never;
    const cards = [
      { id: "e2", type: "episode" as const, title: "Tempête", html: "", fiche: { numero: "2" } },
      { id: "e1", type: "episode" as const, title: "Le signal", html: "", fiche: { numero: "1" } },
    ];
    const files = serializeProject({ meta, cards, screenplay: pilot, episodes: { e2: second } });
    expect(files[SCREENPLAY_FILE]).toBe(serialize(pilot));
    expect(files[episodePath("e2")]).toBe(serialize(second));
    const back = deserialize(files)!;
    expect(Object.keys(back.episodes ?? {})).toEqual(["e2"]);
    const season = readSeason(back, cards)!;
    expect(episodeIds(season)).toEqual(["e1", "e2"]);
  });

  it("garde un texte d'épisode dont la carte n'existe plus, et retrouve un pilote perdu", () => {
    const meta = { version: 1, title: "Le Phare", kind: "scenario", layout: [], links: [] } as never;
    const cards = [{ id: "e1", type: "episode" as const, title: "Le signal", html: "" }];
    // cosmos.json réécrit par une version d'avant : plus de `pilot`, le premier épisode sans fichier le redevient.
    const season = readSeason({ meta, screenplay: pilot, episodes: { e9: second } }, cards)!;
    expect(episodeIds(season)).toEqual(["e1", "e9"]);
    // Sans fichier d'épisode : le scénario tel quel.
    expect(readSeason({ meta, screenplay: pilot }, cards)).toBe(pilot);
  });

  it("toProject sépare la saison et note le premier épisode", () => {
    const season = joinSeason([
      { id: "e1", script: pilot },
      { id: "e2", script: second },
    ]);
    const project = toProject({
      title: "Le Phare",
      kind: "scenario",
      paper: "a4",
      paperChosen: true,
      sceneNumbers: false,
      underlineHeadings: false,
      hideWires: false,
      aiMode: "gardienne",
      journal: "",
      comments: {},
      markdownCopies: true,
      nodes: [],
      frames: [],
      edges: [],
      screenplay: season,
      plan: { template: "libre", beats: {} },
      manuscript: {},
      goals: {},
      progress: {},
      pitch: {},
      chutier: [],
      print: {},
      scriptPdf: {},
      bibleExport: {},
      metaKeep: {},
      trash: [],
    } as never);
    expect(project.meta.pilot).toBe("e1");
    expect(serialize(project.screenplay!)).toBe(serialize(pilot));
    expect(Object.keys(project.episodes ?? {})).toEqual(["e2"]);
  });
});
