// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { flattenSourceNewlines } from "../pasteHtml";

describe("HTML collé depuis Word", () => {
  it("les retours du code source deviennent des espaces, les <br> et <pre> restent", () => {
    const html = '<p class=MsoNormal>Il pleuvait sur la ville depuis\r\ntrois jours, et personne<br>ne sortait.</p>\n<pre>a\nb</pre>';
    const out = flattenSourceNewlines(html);
    expect(out).toContain("Il pleuvait sur la ville depuis trois jours, et personne<br>ne sortait.");
    expect(out).toContain("<pre>a\nb</pre>");
  });
  it("un HTML sans retour revient tel quel", () => {
    expect(flattenSourceNewlines("<p>ok</p>")).toBe("<p>ok</p>");
  });
});
