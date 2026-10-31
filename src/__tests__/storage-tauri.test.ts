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

import { tauriStorage } from "../storage/tauri";

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
    expect(fsPlugin.writeTextFile).toHaveBeenCalledWith("D:\\Projet\\cosmos.json", "{}");
    expect(fsPlugin.writeTextFile).toHaveBeenCalledWith("D:\\Projet\\cartes\\a.md", "texte");
    expect(fsPlugin.remove).toHaveBeenCalledWith("D:\\Projet\\cartes\\b.md");
  });

  it("une image va dans medias/ ; elle se relit, et un fichier absent ne casse rien", async () => {
    dialog.open.mockResolvedValue("D:\\Projet");
    await tauriStorage.pickFolder();
    await tauriStorage.writeMedia("abc.png", new Uint8Array([1, 2, 3]));
    expect(fsPlugin.mkdir).toHaveBeenCalledWith("D:\\Projet\\medias", { recursive: true });
    expect(fsPlugin.writeFile).toHaveBeenCalledWith("D:\\Projet\\medias\\abc.png", new Uint8Array([1, 2, 3]));

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
