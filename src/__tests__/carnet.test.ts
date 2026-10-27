// @vitest-environment happy-dom
// Carnet de l'iPhone : captures, boîte « À ranger », vue affichée selon la largeur.

import { describe, expect, it } from "vitest";
import { capturedCard, fileCards, inboxCards } from "../inbox";
import { cardToFile, fileToCard } from "../storage/markdown";
import { shownView } from "../components/usePhone";
import { useCosmos } from "../store";
import type { CardData } from "../types";

describe("captures du Carnet", () => {
  it("première ligne = titre, la suite = texte ; vide = rien", () => {
    expect(capturedCard("a", "question", "  Qui a volé la clé ?\n\nPeut-être Yann.\n")).toEqual({ id: "a", type: "question", title: "Qui a volé la clé ?", html: "<p>Peut-être Yann.</p>", inbox: true });
    expect(capturedCard("b", "idee", "   \n  ")).toBeNull();
    expect(capturedCard("c", "personnage", "Inès <b>")).toMatchObject({ title: "Inès <b>", html: "" });
    expect(capturedCard("d", "idee", "Une note\n<script>x</script>")?.html).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>");
  });

  it("une adresse seule fait un Lien", () => {
    expect(capturedCard("e", "idee", "https://example.org/phare")).toEqual({ id: "e", type: "lien", title: "", html: "", fiche: { url: "https://example.org/phare" }, inbox: true });
  });

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
  it("téléphone : le Carnet à la place du canevas et du Plan ; ailleurs, le Carnet est le canevas", () => {
    expect(shownView("toile", true)).toBe("carnet");
    expect(shownView("plan", true)).toBe("carnet");
    expect(shownView("bible", true)).toBe("bible");
    expect(shownView("manuscrit", true)).toBe("manuscrit");
    expect(shownView("carnet", false)).toBe("toile");
    expect(shownView("plan", false)).toBe("plan");
  });
});

describe("store", () => {
  it("capturer, puis ranger en reliant, en déplaçant ou à la main", () => {
    const s = useCosmos.getState();
    const a = s.captureCard("idee", "Le phare clignote")!;
    const b = s.captureCard("personnage", "Inès")!;
    const c = s.captureCard("objet", "La clé")!;
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
    const d = useCosmos.getState().captureCard("question", "Pourquoi ?")!;
    useCosmos.getState().fileInbox([d]);
    expect(inbox()).not.toContain(d);
    useCosmos.getState().undo();
    expect(inbox()).toContain(d);
  });
});
