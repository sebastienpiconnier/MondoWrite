// @vitest-environment happy-dom
// Depuis le Manuscrit ou le Scénario, ouvrir une fiche dans la Bible retient le curseur : « Retour au manuscrit » y ramène.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { setCaretSource } from "../resume";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string): CardData => ({ id, type, title, html: "" });
const node = (data: CardData) => ({ id: data.id, type: "card", position: { x: 0, y: 0 }, data });

describe("retour de la Bible à l'écriture", () => {
  beforeEach(() => {
    useCosmos.setState({
      view: "manuscrit",
      bibleReturn: null,
      bibleTarget: null,
      nodes: [node(card("s1", "scene", "Scène 1")), node(card("p1", "personnage", "Inès"))] as never,
    });
  });
  afterEach(() => setCaretSource(null));

  it("retient la scène et le curseur en quittant l'écriture pour une fiche", () => {
    setCaretSource(() => ({ scene: "s1", offset: 42 }));
    useCosmos.getState().openInBible("p1");
    const s = useCosmos.getState();
    expect(s.view).toBe("bible");
    expect(s.bibleTarget?.id).toBe("p1");
    expect(s.bibleReturn).toEqual({ scene: "s1", offset: 42 });
  });

  it("revient à la scène, au même curseur, et oublie le retour", () => {
    setCaretSource(() => ({ scene: "s1", el: 3, offset: 7 }));
    useCosmos.getState().openInBible("p1");
    useCosmos.getState().backFromBible();
    const s = useCosmos.getState();
    expect(s.view).toBe("manuscrit");
    expect(s.manuscriptTarget).toBe("s1");
    expect(s.manuscriptCaret).toEqual({ el: 3, offset: 7 });
    expect(s.bibleReturn).toBeNull();
  });

  it("ne propose rien quand on vient du canevas, et oublie le retour en changeant de vue", () => {
    useCosmos.setState({ view: "toile" });
    setCaretSource(() => ({ scene: "s1", offset: 1 }));
    useCosmos.getState().openInBible("p1");
    expect(useCosmos.getState().bibleReturn).toBeNull();

    useCosmos.setState({ view: "manuscrit" });
    useCosmos.getState().openInBible("p1");
    expect(useCosmos.getState().bibleReturn).not.toBeNull();
    useCosmos.getState().setView("toile");
    expect(useCosmos.getState().bibleReturn).toBeNull();
  });

  it("garde le retour d'une fiche à l'autre dans la Bible", () => {
    setCaretSource(() => ({ scene: "s1", offset: 5 }));
    useCosmos.getState().openInBible("p1");
    setCaretSource(null);
    useCosmos.getState().openInBible("p1");
    expect(useCosmos.getState().bibleReturn).toEqual({ scene: "s1", offset: 5 });
  });
});
