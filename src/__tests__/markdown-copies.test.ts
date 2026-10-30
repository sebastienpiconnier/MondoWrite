// @vitest-environment happy-dom
// Copies Markdown du projet (markdown/) : contenu, liens vers les fiches, versions du jour et nettoyage.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage, type CopyStore, type FileMap } from "../storage";
import { getT } from "../i18n";
import { BIBLE_ORDER } from "../types";
import { buildCopies, dayKey, forgetCopies, syncCopies, versionText, versionsToRemove } from "../markdownCopies";
import { headingSlug, markdownAnchors } from "../export/text";

const state = () => useCosmos.getState();
const ctx = () => ({ t: getT(), lang: "fr", author: "Charles Perrault" });

beforeEach(async () => {
  // Pas de copies pendant la préparation (le projet d'exemple s'enregistre en s'ouvrant).
  storage.copies = undefined;
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, lastFiles: {}, past: [], future: [], trash: [], trashNotice: null });
  await state().start();
  await state().tryExample();
});

describe("contenu des copies", () => {
  it("roman : manuscrit, bible et canevas, avertissement, images vers ../medias/, mentions vers la fiche", () => {
    const copies = buildCopies(state(), ctx(), BIBLE_ORDER);
    expect(Object.keys(copies).sort()).toEqual(["bible.md", "canevas.md", "manuscrit.md"]);
    for (const text of Object.values(copies)) expect(text).toContain(`> ${getT().copies.note.replace(/[\\*_`[\]#]/g, "\\$&")}`);
    expect(copies["bible.md"]).toMatch(/!\[\]\(\.\.\/medias\/[^)]+\.jpg\)/);
    // Une carte reliée, dans la bible : lien vers l'ancre de sa fiche, dans le même fichier.
    expect(copies["bible.md"]).toMatch(/\[Le Loup\]\(#le-loup\)/);
    // Le canevas mène aux fiches de la bible.
    expect(copies["canevas.md"]).toMatch(/\]\(bible\.md#[a-zà-ÿ-]+\)/);
  });

  it("scénario : pas de manuscrit.md (scenario.fountain se lit déjà d'un seul tenant)", () => {
    const copies = buildCopies({ ...state(), kind: "scenario" }, ctx(), BIBLE_ORDER);
    expect(copies["manuscrit.md"]).toBeUndefined();
    expect(copies["bible.md"]).toBeTruthy();
  });

  it("ancres comme GitHub : minuscules, sans ponctuation, doublons numérotés", () => {
    expect(headingSlug("La Mère-grand’s house !")).toBe("la-mère-grands-house-");
    const anchors = markdownAnchors({ title: "Bible", author: "", lang: "fr", chapters: [{ title: "Lieux", blocks: [{ kind: "heading", runs: [{ text: "Le bois" }], anchor: "a" }, { kind: "heading", runs: [{ text: "Le bois" }], anchor: "b" }] }] });
    expect([anchors.get("a"), anchors.get("b")]).toEqual(["le-bois", "le-bois-1"]);
  });
});

describe("versions", () => {
  it("les images d'une version sont deux dossiers plus haut", () => {
    expect(versionText("![](../medias/a.jpg) et [x](bible.md#x)")).toBe("![](../../../medias/a.jpg) et [x](bible.md#x)");
  });

  it("30 jours gardés en entier, puis la dernière version de chaque mois", () => {
    const days = ["2026-06-03", "2026-06-28", "2026-08-01", "2026-08-20", "2026-09-10", "2026-09-11", "2026-09-12", "2026-10-11", "2026-12-01"];
    expect(versionsToRemove(days, "2026-10-11")).toEqual(["2026-06-03", "2026-08-01", "2026-09-10"]);
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("écriture dans markdown/", () => {
  let disk: FileMap;
  let writes: FileMap[];
  let removedDays: string[];
  beforeEach(async () => {
    await syncCopies(() => ({}), false); // file d'attente vide avant de compter
    disk = {};
    writes = [];
    removedDays = [];
    forgetCopies();
    const fake: CopyStore = {
      key: () => "projet",
      read: async (names) => Object.fromEntries(names.filter((n) => n in disk).map((n) => [n, disk[n]])),
      write: async (files, removed) => {
        writes.push(files);
        Object.assign(disk, files);
        for (const name of removed) delete disk[name];
      },
      versions: async () => [...new Set(Object.keys(disk).filter((n) => n.startsWith("versions/")).map((n) => n.split("/")[1]))],
      removeVersions: async (days) => {
        removedDays.push(...days);
      },
    };
    storage.copies = fake;
  });

  it("écrit les copies et la version du jour, puis rien tant que le texte ne change pas", async () => {
    disk["versions/2026-08-01/bible.md"] = "ancienne";
    disk["versions/2026-08-31/bible.md"] = "fin août";
    const now = new Date(2026, 9, 11, 14);
    const build = () => buildCopies(state(), ctx(), BIBLE_ORDER);
    await syncCopies(build, true, now);
    expect(Object.keys(writes[0]).sort()).toEqual(["bible.md", "canevas.md", "manuscrit.md", "versions/2026-10-11/bible.md", "versions/2026-10-11/canevas.md", "versions/2026-10-11/manuscrit.md"]);
    expect(writes[0]["versions/2026-10-11/bible.md"]).toContain("](../../../medias/");
    expect(removedDays).toEqual(["2026-08-01"]);

    await syncCopies(build, true, now);
    expect(writes).toHaveLength(1);

    // Une fiche change : sa copie et la version du jour (complète) sont réécrites, pas les autres copies.
    const id = state().nodes.find((n) => n.data.type === "lieu")!.id;
    state().updateCard(id, { html: "<p>Un bois plus sombre.</p>" });
    await syncCopies(build, true, now);
    expect(Object.keys(writes[1]).filter((n) => !n.startsWith("versions/")).sort()).toEqual(["bible.md", "canevas.md"]);
    expect(Object.keys(writes[1]).filter((n) => n.startsWith("versions/"))).toHaveLength(3);
  });

  it("une passe demandée pour un projet n'écrit rien si un autre projet est ouvert entre-temps (1.7.2)", async () => {
    let current = "projetA";
    storage.copies = { ...storage.copies!, key: () => current };
    const now = new Date(2026, 9, 30, 20);
    // Demandée pour A, mais B est ouvert avant que la file ne l'exécute.
    const pending = syncCopies(() => buildCopies(state(), ctx(), BIBLE_ORDER), true, now, "projetA");
    current = "projetB";
    await pending;
    expect(writes).toHaveLength(0);
    // Pour B, elle écrit normalement.
    await syncCopies(() => buildCopies(state(), ctx(), BIBLE_ORDER), true, now, "projetB");
    expect(writes).toHaveLength(1);
  });

  it("réglage du projet arrêté, ou pas de dossier (navigateur) : rien n'est écrit", async () => {
    await syncCopies(() => buildCopies(state(), ctx(), BIBLE_ORDER), false);
    storage.copies = undefined;
    await syncCopies(() => buildCopies(state(), ctx(), BIBLE_ORDER), true);
    expect(writes).toHaveLength(0);
  });

  it("le réglage est écrit dans cosmos.json seulement quand il est arrêté", () => {
    expect(state().markdownCopies).toBe(true);
    state().setMarkdownCopies(false);
    expect(state().markdownCopies).toBe(false);
  });
});
