import { describe, expect, it } from "vitest";
import { parseTemplateText, templateFileName, templateToMarkdown } from "../templateFile";

describe("gabarits en fichier", () => {
  const tpl = { name: "Mon polar", beats: [{ label: "Le crime", hint: "Un corps : qui, où, quand." }, { label: "L'enquête" }, { label: "La chute", hint: "Le coupable démasqué" }] };

  it("l'export en Markdown se relit à l'identique", () => {
    const md = templateToMarkdown(tpl);
    expect(md).toContain("# Mon polar");
    expect(md).toContain("## Le crime");
    expect(parseTemplateText(md, "x.md")).toEqual(tpl);
  });

  it("lit une liste avec « Case : aide » et prend le nom du fichier à défaut de titre", () => {
    const parsed = parseTemplateText("- Ouverture : le monde avant\n- **Déclencheur** — tout bascule\n1. Fin\n   suite de l'aide de la fin", "Ma structure.md");
    expect(parsed).toEqual({
      name: "Ma structure",
      beats: [
        { label: "Ouverture", hint: "Le monde avant" },
        { label: "Déclencheur", hint: "Tout bascule" },
        { label: "Fin", hint: "Suite de l'aide de la fin" },
      ],
    });
  });

  it("lit des lignes nues, un titre unique devient le nom", () => {
    expect(parseTemplateText("# Trois temps\nAvant\nPendant\nAprès\n")).toEqual({ name: "Trois temps", beats: [{ label: "Avant" }, { label: "Pendant" }, { label: "Après" }] });
  });

  it("des titres de même niveau sont les cases, numéros retirés", () => {
    expect(parseTemplateText("# 1. Un\nAide un\n# 2. Deux\n", "g.md")?.beats).toEqual([{ label: "Un", hint: "Aide un" }, { label: "Deux" }]);
  });

  it("lit le JSON (objet ou tableau) et ignore ce qui n'a pas la bonne forme", () => {
    expect(parseTemplateText(JSON.stringify({ name: "J", beats: [{ label: "A", hint: "a" }, { nope: 1 }, "B"] }))).toEqual({ name: "J", beats: [{ label: "A", hint: "A" }, { label: "B" }] });
    expect(parseTemplateText('["X","Y"]', "liste.json")).toEqual({ name: "liste", beats: [{ label: "X" }, { label: "Y" }] });
  });

  it("rend null pour un fichier sans case, borne la taille", () => {
    expect(parseTemplateText("   \n\n")).toBeNull();
    expect(parseTemplateText("# Titre seul")).toBeNull();
    const many = Array.from({ length: 60 }, (_, i) => `- Case ${i}`).join("\n");
    expect(parseTemplateText(many)?.beats).toHaveLength(40);
    expect(parseTemplateText(`- ${"a".repeat(500)}`)?.beats[0].label).toHaveLength(120);
  });

  it("ignore un en-tête YAML et le BOM, accepte les fins de ligne Windows", () => {
    expect(parseTemplateText("﻿---\ntitle: x\n---\n# G\r\n## A\r\nAide\r\n")).toEqual({ name: "G", beats: [{ label: "A", hint: "Aide" }] });
  });

  it("nom de fichier sûr", () => {
    expect(templateFileName('Acte 1/2 : "Le début"?', "Gabarit")).toBe("Acte 1 2 Le début");
    expect(templateFileName("  ", "Gabarit")).toBe("Gabarit");
  });
});
