// latest.json : toutes les plateformes signées, adresses de téléchargement de la Release.

import { describe, expect, it } from "vitest";
import { buildLatest } from "./updater-json.mjs";

describe("latest.json", () => {
  const files = [
    "Cosmos_0.1.6_aarch64.dmg",
    "Cosmos_aarch64.app.tar.gz",
    "Cosmos_aarch64.app.tar.gz.sig",
    "Cosmos_x64.app.tar.gz",
    "Cosmos_x64.app.tar.gz.sig",
    "Cosmos_0.1.6_x64-setup.exe",
    "Cosmos_0.1.6_x64-setup.exe.sig",
    "Cosmos_0.1.6_x64_en-US.msi",
    "Cosmos_0.1.6_amd64.AppImage",
    "Cosmos_0.1.6_amd64.AppImage.sig",
  ];
  const signatures = { "Cosmos_aarch64.app.tar.gz": "A\n", "Cosmos_x64.app.tar.gz": "B", "Cosmos_0.1.6_x64-setup.exe": "C", "Cosmos_0.1.6_amd64.AppImage": "D" };

  it("Mac (deux puces), Windows (installeur .exe), Linux ; rien pour un fichier sans signature", () => {
    const latest = buildLatest({ version: "v0.1.6", notes: "n", date: "2026-10-11T00:00:00Z", repo: "o/cosmos", tag: "v0.1.6", files, signatures });
    expect(latest.version).toBe("0.1.6");
    expect(Object.keys(latest.platforms).sort()).toEqual(
      ["darwin-aarch64", "darwin-aarch64-app", "darwin-x86_64", "darwin-x86_64-app", "linux-x86_64", "linux-x86_64-appimage", "windows-x86_64", "windows-x86_64-nsis"].sort(),
    );
    expect(latest.platforms["darwin-aarch64"]).toEqual({ signature: "A", url: "https://github.com/o/cosmos/releases/download/v0.1.6/Cosmos_aarch64.app.tar.gz" });
    expect(latest.platforms["windows-x86_64"].url).toMatch(/Cosmos_0\.1\.6_x64-setup\.exe$/);
  });
});
