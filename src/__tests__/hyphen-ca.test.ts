// Césure du catalan (#97) : règles de l'IEC, écrites pour MondoWrite (export/hyphenRules/ca.ts).

import { describe, expect, it } from "vitest";
import { hyphenateCatalan, hyphenateSync } from "../export/hyphenRules/ca";
import { DEFAULT_PRINT, hyphenateBook, hyphenateRuns, layoutPaperback, type BookStrings } from "../export/paperback";

const strings: BookStrings = {
  copyright: "Copyright © {year} {name}",
  rights: "",
  reproduction: "",
  fiction: "",
  isbn: "ISBN {isbn}",
  contents: "Índex",
  thanksTitle: "",
  thanksText: "",
  stayInTouch: "",
  website: "",
  newsletter: "",
  alsoBy: "",
};

const split = (word: string) => hyphenateCatalan(word, "-");

describe("césure du catalan", () => {
  it("suit la syllabe : consonnes, groupes et digrammes", () => {
    const cases: Record<string, string> = {
      escriptura: "es-crip-tu-ra",
      inspiració: "ins-pi-ra-ció",
      subratllar: "su-brat-llar",
      ambdós: "amb-dós",
      guerra: "guer-ra",
      programa: "pro-gra-ma",
      muntanya: "mun-ta-nya",
      casa: "ca-sa",
      partir: "par-tir",
      passar: "pas-sar",
      cotxe: "cot-xe",
      metge: "met-ge",
      setze: "set-ze",
      atles: "at-les",
      redreçar: "re-dre-çar",
      transport: "trans-port",
      constrènyer: "cons-trè-nyer",
      enllaçar: "en-lla-çar",
      callem: "ca-llem",
      enganyós: "en-ga-nyós",
      esguerra: "es-guer-ra",
      enquesta: "en-ques-ta",
      quaranta: "qua-ran-ta",
      perquè: "per-què",
      examen: "e-xa-men",
      prohibir: "pro-hi-bir",
      enciclopèdia: "en-ci-clo-pè-dia",
    };
    for (const [word, expected] of Object.entries(cases)) expect(split(word), word).toBe(expected);
  });

  it("garde les diphtongues, coupe les hiatus forts", () => {
    const cases: Record<string, string> = {
      aire: "ai-re",
      aigua: "ai-gua",
      ciutat: "ciu-tat",
      cuina: "cui-na",
      feina: "fei-na",
      diumenge: "diu-men-ge",
      iogurt: "io-gurt",
      noia: "no-ia",
      poeta: "po-e-ta",
      teatre: "te-a-tre",
      veïna: "ve-ï-na",
      pingüí: "pin-güí",
      seqüència: "se-qüèn-cia",
      lingüística: "lin-güís-ti-ca",
      guix: "guix",
      // Hiatus après un i ou un u sans accent : juste, mais jamais coupé (se lit mal).
      ciència: "cièn-cia",
      història: "his-tò-ria",
    };
    for (const [word, expected] of Object.entries(cases)) expect(split(word), word).toBe(expected);
  });

  it("coupe l'ela geminada à la place du point", () => {
    expect(split("col·legi")).toBe("col·-le-gi");
    expect(split("novel·la")).toBe("no-vel·-la");
    expect(split("il·lusió")).toBe("il·-lu-sió");
  });

  it("ne touche pas aux mots courts et garde le point médian", () => {
    expect(hyphenateSync("Era al col·legi amb la novel·la.", { hyphenChar: "-" })).toBe("Era al col·-le-gi amb la no-vel·-la.");
    expect(hyphenateSync("casa", { hyphenChar: "-" })).toBe("casa");
  });

  it("le livre broché garde le point tant que le mot n'est pas coupé, et le retire à la coupure", () => {
    const hy = (w: string) => hyphenateSync(w);
    const [run] = hyphenateRuns([{ text: "Era al col·legi amb la novel·la i la seva germana." }], hy, "·");
    // Mot entier : le point est toujours là (les coupures sont invisibles).
    expect(run.text.replace(/­/g, "")).toBe("Era al col·legi amb la novel·la i la seva germana.");
    expect(run.text).toContain("col·­le");
    // Mis en page : jamais « col·- » en bout de ligne, le point tombe à la coupure.
    const text = Array(40).fill("Els alumnes del col·legi llegien una novel·la il·lustrada al pati.").join(" ");
    const layout = layoutPaperback(
      hyphenateBook({ title: "T", author: "A", lang: "ca", year: 2026, sections: [{ kind: "chapter", label: "1", title: "", toc: "1", blocks: [{ kind: "paragraph", runs: [{ text }] }] }] }, hy, "·"),
      { ...DEFAULT_PRINT },
      strings,
      { width: (s, _f, size) => [...s].length * size * 0.5, capHeight: 0.65 },
    );
    const texts = layout.pages.flatMap((p) => p.texts.map((t) => t.text));
    expect(texts.some((t) => t.includes("·-"))).toBe(false);
    expect(texts.some((t) => /l-$/.test(t))).toBe(true);
  });
});
