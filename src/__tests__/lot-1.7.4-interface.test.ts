// @vitest-environment happy-dom
// Lot 1.7.4, interface : fenêtre des raccourcis ouverte en haut, typographie de fr.ts, police du Carnet,
// état d'enregistrement sur téléphone, cibles tactiles, barre du haut sans abonnement au store entier, F1 au Carnet.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { fr } from "../i18n/fr";
import { currentSection, guideUrl } from "../help";
import { useCosmos } from "../store";
import { adoptTextAnswers } from "../projectState";
import type { CardNode } from "../projectState";
import topBarSource from "../components/TopBar.tsx?raw";

// Les feuilles de style lues sur disque (un import « ?raw » de CSS rend une chaîne vide sous Vitest).
const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as { readFileSync: (path: URL, encoding: string) => string };
const css = (name: string) => fs.readFileSync(new URL(name, import.meta.url), "utf8");
const stylesCss = css("../styles.css");
const writingCss = css("../styles/writing.css");
const phoneCss = css("../styles/phone.css");
const canvasCss = css("../styles/canvas.css");
const bibleCss = css("../styles/bible.css");
const screenplayCss = css("../styles/screenplay.css");
const palettesCss = css("../styles/palettes.css");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function strings(value: unknown, path: string, out: [string, string][]) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}

describe("typographie française de fr.ts", () => {
  const all = strings(fr, "", []);

  it("aucune espace ordinaire avant ; ? ! ou :", () => {
    const bad = all.filter(([, s]) => / [;?!:]/.test(s)).map(([p]) => p);
    expect(bad).toEqual([]);
  });

  it("guillemets « » sans espace ordinaire à l'intérieur", () => {
    const bad = all.filter(([, s]) => /« | »/.test(s)).map(([p]) => p);
    expect(bad).toEqual([]);
  });

  it("une ancienne réponse de l'assistant (espace ordinaire avant ?) est toujours reprise", () => {
    const question = fr.assistant.questions.want.replace(/[  ]/g, " ");
    expect(question).not.toBe(fr.assistant.questions.want);
    const node = { id: "p", type: "card", position: { x: 0, y: 0 }, data: { id: "p", type: "personnage", title: "Inès", html: `<p><strong>${question}</strong></p><p>Garder le phare.</p>` } } as unknown as CardNode;
    const [out] = adoptTextAnswers([node]);
    expect(out.data.reponses).toEqual({ want: "Garder le phare." });
  });
});

describe("feuilles de style", () => {
  const sheets = { stylesCss, writingCss, phoneCss, canvasCss, bibleCss, screenplayCss, palettesCss };
  const all = Object.values(sheets).join("\n");

  it("toute police var(--font-…) employée est définie (le Carnet citait --font-body)", () => {
    expect(writingCss.length).toBeGreaterThan(1000);
    const defined = new Set([...stylesCss.matchAll(/(--font-[\w-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...all.matchAll(/var\((--font-[\w-]+)/g)].map((m) => m[1]));
    expect([...used].filter((v) => !defined.has(v))).toEqual([]);
  });

  it("pas de « inherit » dans un raccourci font: (déclaration invalide, taille perdue)", () => {
    expect(all).not.toMatch(/font:[^;}]*inherit\)/);
  });

  it("téléphone : « ⋯ » porte le point d'état d'enregistrement", () => {
    expect(phoneCss).toMatch(/\.topbar-more:is\(\.is-modifie, \.is-enregistrement, \.is-erreur\)::after/);
    expect(topBarSource).toMatch(/topbar-more is-\$\{status\}/);
  });

  it("cibles de 44 px au doigt : liens-boutons, volet du scénario, sortie du mode focus", () => {
    const block = stylesCss.match(/@media \(pointer: coarse\) \{\n  \.link-button, \.sp-bar \.sp-bar-toggle \{ position: relative; \}\n([^\n]*)\n\}/);
    expect(block?.[1]).toMatch(/^  \.link-button::after, \.sp-bar \.sp-bar-toggle::after \{ content: ""; .*height: max\(100%, 44px\)/);
    expect(phoneCss).toMatch(/@media \(pointer: coarse\) \{ \.ms-focus-bar \.focus-exit \{ width: 44px; min-height: 44px; \} \}/);
  });
});

describe("barre du haut", () => {
  it("ne s'abonne pas au store entier (redessinée à chaque frappe)", () => {
    expect(topBarSource).not.toMatch(/useCosmos\(\)/);
  });
});

describe("aide (F1)", () => {
  afterEach(() => useCosmos.setState({ screen: "home", view: "toile", dialog: null }));

  it("le Carnet mène à son chapitre", () => {
    useCosmos.setState({ screen: "project", view: "carnet", dialog: null });
    expect(currentSection(true)).toBe("carnet");
    // Sur téléphone, le canevas et le Plan affichent le Carnet.
    useCosmos.setState({ view: "toile" });
    expect(currentSection(true)).toBe("carnet");
    expect(currentSection(false)).toBe("canvas");
    expect(guideUrl("fr", "carnet")).toMatch(/#carnet$/);
    expect(guideUrl("en", "carnet")).toMatch(/#notebook$/);
  });
});

describe("fenêtre des raccourcis", () => {
  it("s'ouvre en haut : « Fermer » reçoit le focus sans faire défiler", async () => {
    const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void };
    if (!proto.showModal) proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { Dialogs } = await import("../components/Dialogs");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Dialogs)));
    await act(async () => useCosmos.setState({ dialog: "shortcuts" }));
    const close = host.querySelector(".app-dialog-actions button");
    expect(close).not.toBeNull();
    const calls = focus.mock.contexts.map((el, i) => [el, focus.mock.calls[i][0]] as const).filter(([el]) => el === close);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, opts] of calls) expect(opts).toEqual({ preventScroll: true });
    await act(async () => useCosmos.setState({ dialog: null }));
    await act(async () => root.unmount());
    focus.mockRestore();
    host.remove();
  });
});
