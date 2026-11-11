// Extension .mcpb pour Claude Desktop (#62, lot 2).
import { describe, expect, it } from "vitest";
import { commandFromConfig, mcpbManifest, mcpbPlatform } from "../mcpBundle";

describe("extension .mcpb", () => {
  it("manifeste 0.3 qui lance l'exécutable installé avec --mcp, pour ce système seulement", () => {
    const m = JSON.parse(mcpbManifest({ command: "C:\\Users\\Seb\\AppData\\Local\\MondoWrite\\MondoWrite.exe", version: "1.32.0", platform: "win32", description: "d" }));
    expect(m.manifest_version).toBe("0.3");
    expect(m.name).toBe("mondowrite");
    expect(m.version).toBe("1.32.0");
    expect(m.server).toEqual({ type: "binary", entry_point: "C:\\Users\\Seb\\AppData\\Local\\MondoWrite\\MondoWrite.exe", mcp_config: { command: "C:\\Users\\Seb\\AppData\\Local\\MondoWrite\\MondoWrite.exe", args: ["--mcp"] } });
    expect(m.compatibility.platforms).toEqual(["win32"]);
    for (const key of ["manifest_version", "name", "version", "description", "author", "server"]) expect(m).toHaveProperty(key);
  });

  it("version douteuse : une version valide quand même", () => {
    expect(JSON.parse(mcpbManifest({ command: "/x", version: "dev", platform: "linux", description: "d" })).version).toBe("1.0.0");
  });

  it("système et commande", () => {
    expect(mcpbPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("win32");
    expect(mcpbPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("darwin");
    expect(mcpbPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(commandFromConfig('{"mcpServers":{"mondowrite":{"command":"/Applications/MondoWrite.app/Contents/MacOS/MondoWrite","args":["--mcp"]}}}')).toBe("/Applications/MondoWrite.app/Contents/MacOS/MondoWrite");
    expect(commandFromConfig("{}")).toBeNull();
    expect(commandFromConfig("nope")).toBeNull();
  });
});
