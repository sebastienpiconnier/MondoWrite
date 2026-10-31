// @vitest-environment happy-dom
// Stockage Tauri, plugins simulés : ce que l'app demande au système quand l'auteur choisit un dossier.

import { beforeEach, describe, expect, it, vi } from "vitest";

const dialog = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
const fsPlugin = vi.hoisted(() => ({
  exists: vi.fn(async () => true),
  mkdir: vi.fn(async () => {}),
  readDir: vi.fn(async () => []),
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  readTextFile: vi.fn(async () => "{}"),
  remove: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  writeTextFile: vi.fn(async () => {}),
  watch: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/plugin-dialog", () => dialog);
vi.mock("@tauri-apps/plugin-fs", () => fsPlugin);
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: async () => "C:\\Users\\moi\\AppData\\Roaming\\cosmos",
  join: async (...parts: string[]) => parts.join("\\"),
}));

import { tauriStorage, writeSafely } from "../storage/tauri";
import { isProjectFilePath, tempPath } from "../storage/paths";
import { classifySaveError } from "../saveErrors";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("choisir le dossier d'un projet", () => {
  it("le dossier est demandé avec ses sous-dossiers (sinon l'écriture de cartes/ est refusée)", async () => {
    dialog.open.mockResolvedValue("D:\\Écriture\\Projet Cosmos");
    expect(await tauriStorage.pickFolder()).toBe(true);
    expect(dialog.open).toHaveBeenCalledWith(expect.objectContaining({ directory: true, recursive: true }));
    expect(tauriStorage.location()).toBe("Projet Cosmos");
  });

  it("créer un projet passe par le même dialogue ; annuler ne sélectionne rien", async () => {
    dialog.open.mockResolvedValue(null);
    tauriStorage.forget();
    expect(await tauriStorage.create()).toBe(false);
    expect(dialog.open).toHaveBeenCalledWith(expect.objectContaining({ recursive: true }));
    expect(tauriStorage.location()).toBeNull();
  });
});

describe("écrire un projet", () => {
  it("les cartes vont dans le sous-dossier cartes/ du dossier choisi", async () => {
    dialog.open.mockResolvedValue("D:\\Projet");
    await tauriStorage.pickFolder();
    await tauriStorage.write({ "cosmos.json": "{}", "cartes/a.md": "texte" }, ["cartes/b.md"]);
    expect(fsPlugin.mkdir).toHaveBeenCalledWith("D:\\Projet\\cartes", { recursive: true });
    // Écriture sûre : le temporaire d'abord, puis le renommage sur le nom final.
    expect(fsPlugin.writeTextFile).toHaveBeenCalledWith("D:\\Projet\\cosmos.json.mondowrite-tmp", "{}");
    expect(fsPlugin.writeTextFile).toHaveBeenCalledWith("D:\\Projet\\cartes\\a.md.mondowrite-tmp", "texte");
    expect(fsPlugin.rename).toHaveBeenCalledWith("D:\\Projet\\cosmos.json.mondowrite-tmp", "D:\\Projet\\cosmos.json");
    expect(fsPlugin.rename).toHaveBeenCalledWith("D:\\Projet\\cartes\\a.md.mondowrite-tmp", "D:\\Projet\\cartes\\a.md");
    expect(fsPlugin.writeTextFile).not.toHaveBeenCalledWith("D:\\Projet\\cartes\\a.md", "texte");
    expect(fsPlugin.remove).toHaveBeenCalledWith("D:\\Projet\\cartes\\b.md");
  });

  it("une image va dans medias/ ; elle se relit, et un fichier absent ne casse rien", async () => {
    dialog.open.mockResolvedValue("D:\\Projet");
    await tauriStorage.pickFolder();
    await tauriStorage.writeMedia("abc.png", new Uint8Array([1, 2, 3]));
    expect(fsPlugin.mkdir).toHaveBeenCalledWith("D:\\Projet\\medias", { recursive: true });
    expect(fsPlugin.writeFile).toHaveBeenCalledWith("D:\\Projet\\medias\\abc.png.mondowrite-tmp", new Uint8Array([1, 2, 3]));
    expect(fsPlugin.rename).toHaveBeenCalledWith("D:\\Projet\\medias\\abc.png.mondowrite-tmp", "D:\\Projet\\medias\\abc.png");

    expect(await tauriStorage.mediaUrl("abc.png")).toMatch(/^blob:/);
    expect(fsPlugin.readFile).toHaveBeenCalledWith("D:\\Projet\\medias\\abc.png");
    fsPlugin.exists.mockResolvedValueOnce(false);
    expect(await tauriStorage.mediaUrl("absent.png")).toBeNull();
  });

  it("choisir une image : seulement les formats d'image", async () => {
    dialog.open.mockResolvedValue("C:\\Photos\\phare.JPG");
    expect(await tauriStorage.pickImage("Images")).toEqual({ name: "phare.JPG", data: new Uint8Array([1, 2, 3]) });
    expect(dialog.open).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] }),
    );
  });

  it("l'ancien dossier mémorisé rejoint la liste des projets", async () => {
    localStorage.setItem("cosmos:dernier-dossier", "D:\\Utilisateurs\\moi\\OneDrive\\Projet Cosmos");
    expect(await tauriStorage.list()).toEqual([
      { id: "D:\\Utilisateurs\\moi\\OneDrive\\Projet Cosmos", name: "Projet Cosmos", openedAt: 0 },
    ]);
    expect(localStorage.getItem("cosmos:dernier-dossier")).toBeNull();
  });
});

describe("modifications faites hors de l'app", () => {
  it("une copie de conflit n'est pas relue avec les cartes ; readFiles ne lit que ce qui existe", async () => {
    dialog.open.mockResolvedValue("D:\\Écriture\\Phare");
    await tauriStorage.pickFolder();
    fsPlugin.readDir.mockImplementation((async (dir: string) =>
      dir.endsWith("cartes") ? [{ name: "a.md", isFile: true }, { name: "a (MondoWrite).md", isFile: true }] : []) as never);
    fsPlugin.readTextFile.mockImplementation((async (path: string) => (path.endsWith("cosmos.json") ? "{}" : `contenu de ${path}`)) as never);
    const files = await tauriStorage.readAll();
    expect(Object.keys(files!).sort()).toEqual(["cartes/a.md", "cosmos.json", "scenario.fountain"].sort());
    fsPlugin.exists.mockImplementation((async (path: string) => !path.endsWith("absent.md")) as never);
    expect(await tauriStorage.readFiles!(["cartes/a.md", "cartes/absent.md"])).toEqual({ "cartes/a.md": "contenu de D:\\Écriture\\Phare\\cartes\\a.md" });
    fsPlugin.readDir.mockReset();
    fsPlugin.readTextFile.mockReset();
    fsPlugin.exists.mockReset();
    fsPlugin.exists.mockImplementation(async () => true);
  });

  it("un roman s'ouvre : jamais de chemin caché demandé au système, qui le refuse (régression de la 1.7.2)", async () => {
    dialog.open.mockResolvedValue("D:\\Romans\\Phare");
    await tauriStorage.pickFolder();
    // Comme le plugin fs : un élément de chemin qui commence par un point est refusé (requireLiteralLeadingDot).
    const hidden = (path: string) => path.split(/[\\/]/).some((part) => part.startsWith("."));
    fsPlugin.exists.mockImplementation((async (path: string) => {
      if (hidden(path)) throw new Error(`forbidden path: ${path}`);
      return !path.endsWith("scenario.fountain") && !path.endsWith("absent.md") && !path.endsWith("b.md");
    }) as never);
    fsPlugin.readDir.mockImplementation((async (dir: string) =>
      dir.endsWith("cartes") ? [{ name: "a.md", isFile: true }, { name: ".b.md.icloud", isFile: true }] : dir.endsWith("Phare") ? [{ name: ".scenario.fountain.icloud", isFile: true }] : []) as never);
    fsPlugin.readTextFile.mockImplementation((async (path: string) => (path.endsWith("cosmos.json") ? "{}" : "texte")) as never);
    const files = await tauriStorage.readAll();
    expect(Object.keys(files!).sort()).toEqual(["cartes/a.md", "cosmos.json"]);
    expect(tauriStorage.pending!().sort()).toEqual(["cartes/b.md", "scenario.fountain"]);
    expect(await tauriStorage.readFiles!(["cartes/absent.md", "cartes/b.md"])).toEqual({});
    expect(tauriStorage.pending!()).toContain("cartes/b.md");
    fsPlugin.readDir.mockReset();
    fsPlugin.readDir.mockImplementation(async () => []);
    fsPlugin.readTextFile.mockReset();
    fsPlugin.exists.mockReset();
    fsPlugin.exists.mockImplementation(async () => true);
  });

  it("le dossier est surveillé, sans réagir aux copies markdown/ ni aux images", async () => {
    dialog.open.mockResolvedValue("D:\\Écriture\\Phare");
    await tauriStorage.pickFolder();
    const onChange = vi.fn();
    await tauriStorage.watch!(onChange);
    expect(fsPlugin.watch).toHaveBeenCalledWith("D:\\Écriture\\Phare", expect.any(Function), expect.objectContaining({ recursive: true }));
    const handler = (fsPlugin.watch.mock.calls[0] as unknown as [string, (e: { paths: string[] }) => void])[1];
    handler({ paths: ["D:\\Écriture\\Phare\\markdown\\bible.md"] });
    handler({ paths: ["D:\\Écriture\\Phare\\medias\\a.jpg"] });
    expect(onChange).not.toHaveBeenCalled();
    handler({ paths: ["D:\\Écriture\\Phare\\cartes\\a.md"] });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("écriture sûre (temporaire puis renommage)", () => {
  const order = () =>
    [...fsPlugin.writeTextFile.mock.calls.map((c, i) => ({ what: `écrit ${(c as unknown[])[0]}`, at: fsPlugin.writeTextFile.mock.invocationCallOrder[i] })),
      ...fsPlugin.rename.mock.calls.map((c, i) => ({ what: `renomme ${(c as unknown[])[0]} -> ${(c as unknown[])[1]}`, at: fsPlugin.rename.mock.invocationCallOrder[i] }))]
      .sort((a, b) => a.at - b.at)
      .map((e) => e.what);

  it("le temporaire est écrit avant le renommage, et son nom ne commence jamais par un point", async () => {
    dialog.open.mockResolvedValue("D:\\Projet");
    await tauriStorage.pickFolder();
    await tauriStorage.write({ "cartes/k3x9.md": "texte" }, []);
    expect(order()).toEqual(["écrit D:\\Projet\\cartes\\k3x9.md.mondowrite-tmp", "renomme D:\\Projet\\cartes\\k3x9.md.mondowrite-tmp -> D:\\Projet\\cartes\\k3x9.md"]);
    for (const [path] of fsPlugin.writeTextFile.mock.calls as unknown as [string][]) {
      expect(path.split(/[\\/]/).some((part) => part.startsWith("."))).toBe(false);
    }
    expect(tempPath("cosmos.json")).toBe("cosmos.json.mondowrite-tmp");
  });

  it("renommage refusé : repli en écriture directe, et le temporaire est retiré", async () => {
    dialog.open.mockResolvedValue("D:\\Projet");
    await tauriStorage.pickFolder();
    fsPlugin.rename.mockRejectedValueOnce(new Error("failed to rename: Access is denied. (os error 5)"));
    await tauriStorage.write({ "cartes/a.md": "texte" }, []);
    expect(fsPlugin.writeTextFile).toHaveBeenLastCalledWith("D:\\Projet\\cartes\\a.md", "texte");
    expect(fsPlugin.remove).toHaveBeenCalledWith("D:\\Projet\\cartes\\a.md.mondowrite-tmp");
  });

  it("renommage et repli refusés : l'erreur d'origine remonte, pour classifySaveError", async () => {
    dialog.open.mockResolvedValue("D:\\Projet");
    await tauriStorage.pickFolder();
    const original = new Error("failed to rename: Access is denied. (os error 5)");
    fsPlugin.rename.mockRejectedValueOnce(original);
    fsPlugin.writeTextFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("autre chose"));
    await expect(tauriStorage.write({ "cartes/a.md": "texte" }, [])).rejects.toBe(original);
    expect(classifySaveError(original)).toBe("permission");
  });

  it("disque plein pendant le temporaire : pas d'écriture directe (elle tronquerait le vrai fichier)", async () => {
    const full = new Error("No space left on device (os error 28)");
    const write = vi.fn(async (target: string) => {
      if (target.endsWith(".mondowrite-tmp")) throw full;
    });
    await expect(writeSafely("D:\\Projet\\cosmos.json", write)).rejects.toBe(full);
    expect(write).toHaveBeenCalledTimes(1);
    expect(fsPlugin.rename).not.toHaveBeenCalled();
    expect(fsPlugin.remove).toHaveBeenCalledWith("D:\\Projet\\cosmos.json.mondowrite-tmp");
  });

  it("autre échec du temporaire : écriture directe comme avant", async () => {
    const write = vi.fn(async (target: string) => {
      if (target.endsWith(".mondowrite-tmp")) throw new Error("bizarre");
    });
    await writeSafely("D:\\Projet\\cosmos.json", write);
    expect(write).toHaveBeenLastCalledWith("D:\\Projet\\cosmos.json");
  });

  it("un temporaire laissé par une coupure n'est jamais relu comme carte, ni effacé (un autre appareil peut être en train de l'écrire)", async () => {
    dialog.open.mockResolvedValue("D:\\Écriture\\Phare");
    await tauriStorage.pickFolder();
    fsPlugin.readDir.mockImplementation((async (dir: string) =>
      dir.endsWith("cartes")
        ? [{ name: "a.md", isFile: true }, { name: "b.md.mondowrite-tmp", isFile: true }]
        : dir.endsWith("Phare")
        ? [{ name: "cosmos.json.mondowrite-tmp", isFile: true }, { name: "cartes", isFile: false, isDirectory: true }]
        : []) as never);
    fsPlugin.readTextFile.mockImplementation((async (path: string) => (path.endsWith("cosmos.json") ? "{}" : "texte")) as never);
    fsPlugin.exists.mockImplementation((async (path: string) => !path.endsWith("scenario.fountain")) as never);
    const files = await tauriStorage.readAll();
    expect(Object.keys(files!).sort()).toEqual(["cartes/a.md", "cosmos.json"]);
    expect(fsPlugin.readTextFile).not.toHaveBeenCalledWith(expect.stringContaining("mondowrite-tmp"));
    expect(fsPlugin.remove).not.toHaveBeenCalledWith("D:\\Écriture\\Phare\\cartes\\b.md.mondowrite-tmp");
    expect(isProjectFilePath("cartes/b.md.mondowrite-tmp")).toBe(false);
    fsPlugin.readDir.mockReset();
    fsPlugin.readDir.mockImplementation(async () => []);
    fsPlugin.readTextFile.mockReset();
    fsPlugin.exists.mockReset();
    fsPlugin.exists.mockImplementation(async () => true);
  });

  it("supprimer un projet emporte aussi ses temporaires (rien ne reste dans le dossier)", async () => {
    fsPlugin.readDir
      .mockResolvedValueOnce([{ name: "cosmos.json", isFile: true }, { name: "cosmos.json.mondowrite-tmp", isFile: true }, { name: "scenario.fountain.mondowrite-tmp", isFile: true }, { name: "notes perso.txt", isFile: true }] as never)
      .mockResolvedValueOnce([{ name: "notes perso.txt", isFile: true }] as never);
    await tauriStorage.deleteProject!("D:\\Projet");
    expect(fsPlugin.remove).toHaveBeenCalledWith("D:\\Projet\\cosmos.json.mondowrite-tmp", undefined);
    expect(fsPlugin.remove).toHaveBeenCalledWith("D:\\Projet\\scenario.fountain.mondowrite-tmp", undefined);
    expect(fsPlugin.remove).not.toHaveBeenCalledWith("D:\\Projet\\notes perso.txt", undefined);
  });

  it("la surveillance ignore les temporaires", async () => {
    dialog.open.mockResolvedValue("D:\\Écriture\\Phare");
    await tauriStorage.pickFolder();
    const onChange = vi.fn();
    await tauriStorage.watch!(onChange);
    const handler = (fsPlugin.watch.mock.calls[0] as unknown as [string, (e: { paths: string[] }) => void])[1];
    handler({ paths: ["D:\\Écriture\\Phare\\cartes\\a.md.mondowrite-tmp"] });
    expect(onChange).not.toHaveBeenCalled();
    handler({ paths: ["D:\\Écriture\\Phare\\cartes\\a.md.mondowrite-tmp", "D:\\Écriture\\Phare\\cartes\\a.md"] });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
