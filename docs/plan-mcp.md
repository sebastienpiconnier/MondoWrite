# Assistant externe par MCP (#62, lot 11)

> **Statut : lot 1 presque fait** (novembre 2026) : reste le guide, et l'essai avec Claude Desktop sur Mac et Windows. Lecture seule.

L'assistant IA de l'auteur (Claude Desktop, ou tout client MCP) lit un projet MondoWrite par un serveur MCP local.
Aucune clé d'API dans MondoWrite : l'auteur utilise l'abonnement qu'il a déjà, ou un modèle local. Sens unique : le
client appelle MondoWrite, jamais l'inverse (pas de « sampling »).

## Décisions

1. **Pas de second exécutable.** C'est l'exécutable de MondoWrite lui-même, lancé avec `--mcp`, qui sert le
   protocole sur l'entrée et la sortie standard (transport stdio), sans ouvrir de fenêtre (`main.rs` : avant Tauri).
   Rien à ajouter aux installeurs (un « sidecar » de Tauri demande un binaire par cible), et le chemin à donner au
   client est celui de l'app installée (`std::env::current_exe`). Protocole écrit à la main avec `serde_json`
   (JSON-RPC 2.0 : `initialize`, `ping`, `tools/list`, `tools/call`), sans SDK ni runtime asynchrone : quelques
   centaines de lignes, aucune dépendance de plus.
2. **Le serveur ne lit jamais le dossier du projet.** L'app écrit, après chaque enregistrement réussi, un
   **instantané** du projet pour l'IA, dans son dossier privé : `$APPDATA/mcp/<backupKey(id)>.json`, et la liste des
   projets ouverts à l'IA : `$APPDATA/mcp/projets.json`. Toute la logique de MondoWrite (ordre du livre, chapitres,
   épisodes, Fountain, fiches) reste en TypeScript, au même endroit que les exports ; le Rust ne fait que lire du JSON.
   L'instantané suit l'écran à l'enregistrement près (800 ms), et reste lisible app fermée. Même précédent que les
   sauvegardes hors du projet (#14) : une copie du texte dans le dossier privé de l'app.
3. **Rien sans l'accord de l'auteur, projet par projet.** Réglage de l'appareil `mcp` (`enabled`, désactivé par
   défaut ; `projects` : identifiant du projet → `"read"`). Ni le format du projet ni `cosmos.json` ne changent.
   Couper l'accès (général ou d'un projet) retire aussitôt son instantané et sa ligne de `projets.json`.
4. **Des outils ciblés**, pour ménager les limites d'usage de l'abonnement : jamais « tout le manuscrit » d'un coup
   par défaut. Les réponses sont du Markdown lisible, titres des cartes en clair, identifiants en plus pour enchaîner.
5. **Ordinateur seulement** (macOS, Windows, Linux) : rien sur iOS ni Android, ni dans le navigateur.
6. **Écriture (lot 3)** : plus tard, par un pont vers l'app ouverte (port local), avec les règles du mode Atelier
   (marque « IA », `ia-journal.md`, annulation). Jamais d'écriture directe dans les fichiers par le serveur.

## Instantané (`McpSnapshot`, `src/mcpSnapshot.ts`, pur et testé)

```json
{
  "format": 1, "app": "1.28.0", "savedAt": "2026-11-09T17:40:00.000Z",
  "project": { "title": "…", "kind": "roman", "logline": "…", "resume": "…" },
  "scenes": [{ "n": 1, "id": "k3x…", "title": "…", "part": "Chapitre 2", "synopsis": "…", "status": "brouillon",
               "pov": "Inès Morvan", "words": 1234, "text": "Markdown ou Fountain" }],
  "cards": [{ "id": "…", "type": "personnage", "typeLabel": "Personnage", "title": "…", "fiche": { "Âge": "34 ans" },
              "notes": "Markdown", "links": [{ "id": "…", "title": "…", "label": "aime" }] }]
}
```

Scènes : roman dans l'ordre du livre (`bookOrder`, pages hors récit comprises), texte en Markdown
(`htmlToMarkdown`) ; scénario dans l'ordre du Fountain (`listScenes`, sans les scènes omises), corps en Fountain,
`part` = épisode (« S1 · Ép. 2 · Titre ») s'il y en a. Fiches : libellés en clair dans la langue de l'interface.
Libellés de types par `vocab` (Décor dans un scénario).

## Outils du serveur (lot 1)

| Outil | Rôle |
|---|---|
| `list_projects` | Projets ouverts à l'IA : titre, type, dernier enregistrement |
| `project_overview` | Titre, logline, résumé, nombre de mots ou de scènes, table des scènes (numéro, titre, partie, synopsis, statut, point de vue) |
| `read_scene` | Texte d'une ou plusieurs scènes (numéro, identifiant ou titre) |
| `list_cards` | Cartes du projet par type (personnages, lieux…) |
| `read_card` | Fiche d'une carte : champs, notes, cartes reliées, scènes où elle est citée |
| `search` | Recherche sans casse ni accents dans les scènes et les cartes, avec le contexte |

Chaque outil prend `project` (titre ou identifiant) ; s'il n'y a qu'un projet ouvert à l'IA, il est facultatif.

## Lots

### Lot 1 · Lecture seule (en cours)

- [x] `mcpSnapshot.ts` (pur, testé) et écriture après chaque enregistrement (`publishOpenProject`, commande `mcp_publish`)
- [x] mode `--mcp` de l'exécutable (`src-tauri/src/mcp.rs`), tests Rust du protocole et des outils ; essayé de bout en bout sous Linux (binaire de dev)
- [x] Réglages › IA : « Autoriser un assistant externe (MCP) », « Connecter à Claude Desktop » (commande
      `mcp_connect_claude` : ajoute l'entrée `mondowrite` à `claude_desktop_config.json`, garde le reste),
      « Copier la configuration » ; Réglages › Ce projet : accès Aucun / Lecture
- [ ] guide de l'utilisateur (fr, en, es)

### Lot 2 · Confort

- [ ] pastille dans la barre d'état quand un assistant a lu le projet récemment (horodatage écrit par le serveur),
      qui coupe l'accès d'un geste
- [ ] paquet installable en un clic pour Claude Desktop (format à vérifier)
- [ ] Windows : vérifier que l'exécutable sans console (`windows_subsystem`) reçoit bien les tubes du client

### Lot 3 · Écriture

- [ ] pont vers l'app ouverte (port local `127.0.0.1`, jeton dans le dossier privé), accès « Écriture »
- [ ] mêmes règles que le mode Atelier : marque, journal, annulation, rien sans que l'auteur le voie

## Pièges

- `--mcp` doit passer **avant** `tauri::Builder` : sinon une fenêtre s'ouvre et le verrou du projet est pris.
- La sortie standard est réservée au protocole : aucun `println!` ni journal dessus (journal sur stderr).
- Dossier privé de l'app sans Tauri : même calcul que `app_data_dir` (`data_dir()/app.cosmos.ecriture` :
  `~/Library/Application Support` sur Mac, `%APPDATA%` sous Windows, `$XDG_DATA_HOME` ou `~/.local/share` sous Linux).
