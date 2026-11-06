// @vitest-environment happy-dom
// Cartes « À ranger » (venues de l'ancien Carnet de l'iPhone) et vue affichée selon la largeur.

import { describe, expect, it } from "vitest";
import { fileCards, inboxCards } from "../inbox";
import { cardToFile, fileToCard } from "../storage/markdown";
import { shownView } from "../components/usePhone";
import { useCosmos } from "../store";
import type { CardData } from "../types";

describe("cartes à ranger", () => {
  it("« À ranger » : les plus récentes d'abord, et rangées une à une", () => {
    const cards: CardData[] = [
      { id: "1", type: "idee", title: "a", html: "", inbox: true },
      { id: "2", type: "idee", title: "b", html: "" },
      { id: "3", type: "lieu", title: "c", html: "", inbox: true },
    ];
    expect(inboxCards(cards).map((c) => c.id)).toEqual(["3", "1"]);
    const nodes = cards.map((data) => ({ id: data.id, data }));
    expect(fileCards(nodes, new Set(["2"]))).toBe(nodes);
    const filed = fileCards(nodes, new Set(["1"]));
    expect(filed[0].data.inbox).toBeUndefined();
    expect(filed[2]).toBe(nodes[2]);
  });

  it("la marque passe par le fichier de la carte, et n'est écrite que si elle est vraie", () => {
    const card: CardData = { id: "k3x9a7bq2m", type: "idee", title: "Le phare", html: "", inbox: true };
    const text = cardToFile(card);
    expect(text).toContain("inbox: true");
    expect(fileToCard(text)).toEqual(card);
    expect(cardToFile({ ...card, inbox: undefined })).not.toContain("inbox");
  });
});

describe("vue affichée", () => {
  it("téléphone : les mêmes vues qu'ailleurs ; l'ancienne vue Carnet est le canevas partout", () => {
    expect(shownView("toile", true)).toBe("toile");
    expect(shownView("plan", true)).toBe("plan");
    expect(shownView("carnet", true)).toBe("toile");
    expect(shownView("bible", true)).toBe("bible");
    expect(shownView("manuscrit", true)).toBe("manuscrit");
    expect(shownView("carnet", false)).toBe("toile");
    expect(shownView("plan", false)).toBe("plan");
  });
});

describe("store", () => {
  it("ranger en reliant, en déplaçant ou à la main", () => {
    // Une carte à ranger, comme les écrivait le Carnet (ou une version d'avant) : `inbox: true` dans son fichier.
    const capture = (type: CardData["type"], title: string) => {
      const id = useCosmos.getState().addTitledCard(type, title);
      useCosmos.setState({ nodes: useCosmos.getState().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, inbox: true } } : n)) });
      return id;
    };
    const a = capture("idee", "Le phare clignote");
    const b = capture("personnage", "Inès");
    const c = capture("objet", "La clé");
    const inbox = () => useCosmos.getState().nodes.filter((n) => n.data.inbox).map((n) => n.id);
    expect(inbox()).toEqual(expect.arrayContaining([a, b, c]));
    useCosmos.getState().linkCards(a, b, "");
    expect(inbox()).not.toContain(a);
    expect(inbox()).not.toContain(b);
    const node = useCosmos.getState().nodes.find((n) => n.id === c)!;
    useCosmos.getState().onNodesChange([{ type: "position", id: c, position: { x: node.position.x + 40, y: node.position.y }, dragging: true }]);
    expect(inbox()).toContain(c);
    useCosmos.getState().onNodesChange([{ type: "position", id: c, position: { x: node.position.x + 80, y: node.position.y }, dragging: false }]);
    expect(inbox()).not.toContain(c);
    const d = capture("question", "Pourquoi ?");
    useCosmos.getState().fileInbox([d]);
    expect(inbox()).not.toContain(d);
    useCosmos.getState().undo();
    expect(inbox()).toContain(d);
  });
});

describe("canevas du téléphone", () => {
  it("une carte créée s'ouvre en grand sur téléphone, prend le focus du canevas ailleurs", () => {
    const real = window.matchMedia;
    const media = (matches: boolean) => () => ({ matches, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
    try {
      window.matchMedia = media(true);
      const id = useCosmos.getState().addCard({ x: 5000, y: 0 }, "personnage");
      expect(useCosmos.getState()).toMatchObject({ expandedId: id, dialog: "card", pendingFocusId: null });
      useCosmos.getState().setDialog(null);
      window.matchMedia = media(false);
      const other = useCosmos.getState().addCard({ x: 6000, y: 0 });
      expect(useCosmos.getState().pendingFocusId).toBe(other);
      expect(useCosmos.getState().dialog).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });
});
