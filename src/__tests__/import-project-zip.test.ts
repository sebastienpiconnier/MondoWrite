// @vitest-environment happy-dom
// Mobile : un projet exporté en .zip (« Exporter une copie ») s'ouvre depuis Fichiers, avec ou sans dossier racine.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { useCosmos } from "../store";
import { META_FILE, cardPath, storage, type FileMap } from "../storage";

const state = () => useCosmos.getState();
const files: FileMap = {
  [META_FILE]: JSON.stringify({ version: 1, title: "Roman importé", layout: [{ id: "a", x: 10, y: 20 }], links: [] }),
  [cardPath("a")]: '---\nid: a\ntype: personnage\ntitle: "Inès Morvan"\n---\n',
};
const archive = (prefix: string) => zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [prefix + path, strToU8(text)])));

beforeEach(() => {
  localStorage.clear();
  useCosmos.setState({ screen: "home", loaded: false, openFailed: false, homeNotice: false, lastFiles: {}, screenplay: null, savedScreenplay: null, nodes: [], edges: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("importer un projet .zip", () => {
  it.each([["à la racine", ""], ["dans un dossier", "Mon roman/"]])("ouvre le projet (%s)", async (_label, prefix) => {
    vi.spyOn(storage, "pickFile").mockResolvedValueOnce({ name: "roman.zip", data: archive(prefix) });
    await state().importProjectZip();
    expect(state().openFailed).toBe(false);
    expect(state().homeNotice).toBe(false);
    expect(state().title).toBe("Roman importé");
    expect(state().nodes.length).toBe(1);
  });

  it("un zip qui n'est pas un projet prévient l'auteur", async () => {
    vi.spyOn(storage, "pickFile").mockResolvedValueOnce({ name: "autre.zip", data: zipSync({ "notes.txt": strToU8("bonjour") }) });
    await state().importProjectZip();
    expect(state().homeNotice).toBe(true);
    expect(state().screen).not.toBe("project");
  });

  it("annuler le choix ne change rien", async () => {
    vi.spyOn(storage, "pickFile").mockResolvedValueOnce(null);
    await state().importProjectZip();
    expect(state().homeNotice).toBe(false);
    expect(state().openFailed).toBe(false);
  });
});
