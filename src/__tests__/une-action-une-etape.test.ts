// @vitest-environment happy-dom
// Historique (1.7.5) : une action, une étape. Après chaque action, exactement une étape de plus dans `past`
// (aucune si l'action ne change rien), et un seul Annuler rend l'état d'avant.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCosmos, type CosmosState } from "../store";
import { useSettings } from "../settings";

const state = () => useCosmos.getState();

let clock = 1_000_000;
/** Deux actions de même étiquette à moins de 800 ms fusionnent : chaque action du test a son propre moment. */
const tick = () => {
  clock += 5_000;
};

async function newProject(kind: "roman" | "scenario") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
  await state().start();
  await state().createProject({ title: "Kerlaouen", kind });
}

/** Petit projet : deux personnages reliés, trois scènes titrées (avec un texte en roman), un cadre, un gabarit. */
function fixture(kind: "roman" | "scenario") {
  const ines = state().addTitledCard("personnage", "Inès");
  const yann = state().addTitledCard("personnage", "Yann");
  const s1 = state().addCard({ x: 0, y: 400 }, "scene");
  const s2 = state().addCard({ x: 400, y: 400 }, "scene");
  const s3 = state().addCard({ x: 800, y: 400 }, "scene");
  state().updateCard(s1, { title: kind === "scenario" ? "INT. PHARE - NUIT" : "Le phare" });
  state().updateCard(s2, { title: kind === "scenario" ? "EXT. CÔTE - JOUR" : "La côte" });
  state().updateCard(s3, { title: kind === "scenario" ? "INT. CUISINE - SOIR" : "La cuisine" });
  if (kind === "roman") state().setManuscriptText(s1, "<p>Inès monte les marches du phare.</p>");
  state().linkCards(ines, yann, "aime");
  const frame = state().addFrame({ x: 2000, y: 2000 });
  state().setPlanTemplate(kind === "scenario" ? "troisActes" : "troisActes");
  state().deleteCard(state().addTitledCard("idee", "À jeter"));
  const trashed = state().trash[0].id;
  const link = state().edges.find((e) => e.source === ines || e.target === ines)!.id;
  state().clearSelection();
  return { ines, yann, s1, s2, s3, frame, trashed, link };
}

type Ids = ReturnType<typeof fixture>;

const strip = <T extends { selected?: boolean }>(list: T[]) => list.map(({ selected: _s, ...rest }) => rest);
const view = (s: CosmosState) => ({
  nodes: strip(s.nodes),
  frames: strip(s.frames),
  edges: s.edges,
  screenplay: s.screenplay,
  plan: s.plan,
  trash: s.trash,
});

interface Case {
  name: string;
  run: (ids: Ids) => unknown;
  /** Nombre d'étapes attendues (1 par défaut, 0 pour une action qui ne change rien). */
  steps?: number;
  only?: "roman" | "scenario";
}

const CASES: Case[] = [
  { name: "addCard", run: () => state().addCard({ x: 3000, y: 0 }) },
  { name: "addTitledCard", run: () => state().addTitledCard("lieu", "Le port") },
  { name: "captureCard", run: () => state().captureCard("idee", "Une note\nprise au vol") },
  { name: "updateCard titre", run: ({ ines }) => state().updateCard(ines, { title: "Inès Morvan" }) },
  { name: "updateCard titre inchangé", run: ({ ines }) => state().updateCard(ines, { title: "Inès" }), steps: 0 },
  { name: "updateCard type", run: ({ yann }) => state().updateCard(yann, { type: "lieu" }) },
  { name: "updateCard type d'une Scène", run: ({ s1 }) => state().updateCard(s1, { type: "idee" }) },
  { name: "setFiche", run: ({ ines }) => state().setFiche(ines, "age", "34 ans") },
  { name: "setFiche inchangé", run: ({ ines }) => state().setFiche(ines, "age", ""), steps: 0 },
  { name: "resizeCard", run: ({ ines }) => state().resizeCard(ines, 40) },
  { name: "linkCards", run: ({ ines, s1 }) => state().linkCards(ines, s1, "") },
  { name: "linkCards déjà reliées", run: ({ ines, yann }) => state().linkCards(yann, ines, ""), steps: 0 },
  { name: "onConnect", run: ({ yann, s2 }) => state().onConnect({ source: yann, target: s2, sourceHandle: null, targetHandle: null }) },
  { name: "toggleLink (retire)", run: ({ ines, yann }) => state().toggleLink(ines, yann) },
  { name: "toggleLink (tire)", run: ({ ines, s3 }) => state().toggleLink(ines, s3) },
  { name: "renameLink", run: ({ link }) => state().renameLink(link, "déteste") },
  { name: "renameLink inchangé", run: ({ link }) => state().renameLink(link, "aime"), steps: 0 },
  { name: "setWireFiche", run: ({ link }) => state().setWireFiche(link, "enjeu", "Le phare") },
  { name: "removeLink", run: ({ link }) => state().removeLink(link) },
  { name: "deleteCard (corbeille)", run: ({ ines }) => state().deleteCard(ines) },
  { name: "deleteCards (Scène)", run: ({ s1, yann }) => state().deleteCards([s1, yann]) },
  { name: "restoreFromTrash", run: ({ trashed }) => state().restoreFromTrash(trashed) },
  { name: "purgeTrash", run: ({ trashed }) => state().purgeTrash(trashed) },
  { name: "addFrame", run: () => state().addFrame({ x: -3000, y: -3000 }) },
  { name: "updateFrame", run: ({ frame }) => state().updateFrame(frame, { title: "Le large" }) },
  { name: "toggleFrameLock", run: ({ frame }) => state().toggleFrameLock(frame) },
  { name: "deleteFrame", run: ({ frame }) => state().deleteFrame(frame) },
  { name: "organizeCanvas", run: () => state().organizeCanvas() },
  { name: "placeInPlan", run: ({ s3 }) => state().placeInPlan(s3, "a_setup", 0) },
  { name: "setPlanTemplate", run: () => state().setPlanTemplate("saveTheCat") },
  { name: "setPlanTemplate inchangé", run: () => state().setPlanTemplate("troisActes"), steps: 0 },
  { name: "startChapterAt", run: ({ s2 }) => state().startChapterAt(s2), only: "roman" },
  { name: "splitScene", run: ({ s1 }) => state().splitScene(s1, "<p>La suite.</p>"), only: "roman" },
  { name: "pasteCards", run: ({ ines, s1 }) => (state().copyCards([ines, s1]), state().pasteCards({ x: 5000, y: 5000 })) },
  { name: "duplicateCards", run: ({ s2, yann }) => state().duplicateCards([s2, yann]) },
  { name: "setCardSceneSynopsis", run: ({ s2 }) => state().setCardSceneSynopsis(s2, "Yann attend sur la côte."), only: "scenario" },
  { name: "addQuestionAbout", run: ({ ines, yann }) => state().addQuestionAbout("Que cache Inès ?", [ines, yann]) },
  { name: "Renommer partout (remplacement puis renommage)", run: ({ ines }) => state().replaceText({ find: "Inès", replacement: "Ines", renameId: ines, cards: true, matchCase: true, wholeWord: true }) },
  { name: "setScreenplay du séquencier sans changement", run: () => state().screenplay && state().setScreenplay(state().screenplay!, true), steps: 0, only: "scenario" },
  { name: "onNodesChange (déplacement)", run: ({ ines }) => state().onNodesChange([{ type: "position", id: ines, position: { x: 4000, y: 4000 }, dragging: false }]) },
  {
    name: "Suppr au clavier (fils puis carte)",
    run: ({ ines, link }) => {
      state().onEdgesChange([{ type: "remove", id: link }]);
      state().onNodesChange([{ type: "remove", id: ines }]);
    },
  },
];

for (const kind of ["roman", "scenario"] as const) {
  describe(`Une action, une étape (${kind})`, () => {
    let ids: Ids;
    beforeEach(async () => {
      clock = 1_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => clock);
      await newProject(kind);
      ids = fixture(kind);
      tick();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    for (const c of CASES.filter((c) => !c.only || c.only === kind)) {
      it(c.name, () => {
        const before = view(state());
        const past = state().past.length;
        c.run(ids);
        const steps = c.steps ?? 1;
        expect(state().past.length - past).toBe(steps);
        if (steps === 0) return;
        state().undo();
        expect(view(state())).toEqual(before);
      });
    }

    it("l'image d'une carte : une étape, prise après la copie dans medias/", async () => {
      const past = state().past.length;
      const before = view(state());
      const ok = await state().setCardImage(ids.ines, { name: "portrait.jpg", data: new Uint8Array([1, 2, 3]) });
      expect(ok).toBe(true);
      expect(state().past.length - past).toBe(1);
      state().undo();
      expect(view(state())).toEqual(before);
    });

    it("une carte image : une étape (carte et image ensemble)", async () => {
      const past = state().past.length;
      const before = view(state());
      const id = await state().addImageCard({ x: 6000, y: 0 }, { name: "mer.png", data: new Uint8Array([1, 2, 3]) });
      expect(id).toBeTruthy();
      expect(state().past.length - past).toBe(1);
      state().undo();
      expect(view(state())).toEqual(before);
      state().redo();
      expect(state().nodes.find((n) => n.id === id)?.data.image).toBeTruthy();
    });

    it("les lettres d'un même titre tapées d'affilée ne font qu'une étape", () => {
      const past = state().past.length;
      state().updateCard(ids.ines, { title: "Inès M" });
      state().updateCard(ids.ines, { title: "Inès Mo" });
      state().updateCard(ids.ines, { title: "Inès Mor" });
      expect(state().past.length - past).toBe(1);
    });
  });
}
