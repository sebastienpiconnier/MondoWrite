// @vitest-environment happy-dom
// Modifications faites hors de l'app pendant que le projet est ouvert : jamais écrasées, reprises quand
// rien n'a changé ici, gardées des deux côtés en cas de conflit. Le « disque » est celui du stockage du
// navigateur (une clé localStorage par projet), qu'on modifie directement comme le ferait un autre logiciel.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { cardPath, conflictCopyPath, deserialize, isConflictCopy, META_FILE, type FileMap } from "../storage";
import { cardToFile } from "../storage/markdown";
import { conflictSubject, diffDisk } from "../conflicts";

const state = () => useCosmos.getState();
const card = (id: string) => state().nodes.find((n) => n.id === id)?.data;
const diskKey = () => Object.keys(localStorage).find((k) => k.startsWith("cosmos:projet:"))!;
const disk = (): FileMap => JSON.parse(localStorage.getItem(diskKey()) ?? "{}");
/** Un autre logiciel modifie le dossier du projet. */
const editDisk = (patch: Record<string, string | null>) => {
  const files = disk();
  for (const [p, c] of Object.entries(patch)) {
    if (c === null) delete files[p];
    else files[p] = c;
  }
  localStorage.setItem(diskKey(), JSON.stringify(files));
};
const retitled = (id: string, title: string, html = "<p>Écrit ailleurs.</p>") => cardToFile({ ...card(id)!, title, html });

beforeEach(async () => {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, conflicts: [], past: [], future: [] });
  await state().start();
  await state().createProject({ title: "Phare", kind: "roman" });
});
afterEach(() => useSettings.setState({ lang: "en" }));

/** Une carte enregistrée sur le disque. */
const savedCard = async (title = "Inès") => {
  const id = state().addCard({ x: 0, y: 0 }, "personnage");
  state().updateCard(id, { title });
  await state().save();
  expect(disk()[cardPath(id)]).toContain(title);
  return id;
};

describe("trois versions d'un fichier (fonction pure)", () => {
  it("repris, déjà écrit, en conflit, ou rien à faire", () => {
    const known = { a: "1", b: "1", c: "1", d: "1", e: "1" };
    const mine = { a: "1", b: "2", c: "2", d: "1" };
    const onDisk = { a: "3", b: "2", c: "3", d: "1", f: "nouveau" };
    expect(diffDisk(["a", "b", "c", "d", "e", "f"], known, mine, onDisk)).toEqual({
      adopt: { a: "3", f: "nouveau" },
      settled: { b: "2", e: null },
      conflicts: ["c"],
    });
  });

  it("nom de la copie, et de quoi parle un fichier", () => {
    expect(conflictCopyPath("cartes/k3x9a7bq2m.md")).toBe("cartes/k3x9a7bq2m (MondoWrite).md");
    expect(conflictCopyPath("cosmos.json")).toBe("cosmos (MondoWrite).json");
    expect(isConflictCopy("cartes/k3x9a7bq2m (MondoWrite).md")).toBe(true);
    expect(isConflictCopy("cartes/k3x9a7bq2m.md")).toBe(false);
    expect(conflictSubject("cartes/k3x9a7bq2m.md")).toEqual({ kind: "card", id: "k3x9a7bq2m" });
    expect(conflictSubject("manuscrit/k3x9a7bq2m.md")).toEqual({ kind: "manuscript", id: "k3x9a7bq2m" });
    expect(conflictSubject("cosmos.json")).toEqual({ kind: "project" });
  });

  it("une copie de conflit n'est jamais relue comme une carte", async () => {
    const id = await savedCard();
    const files = { ...disk(), [conflictCopyPath(cardPath(id))]: retitled(id, "Doublon") };
    expect(deserialize(files)!.cards.filter((c) => c.id === id)).toHaveLength(1);
  });
});

describe("modifié ailleurs, rien changé ici", () => {
  it("la version du disque est reprise, sans conflit ni écriture", async () => {
    const id = await savedCard();
    editDisk({ [cardPath(id)]: retitled(id, "Inès Morvan") });
    await state().syncFromDisk();
    expect(card(id)).toMatchObject({ title: "Inès Morvan" });
    expect(state().conflicts).toEqual([]);
    expect(state().status).toBe("enregistre");
  });

  it("une carte ajoutée ailleurs apparaît, une carte supprimée ailleurs disparaît", async () => {
    const id = await savedCard();
    const other = cardToFile({ id: "p4t8w2zq1c", type: "lieu", title: "Le phare", html: "" });
    editDisk({ [cardPath("p4t8w2zq1c")]: other, [cardPath(id)]: null });
    await state().syncFromDisk();
    expect(card("p4t8w2zq1c")).toMatchObject({ type: "lieu", title: "Le phare" });
    expect(card(id)).toBeUndefined();
  });
});

describe("modifié des deux côtés", () => {
  it("rien n'est écrasé : le disque garde sa version, celle de l'app est à côté", async () => {
    const id = await savedCard();
    const theirs = retitled(id, "Inès (Obsidian)");
    editDisk({ [cardPath(id)]: theirs });
    state().updateCard(id, { title: "Inès (MondoWrite)" });
    await state().save();
    expect(disk()[cardPath(id)]).toBe(theirs);
    expect(disk()[conflictCopyPath(cardPath(id))]).toContain("Inès (MondoWrite)");
    expect(state().conflicts).toEqual([expect.objectContaining({ path: cardPath(id), copy: conflictCopyPath(cardPath(id)) })]);
    expect(state().status).toBe("enregistre");

    // L'auteur continue d'écrire : la copie suit, le fichier du disque reste intact.
    state().updateCard(id, { title: "Inès, gardienne" });
    await state().save();
    expect(disk()[cardPath(id)]).toBe(theirs);
    expect(disk()[conflictCopyPath(cardPath(id))]).toContain("Inès, gardienne");
  });

  it("« Garder ma version » : elle remplace celle du disque, la copie disparaît", async () => {
    const id = await savedCard();
    editDisk({ [cardPath(id)]: retitled(id, "Inès (Obsidian)") });
    state().updateCard(id, { title: "Inès (MondoWrite)" });
    await state().save();
    await state().resolveConflict(cardPath(id), "mine");
    expect(disk()[cardPath(id)]).toContain("Inès (MondoWrite)");
    expect(disk()).not.toHaveProperty(conflictCopyPath(cardPath(id)));
    expect(state().conflicts).toEqual([]);
    // Plus de conflit : la suite s'enregistre normalement.
    state().updateCard(id, { title: "Inès 2" });
    await state().save();
    expect(disk()[cardPath(id)]).toContain("Inès 2");
  });

  it("« Garder celle du disque » : elle revient dans l'app, la copie disparaît", async () => {
    const id = await savedCard();
    editDisk({ [cardPath(id)]: retitled(id, "Inès (Obsidian)") });
    state().updateCard(id, { title: "Inès (MondoWrite)" });
    await state().save();
    await state().resolveConflict(cardPath(id), "disk");
    expect(card(id)).toMatchObject({ title: "Inès (Obsidian)" });
    expect(disk()).not.toHaveProperty(conflictCopyPath(cardPath(id)));
    expect(state().conflicts).toEqual([]);
  });

  it("la relecture du dossier signale le conflit sans attendre l'enregistrement", async () => {
    const id = await savedCard();
    editDisk({ [cardPath(id)]: retitled(id, "Inès (Obsidian)") });
    state().updateCard(id, { title: "Inès (MondoWrite)" });
    await state().syncFromDisk();
    expect(state().conflicts.map((c) => c.path)).toEqual([cardPath(id)]);
    expect(disk()[conflictCopyPath(cardPath(id))]).toContain("Inès (MondoWrite)");
  });

  it("supprimée ici, modifiée ailleurs : le fichier reste sur le disque", async () => {
    const id = await savedCard();
    const theirs = retitled(id, "Inès (Obsidian)");
    editDisk({ [cardPath(id)]: theirs });
    state().deleteCard(id);
    await state().save();
    expect(disk()[cardPath(id)]).toBe(theirs);
    expect(state().conflicts).toEqual([expect.objectContaining({ path: cardPath(id), copy: null })]);
    await state().resolveConflict(cardPath(id), "disk");
    expect(card(id)).toMatchObject({ title: "Inès (Obsidian)" });
  });

  it("les autres fichiers s'enregistrent normalement pendant un conflit", async () => {
    const id = await savedCard();
    editDisk({ [cardPath(id)]: retitled(id, "Inès (Obsidian)") });
    state().updateCard(id, { title: "Inès (MondoWrite)" });
    const other = state().addCard({ x: 600, y: 0 }, "lieu");
    state().updateCard(other, { title: "Le phare" });
    await state().save();
    expect(disk()[cardPath(other)]).toContain("Le phare");
    expect(JSON.parse(disk()[META_FILE]).layout.some((l: { id: string }) => l.id === other)).toBe(true);
  });
});
