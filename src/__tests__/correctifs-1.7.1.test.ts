// @vitest-environment happy-dom
// Correctifs de la 1.7.1, relevés par l'audit d'octobre 2026 : un test par bug.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";

const state = () => useCosmos.getState();

async function newProject(kind: "roman" | "scenario") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
  await state().start();
  await state().createProject({ title: "Kerlaouen", kind });
}

describe("C1 : changer le type d'une Scène de roman puis annuler", () => {
  beforeEach(() => newProject("roman"));

  it("rend son texte au manuscrit, et rétablir le remet dans les notes", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "Le phare" });
    state().setManuscriptText(id, "<p>Inès monte les marches du phare.</p>");

    state().updateCard(id, { type: "idee" });
    expect(state().manuscript[id]).toBeUndefined();
    expect(state().nodes.find((n) => n.id === id)!.data.html).toContain("Inès monte les marches");

    state().undo();
    expect(state().nodes.find((n) => n.id === id)!.data.type).toBe("scene");
    expect(state().manuscript[id]).toBe("<p>Inès monte les marches du phare.</p>");

    state().redo();
    expect(state().nodes.find((n) => n.id === id)!.data.type).toBe("idee");
    expect(state().manuscript[id]).toBeUndefined();
  });

  it("une annulation sur le canevas ne touche pas au texte qu'on vient d'écrire dans le manuscrit", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "Le phare" });
    const other = state().addCard({ x: 400, y: 0 });
    state().setManuscriptText(id, "<p>Premier jet.</p>");
    state().updateCard(other, { title: "Une idée" });
    state().setManuscriptText(id, "<p>Premier jet, repris.</p>");

    state().undo();
    expect(state().manuscript[id]).toBe("<p>Premier jet, repris.</p>");
  });
});

describe("M8 : Suppr au clavier (fils retirés avant les cartes, comme React Flow le fait)", () => {
  beforeEach(() => newProject("roman"));

  it("la corbeille garde les fils, et une seule annulation ramène carte et fils", () => {
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 400, y: 0 });
    state().updateCard(a, { title: "Inès" });
    state().updateCard(b, { title: "Le phare" });
    state().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    const wire = state().edges[0].id;

    state().onEdgesChange([{ type: "remove", id: wire }]);
    state().onNodesChange([{ type: "remove", id: a }]);
    expect(state().nodes.map((n) => n.id)).toEqual([b]);
    expect(state().edges).toEqual([]);
    expect(state().trash[0].trashed.links.length).toBe(1);

    state().undo();
    expect(state().nodes.map((n) => n.id).sort()).toEqual([a, b].sort());
    expect(state().edges.map((e) => e.id)).toEqual([wire]);
  });

  it("remise depuis la corbeille, la carte retrouve son fil", () => {
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 400, y: 0 });
    state().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    state().onEdgesChange([{ type: "remove", id: state().edges[0].id }]);
    state().onNodesChange([{ type: "remove", id: a }]);
    state().restoreFromTrash(a);
    expect(state().edges.some((e) => e.source === a && e.target === b)).toBe(true);
  });
});

describe("M9 : tirer un fil", () => {
  beforeEach(() => newProject("roman"));

  it("pas de fil d'une carte vers elle-même, ni de second fil en sens inverse", () => {
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 400, y: 0 });
    const past = state().past.length;
    state().onConnect({ source: a, target: a, sourceHandle: null, targetHandle: null });
    expect(state().edges).toEqual([]);
    expect(state().past.length).toBe(past);
    state().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    state().onConnect({ source: b, target: a, sourceHandle: null, targetHandle: null });
    expect(state().edges.length).toBe(1);
  });
});

describe("M7 : la fiche d'un fil part à la corbeille avec lui", () => {
  beforeEach(() => newProject("roman"));

  it("bouton × puis Remettre : le fil revient avec sa fiche", () => {
    const a = state().addCard({ x: 0, y: 0 }, "personnage");
    const b = state().addCard({ x: 400, y: 0 }, "personnage");
    state().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    const wire = state().edges[0].id;
    state().setWireFiche(wire, "enjeu", "Elle lui cache la lettre.");
    state().deleteCard(a);
    expect(state().trash[0].trashed.links[0].fiche).toEqual({ enjeu: "Elle lui cache la lettre." });
    state().restoreFromTrash(a);
    expect(state().edges.find((e) => e.id === wire)?.data?.fiche).toEqual({ enjeu: "Elle lui cache la lettre." });
  });

  it("la ligne corbeille: relue sur disque garde la fiche, et seulement ses champs connus", async () => {
    const { readTrashInfo } = await import("../trash");
    const info = readTrashInfo({ date: "2026-10-30", x: 0, y: 0, links: [{ id: "w1", other: "c2", out: true, label: "", fiche: { enjeu: "La lettre", pirate: "<script>" } }] });
    expect(info?.links[0].fiche).toEqual({ enjeu: "La lettre" });
  });
});

describe("M4 : une carte éditée à la main", () => {
  it("un titre « 1984 » ou « null » reste un texte, un identifiant qui serait un chemin est refusé", async () => {
    const { fileToCard } = await import("../storage/markdown");
    expect(fileToCard("---\nid: abc123\ntype: idee\ntitle: 1984\n---\n")?.title).toBe("1984");
    expect(fileToCard("---\nid: abc123\ntype: idee\ntitle: null\n---\n")?.title).toBe("null");
    expect(fileToCard('---\nid: abc123\ntype: idee\ntitle: "Inès"\n---\n')?.title).toBe("Inès");
    expect(fileToCard("---\nid: ../x\ntype: idee\ntitle: Piège\n---\n")).toBeNull();
  });
});

describe("M14 : cases à cocher imbriquées dans « À faire »", () => {
  it("chaque case est listée, et cocher la n-ième coche bien celle-là", async () => {
    const { tasksIn, toggleTask } = await import("../todos");
    const box = (checked: boolean, text: string, inner = "") =>
      `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"><span></span></label><div><p>${text}</p>${inner}</div></li>`;
    const html = `<ul data-type="taskList">${box(false, "A", `<ul data-type="taskList">${box(false, "B")}</ul>`)}${box(false, "C")}</ul>`;
    expect(tasksIn(html).map((t) => t.text)).toEqual(["A", "B", "C"]);
    const c = tasksIn(html).findIndex((t) => t.text === "C");
    expect(tasksIn(toggleTask(html, c)).map((t) => t.done)).toEqual([false, false, true]);
  });
});

describe("M15 : déplacer une scène dans le Plan change son chapitre si besoin", () => {
  it("glissée au milieu d'un autre chapitre, elle le rejoint ; son chapitre ne paraît pas deux fois", async () => {
    const { placeScene, stepScene, groupByChapter, planOrder } = await import("../plan");
    const plan = {
      template: "libre" as const,
      beats: { libre: ["s1", "s2", "s3", "s4"] },
      chapters: [
        { id: "A", title: "", scenes: ["s1", "s2"] },
        { id: "B", title: "", scenes: ["s3", "s4"] },
      ],
    };
    const ids = ["s1", "s2", "s3", "s4"];
    const moved = placeScene(plan as never, ids, "s2", "libre", 3);
    const order = planOrder(moved, ids);
    expect(order).toEqual(["s1", "s3", "s2", "s4"]);
    expect(groupByChapter(moved, order).map((g) => g.chapter?.id ?? null)).toEqual(["A", "B"]);

    // Un cran : à la frontière, la scène passe la voisine et prend son chapitre.
    const stepped = stepScene(plan as never, ids, "s3", "up");
    expect(planOrder(stepped, ids)).toEqual(["s1", "s3", "s2", "s4"]);
    expect(groupByChapter(stepped, planOrder(stepped, ids)).filter((g) => g.chapter?.id === "A").length).toBe(1);
  });
});
