// Export FDX : le format XML de Final Draft, lu aussi par Fade In, WriterDuet, Highland…
// Un paragraphe par élément. Les notes et le texte mis de côté ne sont pas exportés.

import type { Screenplay, ScreenplayElement } from "../model";
import { printable } from "./typeset";

const TYPES: Partial<Record<ScreenplayElement["type"], string>> = {
  sceneHeading: "Scene Heading",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  transition: "Transition",
  centered: "Action",
};

const UPPERCASE = new Set(["sceneHeading", "character", "transition"]);
const SPEECH = new Set(["parenthetical", "dialogue"]);

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildFdx(screenplay: Screenplay, locale: string, numberScenes = false, underlineHeadings = false): string {
  const paragraphs: string[] = [];
  const els = screenplay.elements;
  let scene = 0;
  const paragraph = (el: ScreenplayElement, pad: string): string | null => {
    const type = TYPES[el.type];
    let text = type ? printable(el.text) : "";
    if (!type || text === "") return null;
    if (UPPERCASE.has(el.type)) text = text.toLocaleUpperCase(locale);
    const attributes = [
      el.type === "centered" ? ' Alignment="Center"' : "",
      el.type === "sceneHeading" && (el.sceneNumber || numberScenes) ? ` Number="${escape(el.sceneNumber ?? String(scene))}"` : "",
      ` Type="${type}"`,
    ].join("");
    const style = el.type === "sceneHeading" && underlineHeadings ? ' Style="Underline"' : "";
    return `${pad}<Paragraph${attributes}>\n${pad}  <Text${style}>${escape(text)}</Text>\n${pad}</Paragraph>`;
  };
  /** Fin de la réplique qui commence au nom `start` (didascalies et dialogue compris). */
  const speechEnd = (start: number) => {
    let end = start + 1;
    while (end < els.length && SPEECH.has(els[end].type)) end++;
    return end;
  };
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.type === "sceneHeading") scene++;
    // Dialogue simultané (« ^ » sur le second nom) : les deux répliques dans un <DualDialogue>, comme Final Draft.
    if (el.type === "character" && !el.dual) {
      const middle = speechEnd(i);
      if (els[middle]?.type === "character" && els[middle].dual) {
        const end = speechEnd(middle);
        const inner = els.slice(i, end).map((e) => paragraph(e, "        ")).filter((p) => p !== null);
        paragraphs.push(`    <Paragraph>\n      <DualDialogue>\n${inner.join("\n")}\n      </DualDialogue>\n    </Paragraph>`);
        i = end - 1;
        continue;
      }
    }
    const p = paragraph(el, "    ");
    if (p) paragraphs.push(p);
  }

  const field = (...names: string[]) => {
    const key = Object.keys(screenplay.titlePage).find((k) => names.includes(k.trim().toLowerCase()));
    return key ? printable(screenplay.titlePage[key]) : "";
  };
  const title = [field("title"), field("credit"), field("author", "authors"), field("draft date"), field("contact")]
    .filter(Boolean)
    .flatMap((text) => text.split("\n"))
    .map((line) => `      <Paragraph Alignment="Center" Type="General">\n        <Text>${escape(line)}</Text>\n      </Paragraph>`);

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="1">',
    "  <Content>",
    ...paragraphs,
    "  </Content>",
    ...(title.length > 0 ? ["  <TitlePage>", "    <Content>", ...title, "    </Content>", "  </TitlePage>"] : []),
    "</FinalDraft>",
    "",
  ].join("\n");
}
