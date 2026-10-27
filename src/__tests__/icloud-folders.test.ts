import { describe, expect, it } from "vitest";
import { freeName, isStrayFolder, macIcloudState, strayFolders } from "../storage/icloudFolders";

describe("dossier iCloud de l'app", () => {
  it("reconnaît les doublons créés par iCloud, et eux seuls", () => {
    expect(isStrayFolder("projets 2")).toBe(true);
    expect(isStrayFolder("projets 12")).toBe(true);
    for (const n of ["projets", "projets2", "projets 2 copie", "Projets 2", "mes projets 2", "projets (2)"]) expect(isStrayFolder(n)).toBe(false);
    expect(strayFolders(["projets 10", "Frankenstein", "projets", "projets 2", ".DS_Store"])).toEqual(["projets 2", "projets 10"]);
  });

  it("attend le dossier des projets sans le créer, tant que le dossier iCloud de l'app est là", () => {
    expect(macIcloudState(true, true)).toBe("ok");
    expect(macIcloudState(true, false)).toBe("waiting");
    expect(macIcloudState(false, false)).toBe("gone");
  });

  it("ne remplace jamais un projet déjà rangé", () => {
    expect(freeName("Frankenstein", new Set())).toBe("Frankenstein");
    expect(freeName("Frankenstein", new Set(["Frankenstein", "Frankenstein (2)"]))).toBe("Frankenstein (3)");
  });
});
