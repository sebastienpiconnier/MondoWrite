// @vitest-environment happy-dom
// Enregistrement en échec : la cause est reconnue (disque plein, droits, dossier introuvable), le message
// et les actions suivent ; « Exporter une copie » sauve tout le projet dans un .zip.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { META_FILE, storage } from "../storage";
import { classifySaveError, MISSING_FOLDER } from "../saveErrors";

const state = () => useCosmos.getState();

beforeEach(async () => {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, conflicts: [], saveError: null, past: [], future: [] });
  await state().start();
  await state().createProject({ title: "Le Phare", kind: "roman" });
});
afterEach(() => {
  vi.restoreAllMocks();
  useSettings.setState({ lang: "en" });
});

describe("la cause d'un échec", () => {
  it("messages du système (macOS, Linux, Windows) et du navigateur", () => {
    expect(classifySaveError("failed to write file: No space left on device (os error 28)")).toBe("full");
    expect(classifySaveError("There is not enough space on the disk. (os error 112)")).toBe("full");
    expect(classifySaveError(new DOMException("quota", "QuotaExceededError"))).toBe("full");
    expect(classifySaveError("Permission denied (os error 13)")).toBe("permission");
    expect(classifySaveError("Access is denied. (os error 5)")).toBe("permission");
    expect(classifySaveError("forbidden path: D:\\Projet\\cartes\\a.md")).toBe("permission");
    expect(classifySaveError(new Error(MISSING_FOLDER))).toBe("missing");
    expect(classifySaveError("The system cannot find the path specified. (os error 3)")).toBe("missing");
    expect(classifySaveError("No such file or directory (os error 2)")).toBe("missing");
    expect(classifySaveError(new Error("boum"))).toBe("other");
  });
});

describe("dans le projet", () => {
  it("l'échec est classé, puis effacé par un enregistrement réussi", async () => {
    const spy = vi.spyOn(storage, "write").mockRejectedValueOnce(new Error("No space left on device (os error 28)"));
    state().addCard({ x: 0, y: 0 });
    await state().save();
    expect(state()).toMatchObject({ status: "erreur", saveError: "full" });
    await state().save();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(state()).toMatchObject({ status: "enregistre", saveError: null });
  });

  it("« Exporter une copie » : un .zip avec tous les fichiers du projet", async () => {
    const id = state().addCard({ x: 0, y: 0 });
    state().updateCard(id, { title: "Inès" });
    const saveAs = vi.spyOn(storage, "saveAs").mockResolvedValue(true);
    expect(await state().exportProjectCopy()).toBe(true);
    const [file] = saveAs.mock.calls[0];
    expect(file).toMatchObject({ name: "Le Phare.zip", extension: "zip", mime: "application/zip" });
    const text = new TextDecoder().decode(file.data);
    expect(text).toContain(META_FILE);
    expect(text).toContain(`cartes/${id}.md`);
    expect(text).toContain("Inès");
  });

  it("« Indiquer le dossier » : un dossier vide reçoit tout le projet", async () => {
    const id = state().addCard({ x: 0, y: 0 });
    await state().save();
    vi.spyOn(storage, "pickFolder").mockResolvedValue(true);
    // Le nouveau dossier est vide : rien à lire, rien à protéger.
    vi.spyOn(storage, "readAll").mockResolvedValue(null);
    vi.spyOn(storage, "readFiles").mockResolvedValue({});
    const write = vi.spyOn(storage, "write");
    await state().relocateProject();
    expect(Object.keys(write.mock.calls[0][0])).toEqual(expect.arrayContaining([META_FILE, `cartes/${id}.md`]));
    expect(state().status).toBe("enregistre");
  });
});
