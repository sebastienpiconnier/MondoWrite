// Avancement de l'ouverture d'un projet (page des projets), surtout quand les fichiers arrivent d'iCloud.
import { afterEach, describe, expect, it } from "vitest";
import { downloadProgress, endLoad, loadFraction, reportLoad, startLoad, useLoadProgress } from "../loadProgress";

afterEach(() => endLoad());

describe("ouverture d'un projet", () => {
  it("rien n'est signalé hors d'une ouverture (enregistrement, relecture)", () => {
    reportLoad("read", 3, 10);
    expect(useLoadProgress.getState().title).toBeNull();
    expect(useLoadProgress.getState().total).toBe(0);
  });
  it("les étapes suivent l'ouverture, puis tout s'efface", () => {
    startLoad("Le Petit Chaperon rouge");
    reportLoad("download", 2, 8);
    reportLoad("read", 5, 12);
    const s = useLoadProgress.getState();
    expect(s).toMatchObject({ title: "Le Petit Chaperon rouge", phase: "read", done: 5, total: 12, cloud: true });
    endLoad();
    expect(useLoadProgress.getState().title).toBeNull();
  });
  it("sans iCloud, l'aide sur iCloud ne s'affiche pas", () => {
    startLoad("Roman");
    reportLoad("read", 1, 4);
    expect(useLoadProgress.getState().cloud).toBe(false);
  });
});

describe("avancement", () => {
  it("part faite, bornée, inconnue sans total", () => {
    expect(loadFraction({ done: 3, total: 12 })).toBe(0.25);
    expect(loadFraction({ done: 20, total: 12 })).toBe(1);
    expect(loadFraction({ done: 0, total: 0 })).toBeNull();
  });
  it("iCloud : fichiers arrivés d'après les restants, total jamais en baisse", () => {
    expect(downloadProgress(40, 30)).toEqual({ done: 10, total: 40 });
    expect(downloadProgress(40, 45)).toEqual({ done: 0, total: 45 });
  });
});
