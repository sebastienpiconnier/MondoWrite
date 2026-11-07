// @vitest-environment happy-dom
// Lot 4, #20 : objectifs d'écriture plus fins (échéance, séance, scène, chapitre).

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { chapterWords, dailyTarget, daysLeft, hasGoals, readGoals, reach, sessionWords, validDay } from "../stats";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const state = () => useCosmos.getState();
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10);

describe("readGoals", () => {
  it("ne garde que des nombres positifs et une date valide", () => {
    expect(readGoals({ daily: 500, total: -1, session: "x", scene: 800.4, deadline: "2027-03-01", bogus: 1 })).toEqual({ daily: 500, scene: 800, deadline: "2027-03-01" });
    expect(readGoals({ deadline: "demain" })).toEqual({});
    expect(readGoals(null)).toEqual({});
    expect(hasGoals({})).toBe(false);
    expect(hasGoals({ session: 300 })).toBe(true);
  });
  it("validDay refuse les dates impossibles", () => {
    expect(validDay("2027-02-30")).toBe(false);
    expect(validDay("2027-02-28")).toBe(true);
    expect(validDay(12)).toBe(false);
  });
});

describe("échéance et objectif du jour", () => {
  it("jours restants, aujourd'hui compris", () => {
    expect(daysLeft("2026-11-10", day(2026, 11, 7))).toBe(4);
    expect(daysLeft("2026-11-07", day(2026, 11, 7))).toBe(1);
    expect(daysLeft("2026-11-06", day(2026, 11, 7))).toBe(0);
  });
  it("répartit ce qui reste sur les jours qui restent", () => {
    const t = dailyTarget({ total: 10000, deadline: "2026-11-10" }, 2000, day(2026, 11, 7));
    expect(t).toEqual({ words: 2000, fromDeadline: true, days: 4 });
  });
  it("dernier jour, échéance passée, sans objectif du livre", () => {
    expect(dailyTarget({ total: 1000, deadline: "2026-11-07" }, 400, day(2026, 11, 7)).words).toBe(600);
    expect(dailyTarget({ total: 1000, deadline: "2026-11-01" }, 400, day(2026, 11, 7))).toMatchObject({ late: true, words: 600 });
    expect(dailyTarget({ total: 1000, deadline: "2026-11-01" }, 1200, day(2026, 11, 7)).late).toBe(false);
    expect(dailyTarget({ daily: 300, deadline: "2026-11-10" }, 0, day(2026, 11, 7))).toEqual({ words: 300, fromDeadline: false });
  });
});

describe("séance, cibles et chapitres", () => {
  it("mots de la séance, jamais négatifs", () => {
    expect(sessionWords(null, 500)).toBe(0);
    expect(sessionWords(100, 340)).toBe(240);
    expect(sessionWords(100, 40)).toBe(0);
  });
  it("part atteinte", () => {
    expect(reach(10, undefined)).toBeNull();
    expect(reach(50, 200)).toEqual({ pct: 25, reached: false });
    expect(reach(250, 200)).toEqual({ pct: 100, reached: true });
  });
  it("mots par chapitre", () => {
    const per = new Map([["a", 10], ["b", 5], ["c", 7]]);
    const m = chapterWords(["a", "b", "c", "d"], per, (id) => (id === "d" ? undefined : id === "c" ? "ch2" : "ch1"));
    expect(m.get("ch1")).toBe(15);
    expect(m.get("ch2")).toBe(7);
    expect(m.size).toBe(2);
  });
});

describe("dans le store", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [], sessionStart: null });
    await state().start();
    await state().createProject({ title: "Phare", kind: "roman" });
  });
  it("la séance démarre à la première modification et se remet à zéro", () => {
    expect(state().sessionStart).toBeNull();
    state().setManuscriptText("s1", "<p>un deux trois</p>");
    expect(state().sessionStart).toBe(0);
    state().setManuscriptText("s1", "<p>un deux trois quatre cinq</p>");
    expect(state().sessionStart).toBe(0);
    state().resetSession();
    expect(state().sessionStart).toBeNull();
  });
  it("les objectifs font l'aller-retour dans le projet, sans clé inutile", async () => {
    useCosmos.setState({ goals: { total: 5000, deadline: "2027-01-01", session: 300 } });
    const { toProject } = await import("../projectState");
    const meta = toProject(state() as never).meta as unknown as Record<string, unknown>;
    expect((meta as { goals?: unknown }).goals).toEqual({ total: 5000, deadline: "2027-01-01", session: 300 });
    useCosmos.setState({ goals: {} });
    const bare = toProject(state() as never).meta as unknown as Record<string, unknown>;
    expect("goals" in bare).toBe(false);
  });
});

describe("textes", () => {
  it("le français et l'anglais ont les mêmes clés d'objectifs", () => {
    expect(Object.keys(en.stats).sort()).toEqual(Object.keys(fr.stats).sort());
  });
});
