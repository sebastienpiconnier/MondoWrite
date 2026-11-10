// Évite une fenêtre console supplémentaire sous Windows en version publiée. NE PAS SUPPRIMER.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Assistant externe (#62) : lancé par un client MCP avec `--mcp`, l'exécutable sert le protocole sur l'entrée et
    // la sortie standard, sans fenêtre ni Tauri (docs/plan-mcp.md).
    if std::env::args().skip(1).any(|a| a == "--mcp") {
        cosmos_lib::mcp::serve();
        return;
    }
    cosmos_lib::run();
}