// @vitest-environment happy-dom
// Le chutier suit le projet : écrit dans cosmos.json, relu à l'ouverture, jamais perdu par une version qui ne le connaît pas.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { deserialize, serialize } from "../storage";
import { KNOWN_META, openProject, toProject } from "../projectState";
import type { Passage } from "../chutier";

const passage: Passage = { id: "p1", scene: "s1", slice: { content: [{ type: "paragraph", content: [{ type: "text", text: "Un passage." }] }], openStart: 1, openEnd: 1 }, text: "Un passage.", before: "avant ", after: " après", offset: 6, date: "2026-10-20T10:00:00.000Z" };

describe("chutier dans le projet", () => {
  beforeEach(() => useCosmos.setState({ chutier: [] }));

  it("addPassage et removePassage tiennent le projet pour modifié", () => {
    useCosmos.setState({ status: "enregistre" });
    useCosmos.getState().addPassage(passage);
    expect(useCosmos.getState().chutier).toEqual([passage]);
    expect(useCosmos.getState().status).toBe("modifie");
    useCosmos.setState({ status: "enregistre" });
    useCosmos.getState().removePassage("inconnu");
    expect(useCosmos.getState().status).toBe("enregistre");
    useCosmos.getState().removePassage("p1");
    expect(useCosmos.getState().chutier).toEqual([]);
  });

  it("écrit dans cosmos.json et relu à l'identique", () => {
    useCosmos.getState().addPassage(passage);
    const files = serialize(toProject(useCosmos.getState()));
    expect(files["cosmos.json"]).toContain("Un passage.");
    const { state } = openProject(deserialize(files)!);
    expect(state.chutier).toEqual([passage]);
    expect(KNOWN_META.has("chutier")).toBe(true);
  });

  it("un chutier vide n'écrit rien", () => {
    const files = serialize(toProject(useCosmos.getState()));
    expect(files["cosmos.json"]).not.toContain("chutier");
  });
});
