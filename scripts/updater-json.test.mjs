// latest.json : toutes les plateformes signées, adresses de téléchargement de la Release.

import { describe, expect, it } from "vitest";
import { buildLatest } from "./updater-json.mjs";

describe("latest.json", () => {
  const files = [
    "MondoWrite_0.1.6_aarch64.dmg",
    "MondoWrite_aarch64.app.tar.gz",
    "MondoWrite_aarch64.app.tar.gz.sig",
    "MondoWrite_x64.app.tar.gz",
    "MondoWrite_x64.app.tar.gz.sig",
    "MondoWrite_0.1.6_x64-setup.exe",
    "MondoWrite_0.1.6_x64-setup.exe.sig",
    "MondoWrite_0.1.6_x64_en-US.msi",
    "MondoWrite_0.1.6_amd64.AppImage",
    "MondoWrite_0.1.6_amd64.AppImage.sig",
  ];
  const signatures = { "MondoWrite_aarch64.app.tar.gz": "A\n", "MondoWrite_x64.app.tar.gz": "B", "MondoWrite_0.1.6_x64-setup.exe": "C", "MondoWrite_0.1.6_amd64.AppImage": "D" };

  it("Mac (deux puces), Windows (installeur .exe), Linux ; rien pour un fichier sans signature", () => {
    const latest = buildLatest({ version: "v0.1.6", notes: "n", date: "2026-10-11T00:00:00Z", repo: "o/cosmos", tag: "v0.1.6", files, signatures });
    expect(latest.version).toBe("0.1.6");
    expect(Object.keys(latest.platforms).sort()).toEqual(
      ["darwin-aarch64", "darwin-aarch64-app", "darwin-x86_64", "darwin-x86_64-app", "linux-x86_64", "linux-x86_64-appimage", "windows-x86_64", "windows-x86_64-nsis"].sort(),
    );
    expect(latest.platforms["darwin-aarch64"]).toEqual({ signature: "A", url: "https://github.com/o/cosmos/releases/download/v0.1.6/MondoWrite_aarch64.app.tar.gz" });
    expect(latest.platforms["windows-x86_64"].url).toMatch(/MondoWrite_0\.1\.6_x64-setup\.exe$/);
  });
});
