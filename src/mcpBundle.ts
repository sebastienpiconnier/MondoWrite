// Extension pour Claude Desktop (#62, lot 2) : un paquet .mcpb (MCP Bundle, anciennement .dxt), soit un zip qui ne
// contient que son manifest.json. Il ne copie pas MondoWrite : sa commande est l'exécutable installé sur cet
// ordinateur, lancé avec --mcp, comme « Connecter à Claude Desktop ». Un double-clic sur le fichier l'installe dans
// Claude Desktop (Réglages › Extensions), sans toucher à claude_desktop_config.json. Fonction pure, testée.
// Format : https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md (manifest_version 0.3).

export type McpbPlatform = "darwin" | "win32" | "linux";

export interface McpbInput {
  /** Exécutable de MondoWrite sur cet ordinateur (l'AppImage sous Linux). */
  command: string;
  /** Version de l'app (package.json). */
  version: string;
  platform: McpbPlatform;
  description: string;
}

/** Système de cet ordinateur, lu dans le navigateur de l'app. */
export function mcpbPlatform(userAgent: string): McpbPlatform {
  if (/Windows/i.test(userAgent)) return "win32";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "darwin";
  return "linux";
}

export function mcpbManifest({ command, version, platform, description }: McpbInput): string {
  const manifest = {
    manifest_version: "0.3",
    name: "mondowrite",
    display_name: "MondoWrite",
    version: /^\d+\.\d+\.\d+$/.test(version) ? version : "1.0.0",
    description,
    author: { name: "Sébastien Piconnier", url: "https://mondowrite.app" },
    homepage: "https://mondowrite.app",
    repository: { type: "git", url: "https://github.com/sebastienpiconnier/MondoWrite" },
    license: "AGPL-3.0-or-later",
    server: {
      type: "binary",
      entry_point: command,
      mcp_config: { command, args: ["--mcp"] },
    },
    // Le chemin ne vaut que pour cet ordinateur : le paquet ne s'installe que sur ce système.
    compatibility: { platforms: [platform] },
    tools_generated: true,
    prompts_generated: true,
  };
  return JSON.stringify(manifest, null, 2);
}

/** Commande lue dans la configuration rendue par `mcp_client_config` (`mcpServers.mondowrite.command`). */
export function commandFromConfig(config: string): string | null {
  try {
    const command = (JSON.parse(config) as { mcpServers?: { mondowrite?: { command?: unknown } } }).mcpServers?.mondowrite?.command;
    return typeof command === "string" && command.trim() ? command : null;
  } catch {
    return null;
  }
}
