// Phrase d'accueil de la page des projets : selon l'heure, le prénom et le dernier projet ouvert.

import { describe, expect, it } from "vitest";
import { dayPart, greeting } from "../greeting";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import type { ProjectEntry } from "../storage/recents";

const g = fr.home.greeting;
const at = (d: string) => new Date(d);
const project = (title: string, openedAt: number): ProjectEntry => ({ id: title, name: title, title, openedAt });

describe("phrase d'accueil", () => {
  it("le moment de la journée", () => {
    expect([4, 5, 11, 12, 17, 18, 22, 23].map(dayPart)).toEqual(["night", "morning", "morning", "afternoon", "afternoon", "evening", "evening", "night"]);
  });

  it("le prénom s'il est connu, sinon un bonjour sans nom ; la même phrase tout le moment", () => {
    const morning = at("2026-10-30T09:15:00");
    const named = greeting(g, morning, "Sébastien", []);
    expect(named).toContain("Sébastien");
    expect(g.first.some((f) => named.endsWith(f))).toBe(true);
    expect(greeting(g, at("2026-10-30T11:40:00"), "Sébastien", [])).toBe(named);
    const anon = greeting(g, morning, "  ", []);
    expect(anon).not.toContain("{name}");
    expect(g.helloAnon.morning.some((h) => anon.startsWith(h))).toBe(true);
  });

  it("reprend le dernier projet ouvert, et dit depuis combien de jours", () => {
    const now = at("2026-10-30T15:00:00");
    const recent = project("Le Chien des Baskerville", at("2026-10-29T21:00:00").getTime());
    const older = project("Monte-Cristo", at("2026-10-20T10:00:00").getTime());
    const text = greeting(g, now, "Sébastien", [older, recent]);
    // Hier : on propose de reprendre le dernier, ou on invite à écrire.
    expect(text.includes("Le Chien des Baskerville") || g.free.some((f) => text.endsWith(f))).toBe(true);
    expect(text).not.toContain("Monte-Cristo");
    const away = greeting(g, now, "", [older]);
    expect(away).toContain("Monte-Cristo");
    expect(g.back.map((b) => b.replace("{title}", "Monte-Cristo").replace("{days}", "10"))).toContain(away.slice(away.indexOf(" ") + 1).replace(/^[^.?]*[.?] /, ""));
  });

  it("aujourd'hui, la nuit, jamais ouvert : chaque cas a sa tournure", () => {
    const today = project("Le phare", at("2026-10-30T08:00:00").getTime());
    expect(g.again.some((a) => greeting(g, at("2026-10-30T15:00:00"), "", [today]).endsWith(a.replace("{title}", "Le phare")))).toBe(true);
    const night = greeting(g, at("2026-10-30T23:30:00"), "", [today]);
    expect(g.night.some((n) => night.endsWith(n.replace("{title}", "Le phare")))).toBe(true);
    const never = greeting(g, at("2026-10-30T15:00:00"), "", [project("Nouveau", 0)]);
    expect(g.free.some((f) => never.endsWith(f))).toBe(true);
  });

  it("un titre trop long est coupé ; l'anglais a les mêmes cas", () => {
    const long = project("Un titre de roman beaucoup trop long pour tenir dans une phrase courte", at("2026-10-30T08:00:00").getTime());
    const text = greeting(g, at("2026-10-30T15:00:00"), "", [long]);
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(110);
    for (const key of Object.keys(g) as (keyof typeof g)[]) {
      const a = g[key];
      const b = en.home.greeting[key];
      expect(Array.isArray(a) ? (b as string[]).length : Object.keys(b).length).toBe(Array.isArray(a) ? a.length : Object.keys(a).length);
    }
    expect(greeting(en.home.greeting, at("2026-10-30T19:00:00"), "Sam", [])).toMatch(/Sam/);
  });
});
