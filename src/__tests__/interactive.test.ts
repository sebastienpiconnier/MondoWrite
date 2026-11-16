// Roman interactif, lot 0 (docs/plan-roman-interactif.md) : isolation et option expérimentale.

import { describe, expect, it } from "vitest";
import { KNOWN_META, openProject, toProject } from "../projectState";
import { INTERACTIVE_KEY, NO_EXPERIMENTS, interactiveMeta, interactiveOffered, isInteractiveMeta, readExperimental, showsInteractive } from "../interactive";

const on = { interactive: true };

describe("option expérimentale", () => {
  it("coupée par défaut, seule la valeur true l'active", () => {
    expect(readExperimental(undefined)).toEqual(NO_EXPERIMENTS);
    expect(readExperimental("oui")).toEqual(NO_EXPERIMENTS);
    expect(readExperimental({ interactive: "true" }).interactive).toBe(false);
    expect(readExperimental({ interactive: 1 }).interactive).toBe(false);
    expect(readExperimental({ interactive: true, autre: true })).toEqual({ interactive: true });
  });

  it("proposé seulement avec la version qui le contient ET l'option de l'auteur", () => {
    expect(interactiveOffered(NO_EXPERIMENTS, true)).toBe(false);
    expect(interactiveOffered(on, true)).toBe(true);
    expect(interactiveOffered(on, false)).toBe(false);
  });
});

describe("projet interactif", () => {
  it("se reconnaît à interactive: true, rien d'autre", () => {
    expect(isInteractiveMeta(undefined)).toBe(false);
    expect(isInteractiveMeta({})).toBe(false);
    expect(isInteractiveMeta({ interactive: "true" })).toBe(false);
    expect(isInteractiveMeta(interactiveMeta())).toBe(true);
  });

  it("ne se montre interactif que si l'option est active : sinon c'est un roman", () => {
    expect(showsInteractive(interactiveMeta(), on, true)).toBe(true);
    expect(showsInteractive(interactiveMeta(), NO_EXPERIMENTS, true)).toBe(false);
    expect(showsInteractive(interactiveMeta(), on, false)).toBe(false);
    expect(showsInteractive({}, on, true)).toBe(false);
  });
});

describe("format : un roman interactif reste un roman", () => {
  const base = (extra: Record<string, unknown>) => ({ meta: { version: 1 as const, title: "T", kind: "roman" as const, layout: [], links: [], ...extra }, cards: [], screenplay: null });

  it("la clé n'est pas connue du cœur : elle voyage dans metaKeep et se réécrit telle quelle", () => {
    expect(KNOWN_META.has(INTERACTIVE_KEY)).toBe(false);
    const { state } = openProject(base(interactiveMeta()));
    expect(state.kind).toBe("roman");
    expect(isInteractiveMeta(state.metaKeep)).toBe(true);
    const written = toProject(state as Parameters<typeof toProject>[0]);
    expect((written.meta as unknown as Record<string, unknown>)[INTERACTIVE_KEY]).toBe(true);
    expect(written.meta.kind).toBe("roman");
    expect(isInteractiveMeta(openProject(written).state.metaKeep)).toBe(true);
  });

  it("un roman ordinaire n'écrit jamais la clé", () => {
    const { state } = openProject(base({}));
    const written = toProject(state as Parameters<typeof toProject>[0]);
    expect(INTERACTIVE_KEY in written.meta).toBe(false);
  });
});
