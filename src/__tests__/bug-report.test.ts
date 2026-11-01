import { describe, expect, it } from "vitest";
import { bugBody, bugReportUrl, errorLine, recentErrors, recordError, scrubPaths, systemName } from "../bugReport";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { stackLabels } from "../components/FrameLabels";

describe("Signaler un bug (1.10.3)", () => {
  it("les chemins personnels ne partent jamais dans l'issue", () => {
    expect(scrubPaths("ENOENT /Users/sebastien/Documents/Roman/cartes/a.md")).toBe("ENOENT ~/Documents/Roman/cartes/a.md");
    expect(scrubPaths("refusé C:\\Users\\Seb\\OneDrive\\x.md")).toBe("refusé ~\\OneDrive\\x.md");
    expect(scrubPaths("/home/anna/projets")).toBe("~/projets");
    expect(errorLine(new TypeError("x is undefined"))).toBe("TypeError: x is undefined");
    expect(errorLine("a".repeat(400)).length).toBe(300);
  });

  it("garde les cinq dernières erreurs, sans répéter la même", () => {
    for (let i = 0; i < 7; i++) recordError(`erreur ${i}`);
    recordError("erreur 6");
    expect(recentErrors()).toEqual(["erreur 2", "erreur 3", "erreur 4", "erreur 5", "erreur 6"]);
  });

  it("le message prérempli porte la version, le système et les erreurs, dans la langue de l'interface", () => {
    const ctx = { version: "1.10.3", system: "macOS", shell: "app de bureau", lang: "fr", project: "roman", ai: "", errors: ["Error: boum"] };
    const body = bugBody(ctx, fr.about.bug);
    expect(body).toContain("### Ce qui s’est passé");
    expect(body).toContain("- Version\u00a0: 1.10.3");
    expect(body).toContain("Error: boum");
    expect(body).not.toContain("Service d’IA");
    expect(bugBody({ ...ctx, lang: "en", errors: [] }, en.about.bug)).toContain(en.about.bug.noErrors);
    const url = new URL(bugReportUrl(ctx, fr.about.bug, "moi/depot"));
    expect(url.origin + url.pathname).toBe("https://github.com/moi/depot/issues/new");
    expect(url.searchParams.get("body")).toBe(body);
    expect(url.searchParams.get("labels")).toBe("bug");
  });

  it("le système se lit dans le user agent", () => {
    expect(systemName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("macOS");
    expect(systemName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows 10/11");
    expect(systemName("Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X)")).toBe("iPadOS 18.1");
    expect(systemName("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
  });
});

describe("titres des cadres de loin (1.10.3)", () => {
  it("le titre d'un sous-cadre descend sous celui du cadre qui le contient", () => {
    const labels = [
      { id: "chap", x: 20, y: 96, width: 300, level: 1 },
      { id: "case", x: 0, y: 0, width: 400, level: 0 },
      { id: "voisin", x: 500, y: 96, width: 300, level: 1 },
    ];
    const shifts = stackLabels(labels, { case: 150, chap: 40, voisin: 40 });
    expect(shifts.case).toBe(0);
    expect(shifts.chap).toBe(54);
    // Un cadre qui n'est pas sous le titre (pas de chevauchement en largeur) ne bouge pas.
    expect(shifts.voisin).toBe(0);
    expect(stackLabels(labels, { case: 60, chap: 40, voisin: 40 }).chap).toBe(0);
  });
});
