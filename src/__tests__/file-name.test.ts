import { describe, expect, it } from "vitest";
import { fileName } from "../screenplay/export";

describe("fileName", () => {
  it("remplace les virgules par un tiret", () => {
    expect(fileName("Le Petit Chaperon rouge, version 2", "x")).toBe("Le Petit Chaperon rouge - version 2");
    expect(fileName("A,B", "x")).toBe("A - B");
    expect(fileName("A,, B,", "x")).toBe("A - B");
  });
  it("garde le comportement de base", () => {
    expect(fileName("a/b: c?", "x")).toBe("a b c");
    expect(fileName("  ", "defaut")).toBe("defaut");
  });
});
