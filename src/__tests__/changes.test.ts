// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { changeCount, changeLines, changeLog, objectTracks, parseChange, promises, stateAt, thingKey, whoKnows } from "../changes";

const m = (id: string, title: string) => `<span data-mention="${id}">@${title}</span>`;
const p = (...parts: string[]) => `<p>${parts.join("")}</p>`;
const line = (html: string) => parseChange(changeLines(html)[0]);

describe("une ligne de « Ce qui change »", () => {
  it("lit qui, le verbe et ce qui suit", () => {
    const c = line(p(m("ines", "Inès"), " apprend que ", m("yann", "Yann"), " a survécu."));
    expect(c).toMatchObject({ who: ["ines"], verb: "apprend", what: "que Yann a survécu", refs: ["yann"] });
    expect(c.text).toBe("Inès apprend que Yann a survécu.");
  });

  it("reconnaît les verbes au pluriel et en anglais", () => {
    expect(line(p(m("a", "Inès"), " et ", m("b", "Yann"), " apprennent la vérité.")).who).toEqual(["a", "b"]);
    expect(line(p(m("a", "Inès"), " reçoit la clé du phare.")).verb).toBe("recoit");
    expect(line(p(m("a", "Inès"), " perd la clé du phare")).verb).toBe("perd");
    expect(line(p(m("a", "Inès"), " se rend à ", m("port", "La maison du port"), ".")).refs).toEqual(["port"]);
    expect(line(p(m("a", "Ines"), " learns that the boat sank.")).verb).toBe("apprend");
    expect(line(p(m("a", "Ines"), " goes to the harbour.")).verb).toBe("serend");
    expect(line(p(m("a", "Ines"), " promises to come back.")).verb).toBe("promet");
  });

  it("une phrase sans verbe connu reste une note", () => {
    const c = line(p("Il pleut sur ", m("ile", "l’île"), "."));
    expect(c.verb).toBeNull();
    expect(c.who).toEqual([]);
    expect(c.refs).toEqual(["ile"]);
  });

  it("ignore les lignes vides et décode le texte", () => {
    expect(changeLines("<p></p><p> </p>")).toEqual([]);
    expect(changeCount(p("a &amp; b") + "<p></p>" + p("c"))).toBe(2);
    expect(line(p(m("a", "Inès"), " perd l&#39;anneau &amp; la clé")).what).toBe("l'anneau & la clé");
  });

  it("clé d'une chose : la carte citée, sinon le texte sans article ni accents", () => {
    expect(thingKey({ refs: ["k"], what: "x" })).toBe("@k");
    expect(thingKey({ refs: [], what: "La Clé du phare" })).toBe(thingKey({ refs: [], what: "la cle du phare" }));
  });
});

describe("le journal et ce qui s'en déduit", () => {
  const scenes = [
    { id: "s1", changes: p(m("ines", "Inès"), " reçoit la clé du phare.") + p(m("yann", "Yann"), " apprend que le bateau a coulé.") },
    { id: "s2", changes: p(m("ines", "Inès"), " se rend à ", m("phare", "Le phare"), ".") + p(m("ines", "Inès"), " promet de revenir.") },
    { id: "s3", changes: p(m("ines", "Inès"), " perd la clé du phare.") + p(m("ines", "Inès"), " apprend que le bateau a coulé.") },
    { id: "s4", changes: p(m("ines", "Inès"), " tient sa promesse.") },
  ];
  const log = changeLog(scenes, ["s1", "s2", "s3", "s4"]);

  it("suit l'ordre du récit", () => {
    expect(log.map((c) => c.sceneId)).toEqual(["s1", "s1", "s2", "s2", "s3", "s3", "s4"]);
    expect(changeLog(scenes, ["s3", "s1"]).map((c) => c.index)).toEqual([0, 0, 1, 1]);
  });

  it("état d'un personnage à une scène", () => {
    const at2 = stateAt("ines", log, 1);
    expect(at2.place).toEqual({ id: "phare", text: "Le phare" });
    expect(at2.carries.map((c) => c.text)).toEqual(["la clé du phare"]);
    expect(at2.knows).toEqual([]);
    expect(at2.ignores.map((c) => c.text)).toEqual(["que le bateau a coulé"]);
    const at3 = stateAt("ines", log, 2);
    expect(at3.carries).toEqual([]);
    expect(at3.knows.map((k) => k.sceneId)).toEqual(["s3"]);
    expect(at3.ignores).toEqual([]);
  });

  it("qui sait quoi, objets, promesses", () => {
    const rows = whoKnows(log);
    expect(rows).toHaveLength(1);
    expect([...rows[0].learned.entries()]).toEqual([
      ["yann", { index: 0, sceneId: "s1" }],
      ["ines", { index: 2, sceneId: "s3" }],
    ]);
    const objects = objectTracks(log);
    expect(objects.map((o) => [o.text, o.moves.map((mv) => mv.verb)])).toEqual([["la clé du phare", ["recoit", "perd"]]]);
    const kept = promises(log);
    expect(kept).toHaveLength(1);
    expect(kept[0].kept?.sceneId).toBe("s4");
    expect(promises(log.slice(0, 4))[0].kept).toBeNull();
  });
});

describe("faux verbes", () => {
  it("« va mieux » n'est pas un déplacement", () => {
    expect(parseChange(changeLines('<p><span data-mention="a">@Inès</span> va mieux.</p>')[0]).verb).toBeNull();
    expect(parseChange(changeLines('<p><span data-mention="a">@Inès</span> va au port.</p>')[0])).toMatchObject({ verb: "serend", what: "port" });
  });
});

import { cardToFile, fileToCard } from "../storage/markdown";
import { CHANGE_VERBS } from "../changes";

describe("« Ce qui change » sur disque", () => {
  it("une ligne Markdown par changement, mentions comprises, et retour à l'identique", () => {
    const changes = '<p><span data-mention="k3x9a7bq2m">@Inès</span> apprend que <span data-mention="p4t8w2zq1c">@Yann</span> a survécu.</p><p></p><p>Il pleut.</p>';
    const file = cardToFile({ id: "s0s0s0s0s0", type: "scene", title: "Retour", html: "", changes });
    expect(file).toContain('changes: ["[@Inès](cosmos:k3x9a7bq2m) apprend que [@Yann](cosmos:p4t8w2zq1c) a survécu.","Il pleut."]');
    const back = fileToCard(file)!;
    expect(back.changes).toBe('<p><span data-mention="k3x9a7bq2m">@Inès</span> apprend que <span data-mention="p4t8w2zq1c">@Yann</span> a survécu.</p><p>Il pleut.</p>');
    expect(back.keep).toBeUndefined();
    expect(CHANGE_VERBS).toContain("apprend");
  });

  it("une ligne malveillante est nettoyée", () => {
    const card = fileToCard('---\nid: s0s0s0s0s0\ntype: scene\ntitle: "x"\nchanges: ["<img src=x onerror=alert(1)>Inès"]\n---\n')!;
    expect(card.changes).not.toMatch(/onerror|<img/);
  });
});

import { checkChanges, RULE_ORDER } from "../review/checks";
import { parse } from "../screenplay/parse";

describe("Vérifier, d'après « Ce qui change »", () => {
  const cards = [
    { id: "ines", type: "personnage" as const, title: "Inès", html: "" },
    { id: "lettre", type: "idee" as const, title: "La lettre", html: "" },
    { id: "s1", type: "scene" as const, title: "PHARE", html: "" },
    { id: "s2", type: "scene" as const, title: "PORT", html: "" },
  ];
  const elements = parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nINÈS\nJ'ai lu la lettre.\n\nEXT. PORT - JOUR [[cosmos:s2]]\n\nINÈS\nAdieu.\n").elements;
  const log = changeLog(
    [
      { id: "s1", changes: '<p><span data-mention="ines">@Inès</span> promet de revenir.</p>' },
      { id: "s2", changes: '<p><span data-mention="ines">@Inès</span> apprend que <span data-mention="lettre">@La lettre</span> existe.</p>' },
    ],
    ["s1", "s2"],
  );

  it("promesse non tenue et parole avant de savoir", () => {
    const found = checkChanges(log, ["s1", "s2"], cards, elements);
    expect(found.map((f) => f.rule).sort()).toEqual(["speaksBeforeKnowing", "unkeptPromise"]);
    const early = found.find((f) => f.rule === "speaksBeforeKnowing")!;
    expect(early).toMatchObject({ sceneId: "s1", names: ["Inès", "La lettre", "2"] });
    expect(RULE_ORDER).toContain("unkeptPromise");
  });

  it("un roman n'a que les promesses", () => {
    expect(checkChanges(log, ["s1", "s2"], cards).map((f) => f.rule)).toEqual(["unkeptPromise"]);
  });
});

import { buildBiblePack } from "../export/biblePack";
import { defaultsFor } from "../bibleExport";
import { demoProject } from "../demo";
import { fromProject } from "../projectState";
import { bibleOf } from "../export/projectDocs";
import { fr } from "../i18n/fr";

describe("« Au fil du récit » dans les exports", () => {
  const s = fromProject(demoProject());
  const scene = s.nodes.find((n) => n.data.type === "scene" && !n.data.page)!;
  const wolf = s.nodes.find((n) => n.data.type === "personnage")!;
  const nodes = s.nodes.map((n) => (n === scene ? { ...n, data: { ...n.data, changes: `<p><span data-mention="${wolf.id}">@${wolf.data.title}</span> apprend le chemin.</p>` } } : n));
  const src = { ...s, nodes, screenplay: null };
  const ctx = { t: fr, lang: "fr", author: "", date: new Date(2026, 9, 26) };

  it("dans la bible de travail, jamais dans un dossier pour un tiers", () => {
    const moi = buildBiblePack(src, defaultsFor("moi"), ctx);
    expect(JSON.stringify(moi.sections.find((x) => x.part === "pourVous"))).toContain(fr.changes.story);
    const tiers = buildBiblePack(src, { ...defaultsFor("tiers"), parts: ["presentation", "pourVous"] }, ctx);
    expect(JSON.stringify(tiers)).not.toContain(fr.changes.story);
  });

  it("Word et Markdown : seulement avec la partie « Pour vous »", () => {
    const withPrivate = bibleOf(src, ctx, ["personnage", "question"]);
    expect(withPrivate.chapters.at(-1)?.title).toBe(fr.changes.story);
    expect(bibleOf(src, ctx, ["personnage"]).chapters.some((c) => c.title === fr.changes.story)).toBe(false);
  });
});
