// Assistant externe par MCP (#62) : instantané d'un projet lu par le serveur `--mcp`.

import { describe, expect, it } from "vitest";
import { fr } from "../i18n/fr";
import { EMPTY_PLAN } from "../plan";
import type { CardData } from "../types";
import type { CardNode } from "../projectState";
import { parse } from "../screenplay/parse";
import { DEFAULT_MCP, MCP_FORMAT, buildMcpSnapshot, cleanFountain, cleanMarkdown, mcpAllows, readMcp, type McpSource } from "../mcpSnapshot";
import { backupKey, isBackupKey } from "../backups";

const node = (data: Partial<CardData> & Pick<CardData, "id" | "type">, y = 0): CardNode =>
  ({ id: data.id, type: "card", position: { x: 0, y }, data: { title: "", html: "", ...data } }) as CardNode;

const novel = (): McpSource => ({
  title: "Le Phare",
  kind: "roman",
  nodes: [
    node({ id: "s1", type: "scene", title: "L’arrivée", fiche: { synopsis: "Inès arrive au phare.", statut: "brouillon", pov: "c1", but: "Prendre son poste" } }, 0),
    node({ id: "s2", type: "scene", title: "La tempête" }, 100),
    node({ id: "c1", type: "personnage", title: "Inès Morvan", html: "<p>Ne supporte pas le <strong>silence</strong>. Elle remplace <span data-mention=\"c2\">@Yann</span>.</p>", fiche: { age: "34 ans", accroche: "Gardienne remplaçante", principal: "oui" } }),
    node({ id: "c2", type: "personnage", title: "Yann Le Goff" }),
    node({ id: "l1", type: "lieu", title: "Le phare" }),
  ],
  edges: [{ id: "e1", source: "c1", target: "l1", label: "garde" }],
  plan: { ...EMPTY_PLAN, chapters: [{ id: "ch1", title: "", scenes: ["s1", "s2"] }] },
  manuscript: { s1: "<p>Inès monte l’escalier. Le phare tremble.</p>", s2: "<p>La mer gronde.</p>" },
  screenplay: null,
  pitch: { logline: "Une gardienne et un secret." },
});

describe("instantané d'un roman", () => {
  const snap = buildMcpSnapshot(novel(), fr, new Date("2026-11-09T17:40:00Z"), "1.28.0");

  it("porte son format, la date et le projet", () => {
    expect(snap.format).toBe(MCP_FORMAT);
    expect(snap.savedAt).toBe("2026-11-09T17:40:00.000Z");
    expect(snap.project).toMatchObject({ title: "Le Phare", kind: "roman", kindLabel: "Roman", logline: "Une gardienne et un secret." });
  });

  it("scènes dans l'ordre du livre, avec chapitre, synopsis, statut, point de vue et texte en Markdown", () => {
    expect(snap.scenes.map((s) => [s.n, s.title])).toEqual([[1, "L’arrivée"], [2, "La tempête"]]);
    const first = snap.scenes[0];
    expect(first).toMatchObject({ part: "Chapitre 1", synopsis: "Inès arrive au phare.", status: "Brouillon", pov: "Inès Morvan", words: 6 });
    expect(first.text).toBe("Inès monte l’escalier. Le phare tremble.");
    expect(Object.values(first.fiche ?? {})).toContain("Prendre son poste");
    // Les champs déjà rendus à part ne sont pas répétés dans la fiche.
    expect(Object.values(first.fiche ?? {})).not.toContain("c1");
  });

  it("cartes : libellés en clair, notes sans marque interne, fils, scènes qui les nomment", () => {
    const ines = snap.cards.find((c) => c.id === "c1")!;
    expect(ines.typeLabel).toBe("Personnage");
    expect(ines.summary).toBe("Gardienne remplaçante");
    expect(ines.notes).toBe("Ne supporte pas le **silence**. Elle remplace @Yann.");
    expect(Object.values(ines.fiche ?? {})).toContain("34 ans");
    // « Personnage principal » sert à ranger : jamais lu par l'IA, comme dans l'export.
    expect(Object.values(ines.fiche ?? {})).not.toContain("oui");
    expect(ines.links).toEqual([{ id: "l1", title: "Le phare", label: "garde" }]);
    // Nommée par son prénom dans la scène 1.
    expect(ines.scenes).toEqual([1]);
    expect(snap.cards.find((c) => c.id === "l1")!.scenes).toEqual([1]);
    expect(snap.cards.find((c) => c.id === "c2")!.scenes).toBeUndefined();
    expect(snap.cards.some((c) => c.type === "scene")).toBe(false);
  });
});

describe("instantané d'un scénario", () => {
  it("scènes dans l'ordre du Fountain, épisode, corps sans les notes de MondoWrite", () => {
    const sp = parse(
      [
        "## La tempête [[cosmos:episode:e1]]",
        "",
        "INT. PHARE - NUIT [[cosmos:s1]]",
        "",
        "= Inès arrive.",
        "",
        "Inès monte. [[ia]]",
        "",
        "INÈS",
        "Il y a quelqu’un ?",
        "",
        "EXT. FALAISE - JOUR",
        "",
        "La mer gronde.",
      ].join("\n"),
    );
    const snap = buildMcpSnapshot(
      { ...novel(), kind: "scenario", screenplay: sp, nodes: [node({ id: "s1", type: "scene", title: "INT. PHARE - NUIT", fiche: { statut: "fini" } })], manuscript: {} },
      fr,
      new Date(),
      "1.28.0",
    );
    expect(snap.project.kindLabel).toBe("Scénario");
    expect(snap.scenes.map((s) => s.title)).toEqual(["INT. PHARE - NUIT", "EXT. FALAISE - JOUR"]);
    const [first, second] = snap.scenes;
    expect(first).toMatchObject({ id: "s1", part: "Épisode 1 · La tempête", synopsis: "Inès arrive.", status: "Terminée" });
    expect(first.text).toContain("Inès monte.");
    expect(first.text).toContain("INÈS\nIl y a quelqu’un ?");
    expect(first.text).not.toContain("[[");
    // Scène sans carte : désignée par son rang dans le scénario.
    expect(second.id.startsWith("@")).toBe(true);
    expect(second.text).toBe("La mer gronde.");
  });
});

describe("réglage et nettoyage", () => {
  it("rien n'est ouvert à l'assistant sans l'accord de l'auteur, projet par projet", () => {
    expect(mcpAllows(DEFAULT_MCP, "/Romans/Le phare")).toBe(false);
    const mcp = readMcp({ enabled: true, projects: { "/Romans/Le phare": "read", "/Autre": "write", 3: "read" } });
    expect(mcp.projects).toEqual({ "/Romans/Le phare": "read", "3": "read" });
    expect(mcpAllows(mcp, "/Romans/Le phare")).toBe(true);
    expect(mcpAllows(mcp, "/Autre")).toBe(false);
    expect(mcpAllows({ ...mcp, enabled: false }, "/Romans/Le phare")).toBe(false);
    expect(readMcp("n'importe quoi")).toEqual(DEFAULT_MCP);
  });

  it("la clé du fichier est celle des sauvegardes, sûre comme nom de fichier (vérifiée aussi par le serveur)", () => {
    expect(isBackupKey(backupKey("/Romans/Le phare"))).toBe(true);
  });

  it("mentions et images retirées du Markdown, notes internes du Fountain", () => {
    expect(cleanMarkdown("Voir [@Inès](cosmos:c1).\n\n![Portrait](../medias/a.jpg)\nFin")).toBe("Voir @Inès.\n\nFin");
    expect(cleanFountain("INT. PHARE [[cosmos:s1]]\n\nAction. [[ia]] [[cosmos:comment:x1]]")).toBe("INT. PHARE\n\nAction.");
  });
});
