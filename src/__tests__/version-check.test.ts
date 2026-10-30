// Le numéro de version est le même aux six endroits ; la Release refuse une étiquette qui n'est pas ce numéro.
import { describe, expect, it } from "vitest";
// @ts-expect-error script Node sans déclaration de types
import { versionProblems, versionsInRepo } from "../../scripts/check-version.mjs";

describe("numéro de version", () => {
  it("est le même dans package.json, tauri.conf.json, Cargo.toml, Cargo.lock et les deux README", () => {
    expect(versionProblems(versionsInRepo())).toEqual([]);
  });

  it("une étiquette qui ne correspond pas à la version de l'app est refusée", () => {
    const versions = versionsInRepo();
    const v = versions["package.json"];
    expect(versionProblems(versions, `v${v}`)).toEqual([]);
    expect(versionProblems(versions, "v99.0.0")).toHaveLength(1);
    expect(versionProblems({ ...versions, "README.md": "0.0.1" })).toHaveLength(1);
  });
});
