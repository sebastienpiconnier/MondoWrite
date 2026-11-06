// @vitest-environment happy-dom
// Sauvegardes hors du projet (#14) et retour au projet d'un jour donné (#15).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { useCosmos } from "../store";
import { META_FILE, cardPath, storage, type BackupStore, type FileMap } from "../storage";
import {
  KEEP_LATEST,
  backupDate,
  backupDue,
  backupKey,
  backupName,
  backupsToRemove,
  isBackupKey,
  isBackupName,
  mediaNamesOf,
  readBackupInfo,
  sortBackups,
} from "../backups";

describe("noms et rotation", () => {
  it("un nom daté se relit à la seconde", () => {
    const d = new Date(2026, 10, 6, 9, 5, 7);
    expect(backupName(d)).toBe("2026-11-06-090507.zip");
    expect(backupDate("2026-11-06-090507.zip")?.getTime()).toBe(d.getTime());
    expect(isBackupName("2026-02-30-120000.zip")).toBe(false);
    expect(isBackupName("../2026-11-06-090507.zip")).toBe(false);
    expect(isBackupName("2026-11-06-090507.md")).toBe(false);
  });

  it("la clé d'un projet est stable et sûre comme nom de dossier", () => {
    const key = backupKey("C:\\Users\\Seb\\Romans\\Le phare");
    expect(key).toBe(backupKey("C:\\Users\\Seb\\Romans\\Le phare"));
    expect(isBackupKey(key)).toBe(true);
    expect(key).not.toBe(backupKey("C:\\Users\\Seb\\Romans\\Le phare 2"));
    expect(isBackupKey("../p0000000000000")).toBe(false);
  });

  it("garde les dernières, puis la dernière de chaque jour sur 30 jours", () => {
    const now = new Date(2026, 10, 6, 18, 0, 0);
    const names: string[] = [];
    // Aujourd'hui, toutes les demi-heures de 9 h à 17 h 30.
    for (let h = 9; h < 18; h++) for (const m of [0, 30]) names.push(backupName(new Date(2026, 10, 6, h, m, 0)));
    // Trois par jour pendant 40 jours avant.
    for (let d = 1; d <= 40; d++) for (const h of [10, 14, 20]) names.push(backupName(new Date(2026, 10, 6 - d, h, 0, 0)));
    const gone = new Set(backupsToRemove(names, now));
    const kept = sortBackups(names).filter((n) => !gone.has(n));
    // Les 5 dernières d'aujourd'hui, puis une par jour sur les 29 jours d'avant (30 jours en tout).
    expect(kept.slice(0, KEEP_LATEST)).toEqual(sortBackups(names).slice(0, KEEP_LATEST));
    expect(kept.length).toBe(KEEP_LATEST + 29);
    expect(kept.every((n) => n >= "2026-10-08")).toBe(true);
    // Chaque jour gardé l'est par sa dernière sauvegarde.
    expect(kept).toContain("2026-11-05-200000.zip");
    expect(kept).not.toContain("2026-11-05-140000.zip");
  });

  it("ne rend jamais un fichier qui n'est pas une sauvegarde", () => {
    expect(backupsToRemove(["projet.json", "medias", "notes.zip"], new Date())).toEqual([]);
  });

  it("au plus une sauvegarde automatique toutes les 30 minutes", () => {
    const last = new Date(2026, 10, 6, 10, 0, 0);
    expect(backupDue(null, last)).toBe(true);
    expect(backupDue(last, new Date(2026, 10, 6, 10, 29, 0))).toBe(false);
    expect(backupDue(last, new Date(2026, 10, 6, 10, 30, 0))).toBe(true);
    // Horloge revenue en arrière : on sauvegarde plutôt que d'attendre.
    expect(backupDue(last, new Date(2026, 10, 6, 9, 0, 0))).toBe(true);
  });

  it("fiche du projet et images citées", () => {
    expect(readBackupInfo('{"title":"Le phare","kind":"scenario"}')).toEqual({ title: "Le phare", kind: "scenario" });
    expect(readBackupInfo("{abîmé")).toBeNull();
    expect(mediaNamesOf([{ image: "a.jpg", images: ["b.jpg", "a.jpg"] }, { fichier: "c.pdf" }, {}])).toEqual(["a.jpg", "b.jpg", "c.pdf"]);
  });
});

// Faux dossier de sauvegardes, en mémoire, qui lit les images dans le projet comme le stockage de l'app.
function fakeBackups(key: string) {
  const zips = new Map<string, Uint8Array>();
  const medias = new Map<string, Uint8Array>();
  let info: { title: string; kind: "roman" | "scenario" } | null = null;
  const store: BackupStore = {
    key: () => key,
    list: async () => (zips.size > 0 ? [{ key, info, names: [...zips.keys()] }] : []),
    write: async (_k, name, zip, i, wanted) => {
      zips.set(name, zip);
      info = i;
      for (const m of wanted) if (!medias.has(m)) {
        const data = await storage.readMedia(m);
        if (data) medias.set(m, data);
      }
    },
    read: async (_k, name) => zips.get(name)!,
    readMedia: async (_k, name) => medias.get(name) ?? null,
    remove: async (_k, names) => names.forEach((n) => zips.delete(n)),
  };
  return { store, zips, medias };
}

const state = () => useCosmos.getState();
const IMAGE = new Uint8Array([255, 216, 255, 224, 1, 2, 3]);
const files: FileMap = {
  [META_FILE]: JSON.stringify({ version: 1, title: "Le phare", layout: [{ id: "a", x: 10, y: 20 }], links: [] }),
  [cardPath("a")]: '---\nid: a\ntype: personnage\ntitle: "Inès Morvan"\nimage: ines.jpg\n---\nGardienne.\n',
};
const archive = () => zipSync({ ...Object.fromEntries(Object.entries(files).map(([p, t]) => [p, strToU8(t)])), "medias/ines.jpg": IMAGE });

beforeEach(() => {
  localStorage.clear();
  useCosmos.setState({ screen: "home", loaded: false, openFailed: false, homeNotice: false, lastFiles: {}, screenplay: null, savedScreenplay: null, nodes: [], edges: [], dialog: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (storage as { backups?: BackupStore }).backups;
});

describe("sauvegarder et rouvrir", () => {
  it("une sauvegarde hors du projet s'ouvre comme un nouveau projet, images comprises", async () => {
    vi.spyOn(storage, "pickFile").mockResolvedValueOnce({ name: "phare.zip", data: archive() });
    await state().importFile();
    expect(state().title).toBe("Le phare");

    const fake = fakeBackups(backupKey("phare"));
    (storage as { backups?: BackupStore }).backups = fake.store;
    expect(await state().backupNow()).toBe(true);
    expect(fake.zips.size).toBe(1);
    expect(fake.medias.get("ines.jpg")).toEqual(IMAGE);
    // L'image n'est pas dans le .zip : elle est gardée une seule fois à côté.
    const { unzipSync } = await import("fflate");
    const [name, zip] = [...fake.zips][0];
    expect(Object.keys(unzipSync(zip))).not.toContain("medias/ines.jpg");

    // Un enregistrement juste après ne refait pas de sauvegarde (30 minutes au plus).
    state().updateCard("a", { title: "Inès Le Goff" });
    await state().save();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.zips.size).toBe(1);

    expect(await state().openBackup(backupKey("phare"), name)).toBe(true);
    expect(state().screen).toBe("project");
    expect(state().title).toMatch(/^Le phare \((sauvegarde du|backup of) .+2026.*\)$/);
    // Le texte de la sauvegarde, pas celui modifié ensuite.
    expect(state().nodes.find((n) => n.id === "a")?.data.title).toBe("Inès Morvan");
    expect(await storage.readMedia("ines.jpg")).toEqual(IMAGE);
  });

  it("une sauvegarde illisible ne ferme pas le projet ouvert", async () => {
    vi.spyOn(storage, "pickFile").mockResolvedValueOnce({ name: "phare.zip", data: archive() });
    await state().importFile();
    const fake = fakeBackups(backupKey("phare"));
    fake.zips.set("2026-11-06-100000.zip", new Uint8Array([1, 2, 3]));
    (storage as { backups?: BackupStore }).backups = fake.store;
    expect(await state().openBackup(backupKey("phare"), "2026-11-06-100000.zip")).toBe(false);
    expect(state().screen).toBe("project");
    expect(state().title).toBe("Le phare");
  });

  it("sans dossier de sauvegardes (navigateur), rien n'est fait", async () => {
    expect(storage.backups).toBeUndefined();
    expect(await state().backupNow()).toBe(false);
  });
});

describe("fenêtre Sauvegardes", () => {
  it("liste les sauvegardes datées de tous les projets et ouvre celle choisie", async () => {
    const { createElement, act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { BackupsDialog } = await import("../components/BackupsDialog");
    const fake = fakeBackups(backupKey("phare"));
    fake.zips.set("2026-11-05-200000.zip", new Uint8Array());
    fake.zips.set("2026-11-06-093000.zip", new Uint8Array());
    (storage as { backups?: BackupStore }).backups = fake.store;
    const open = vi.spyOn(state(), "openBackup").mockResolvedValue(true);
    useCosmos.setState({ backupsFor: null, openBackup: open });

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(BackupsDialog)));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(".backups-row button")];
    expect(buttons.length).toBe(2);
    // La plus récente d'abord.
    expect(host.querySelector(".backups-date")?.textContent).toMatch(/2026/);
    await act(async () => buttons[0].click());
    expect(open).toHaveBeenCalledWith(backupKey("phare"), "2026-11-06-093000.zip");
    await act(async () => root.unmount());
    host.remove();
  });
});
