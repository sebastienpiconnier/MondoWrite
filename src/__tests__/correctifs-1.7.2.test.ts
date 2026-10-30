// @vitest-environment happy-dom
// Correctifs de la 1.7.2 (enregistrement et iCloud), relevés par l'audit d'octobre 2026 : un test par bug.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";

const state = () => useCosmos.getState();

async function newProject(kind: "roman" | "scenario" = "roman") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
  await state().start();
  await state().createProject({ title: "Kerlaouen", kind });
}

describe("M1 : enregistrements qui se chevauchent", () => {
  const realWrite = storage.write;
  afterEach(() => {
    storage.write = realWrite;
  });
  beforeEach(() => newProject());

  it("un seul enregistrement écrit à la fois, la frappe faite pendant est enregistrée ensuite, sans faux conflit", async () => {
    let running = 0;
    let most = 0;
    storage.write = async (changed, removed) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 20));
      await realWrite.call(storage, changed, removed);
      running--;
    };
    const id = state().addCard({ x: 0, y: 0 });
    state().updateCard(id, { title: "v1" });
    const first = state().save();
    // L'auteur continue d'écrire pendant l'écriture, puis Cmd+S et la sauvegarde auto partent ensemble.
    state().updateCard(id, { title: "v2" });
    const second = state().save();
    const third = state().save();
    await Promise.all([first, second, third]);
    expect(most).toBe(1);
    expect(state().conflicts).toEqual([]);
    expect(state().status).toBe("enregistre");
    const files = await storage.readAll();
    expect(Object.entries(files ?? {}).some(([path, text]) => path.startsWith("cartes/") && text.includes('"v2"'))).toBe(true);
  });
});

describe("M3 : fichiers iCloud pas encore téléchargés (repères « .nom.icloud »)", () => {
  const real = { readAll: storage.readAll, readFiles: storage.readFiles, write: storage.write, pending: storage.pending };
  afterEach(() => Object.assign(storage, real));
  beforeEach(() => newProject());

  it("un fichier retiré de l'appareil par iCloud ne fait pas disparaître sa carte, et n'est ni réécrit ni effacé", async () => {
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 400, y: 0 });
    state().updateCard(a, { title: "Inès" });
    state().updateCard(b, { title: "Le phare" });
    await state().save();
    const evicted = `cartes/${b}.md`;
    // iCloud remplace le fichier par son repère : la lecture ne le voit plus.
    storage.pending = () => [evicted];
    storage.readAll = async () => {
      const files = await real.readAll.call(storage);
      if (files) delete files[evicted];
      return files;
    };
    storage.readFiles = async (paths) => {
      const files = await real.readFiles!.call(storage, paths);
      delete files[evicted];
      return files;
    };
    await state().syncFromDisk();
    expect(state().nodes.map((n) => n.id)).toContain(b);

    const removedPaths: string[] = [];
    const written: string[] = [];
    storage.write = async (changed, removed) => {
      removedPaths.push(...removed);
      written.push(...Object.keys(changed));
      await real.write.call(storage, changed, removed);
    };
    state().updateCard(a, { title: "Inès Morvan" });
    state().updateCard(b, { title: "Le phare de Kerlaouen" });
    await state().save();
    expect(removedPaths).not.toContain(evicted);
    expect(written).not.toContain(evicted);
    expect(written).toContain(`cartes/${a}.md`);
    // Pas écrit : le projet reste « modifié » tant que le fichier n'est pas arrivé.
    expect(state().status).toBe("modifie");

    // Le fichier redescend d'iCloud avec son ancien texte : ce que l'auteur a écrit entre-temps l'emporte et s'écrit.
    Object.assign(storage, { readAll: real.readAll, readFiles: real.readFiles, pending: () => [] });
    await state().syncFromDisk();
    expect(state().nodes.find((n) => n.id === b)!.data.title).toBe("Le phare de Kerlaouen");
    expect(written).toContain(evicted);
    const files = await storage.readAll();
    expect(files?.[evicted]).toContain("Le phare de Kerlaouen");
    expect(state().status).toBe("enregistre");
  });

  it("une carte qui attend son fichier garde sa place et son rang dans le plan dans cosmos.json", async () => {
    const { toProject } = await import("../projectState");
    const s1 = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(s1, { title: "Ouverture" });
    state().placeInPlan(s1, "libre");
    const slice = { ...state(), plan: { ...state().plan, beats: { libre: [s1, "absente"] } }, awaitingLayout: [{ id: "absente", x: 300, y: 40 }] };
    const meta = toProject(slice).meta;
    expect(meta.layout.find((l) => l.id === "absente")).toEqual({ id: "absente", x: 300, y: 40 });
    expect((meta as { plan?: { beats: Record<string, string[]> } }).plan?.beats.libre).toEqual([s1, "absente"]);
    // Sans attente, la carte absente sort du plan comme avant.
    const pruned = toProject({ ...slice, awaitingLayout: [] }).meta as { plan?: { beats: Record<string, string[]> } };
    expect(pruned.plan?.beats.libre ?? []).not.toContain("absente");
  });
});

describe("M5 : fermeture", () => {
  beforeEach(() => newProject());

  it("ce qui n'est pas encore enregistré l'est avant de fermer (fenêtre, Cmd+Q, arrière-plan)", async () => {
    const { flushProject } = await import("../closing");
    const id = state().addCard({ x: 0, y: 0 });
    state().updateCard(id, { title: "Dernière phrase avant Cmd+Q" });
    expect(state().status).toBe("modifie");
    await flushProject();
    expect(state().status).toBe("enregistre");
    const files = await storage.readAll();
    expect(Object.values(files ?? {}).some((text) => text.includes("Dernière phrase avant Cmd+Q"))).toBe(true);
  });
});

describe("M6 : deux fichiers de carte avec le même identifiant", () => {
  it("le fichier qui porte le nom de l'identifiant le garde, la copie reçoit un identifiant à elle, le même à chaque lecture", async () => {
    const { deserialize } = await import("../storage");
    const card = (title: string) => `---\nid: abc123\ntype: idee\ntitle: "${title}"\n---\nTexte de ${title}\n`;
    const files = {
      "cosmos.json": JSON.stringify({ version: 1, title: "T", layout: [], links: [] }),
      "cartes/abc123 copie.md": card("Variante"),
      "cartes/abc123.md": card("Originale"),
    };
    const first = deserialize(files)!.cards;
    const again = deserialize(files)!.cards;
    expect(first.map((c) => c.title).sort()).toEqual(["Originale", "Variante"]);
    expect(first.find((c) => c.title === "Originale")!.id).toBe("abc123");
    const variant = first.find((c) => c.title === "Variante")!.id;
    expect(variant).not.toBe("abc123");
    expect(again.find((c) => c.title === "Variante")!.id).toBe(variant);
  });
});
