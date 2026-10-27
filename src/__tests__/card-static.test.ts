// @vitest-environment happy-dom
// Texte d'une carte sans éditeur : le même HTML que l'éditeur, et l'éditeur n'est plus reconfiguré à chaque rendu.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { cardStaticBody } from "../components/cardStatic";
import { richTextExtensions } from "../components/editorKit";
import { MentionNode } from "../components/MentionNode";
import { markdownToHtml } from "../storage/markdown";

const editorHtml = (html: string) => {
  const editor = new Editor({ extensions: [...richTextExtensions(), MentionNode], content: html });
  const out = editor.getHTML();
  editor.destroy();
  return out;
};

describe("texte d'une carte sans éditeur", () => {
  it("vide : le texte indicatif", () => {
    expect(cardStaticBody("")).toEqual({ html: "", empty: true });
    expect(cardStaticBody("<p></p>").empty).toBe(true);
  });

  it("le HTML de l'éditeur, cases à cocher et mentions comprises, depuis le fichier sur disque", () => {
    const md = "Gardienne **remplaçante**, voir [@Yann](cosmos:p4t8w2zq1c).\n\n- [x] Fait\n- [ ] À faire\n\n## Passé\n\n1. un\n2. deux";
    const html = markdownToHtml(md);
    const body = cardStaticBody(html);
    expect(body.empty).toBe(false);
    // Mêmes balises que l'éditeur ; seules les cases ne prennent pas le focus au clavier.
    expect(body.html.replace(/ tabindex="-1"/g, "")).toBe(editorHtml(html));
    expect(body.html).toContain('data-mention="p4t8w2zq1c"');
    expect(body.html).toMatch(/<input type="checkbox" checked="checked" tabindex="-1">/);
  });

  it("rien d'exécutable ne passe", () => {
    const body = cardStaticBody('<p>Texte<img src=x onerror="alert(1)"><script>alert(2)</script></p>');
    expect(body.html).not.toMatch(/onerror|script/);
  });

  it("le même texte n'est converti qu'une fois", () => {
    const html = "<p>Une fois.</p>";
    expect(cardStaticBody(html)).toBe(cardStaticBody(html));
  });
});
