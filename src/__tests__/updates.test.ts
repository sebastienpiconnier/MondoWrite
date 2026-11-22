// Mises à jour de l'app : comparaison des versions, lecture de la Release GitHub, rythme des vérifications.

import { describe, expect, it } from "vitest";
import { CHECK_EVERY_MS, RELEASES_PAGE, canUpdate, checkForUpdate, currentVersion, dueForCheck, isNewer, parseRelease, parseVersion, pluginAbsent, useUpdates } from "../updates";
import conf from "../../src-tauri/tauri.conf.json";
import { version } from "../../package.json";

describe("versions", () => {
  it("lit v0.1.6, 0.2.0-beta.2, refuse le reste", () => {
    expect(parseVersion("v0.1.6")).toEqual({ parts: [0, 1, 6], pre: "" });
    expect(parseVersion("0.2.0-beta.2")).toEqual({ parts: [0, 2, 0], pre: "beta.2" });
    expect(parseVersion("main")).toBeNull();
    expect(parseVersion("1.2")).toBeNull();
  });

  it("compare nombre par nombre (0.1.10 après 0.1.9), préversion avant la version finale", () => {
    expect(isNewer("0.1.6", "0.1.5")).toBe(true);
    expect(isNewer("v0.1.10", "0.1.9")).toBe(true);
    expect(isNewer("0.2.0", "0.10.0")).toBe(false);
    expect(isNewer("0.1.5", "0.1.5")).toBe(false);
    expect(isNewer("0.1.4", "0.1.5")).toBe(false);
    expect(isNewer("0.2.0", "0.2.0-beta.1")).toBe(true);
    expect(isNewer("0.2.0-beta.1", "0.2.0")).toBe(false);
    expect(isNewer("0.2.0-beta.10", "0.2.0-beta.9")).toBe(true);
    expect(isNewer("n'importe quoi", "0.1.0")).toBe(false);
  });

  it("la version de l'app est celle de package.json", () => {
    expect(currentVersion).toBe(version);
  });
});

describe("Release GitHub", () => {
  const release = { tag_name: "v0.1.6", html_url: "https://github.com/sebastienpiconnier/MondoWrite/releases/tag/v0.1.6", body: "## Nouveautés\r\n- Mises à jour", draft: false, prerelease: false };

  it("version, page et notes ; brouillon, préversion et adresse étrangère écartés", () => {
    expect(parseRelease(release)).toEqual({ version: "0.1.6", url: release.html_url, notes: "## Nouveautés\n- Mises à jour" });
    expect(parseRelease({ ...release, draft: true })).toBeNull();
    expect(parseRelease({ ...release, prerelease: true })).toBeNull();
    expect(parseRelease({ ...release, tag_name: "nightly" })).toBeNull();
    expect(parseRelease({ ...release, html_url: "https://evil.example/cosmos.exe" })!.url).toBe(RELEASES_PAGE);
    expect(parseRelease("404")).toBeNull();
  });
});

describe("rythme", () => {
  it("au lancement : une fois par jour au plus, jamais si l'auteur l'a désactivé", () => {
    const now = 1_000_000_000_000;
    expect(dueForCheck(true, 0, now)).toBe(true);
    expect(dueForCheck(true, now - CHECK_EVERY_MS + 1000, now)).toBe(false);
    expect(dueForCheck(true, now - CHECK_EVERY_MS, now)).toBe(true);
    expect(dueForCheck(false, 0, now)).toBe(false);
    // Horloge de l'appareil reculée : on vérifie quand même.
    expect(dueForCheck(true, now + 5000, now)).toBe(true);
  });

  it("dans le navigateur (et sur mobile) : rien n'est demandé", async () => {
    expect(canUpdate()).toBe(false);
    expect(await checkForUpdate()).toBe("idle");
    expect(useUpdates.getState().status).toBe("idle");
  });
});

describe("mise à jour dans l'app", () => {
  it("la clé publique est dans tauri.conf.json : toute version construite (pas seulement la CI) sait s'installer", () => {
    // Jusqu'à la 1.45.0, une app construite hors de la CI n'avait pas le plugin et renvoyait vers la page de la Release.
    const key = atob(conf.plugins.updater.pubkey);
    expect(key).toMatch(/^untrusted comment: minisign public key: 9DCFA2B922BDC4B8\n/);
    expect(conf.plugins.updater.endpoints[0]).toBe("https://github.com/sebastienpiconnier/MondoWrite/releases/latest/download/latest.json");
  });

  it("plugin absent (inutile de réessayer) ou simple accroc (réessayé)", () => {
    expect(pluginAbsent("plugin updater not found")).toBe(true);
    expect(pluginAbsent("updater.check not allowed. Permissions associated with this command: updater:allow-check")).toBe(true);
    expect(pluginAbsent("Could not fetch a valid release JSON from the remote")).toBe(false);
    expect(pluginAbsent("error sending request for url (https://github.com/…/latest.json): operation timed out")).toBe(false);
  });
});
