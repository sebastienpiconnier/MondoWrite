// Assistant externe par MCP, écriture (#62, lot 3) : branche les demandes du serveur sur le store. Chargé à la
// demande par la boucle de `startMcpBridge` (mcp.ts), seulement quand une demande arrive.

import { getT } from "./i18n";
import { publishOpenProject, useCosmos } from "./store";
import { storage } from "./storage";
import { useSettings } from "./settings";
import { mcpWritable } from "./mcp";
import { buildMcpSnapshot } from "./mcpSnapshot";
import { applyMcpRequest, type McpAnswer, type McpRequest, type McpStore } from "./mcpWrite";

/** Le store vu par `applyMcpRequest`. */
function mcpStore(): McpStore {
  const s = () => useCosmos.getState();
  return {
    kind: s().kind,
    cards: () => s().nodes.map((n) => n.data),
    screenplay: () => s().screenplay,
    manuscript: () => s().manuscript,
    scenes: () => {
      const st = s();
      return buildMcpSnapshot({ title: st.title, kind: st.kind, nodes: st.nodes, edges: st.edges, plan: st.plan, manuscript: st.manuscript, screenplay: st.screenplay, pitch: st.pitch }, getT(), new Date(), "").scenes.map(({ n, id, title }) => ({ n, id, title }));
    },
    batch: (fn) => s().externalEdit(fn),
    addTitledCard: (type, title) => s().addTitledCard(type, title),
    updateCard: (id, patch) => s().updateCard(id, patch),
    linkCards: (a, b, label) => s().linkCards(a, b, label),
    addQuestionAbout: (title, ids) => s().addQuestionAbout(title, ids),
    setManuscriptText: (id, html) => s().setManuscriptText(id, html),
    setScreenplay: (sp, undoable) => s().setScreenplay(sp, undoable),
    keepVersion: (id, title) => s().keepVersion(id, title),
    log: (target, words, client) => s().logAtelier("external", target, words, { service: "MCP", model: client }),
  };
}

/** Une demande reçue (JSON du fichier de la file) → sa réponse. Jamais d'écriture si l'accès a été retiré entre-temps. */
export async function applyRaw(raw: string, projectId: string): Promise<{ id: string | null; answer: McpAnswer }> {
  let req: McpRequest;
  try {
    req = JSON.parse(raw) as McpRequest;
  } catch {
    return { id: null, answer: { ok: false, text: "Demande illisible." } };
  }
  const id = typeof req.id === "string" ? req.id : null;
  const st = useCosmos.getState();
  if (st.screen !== "project" || storage.current?.() !== projectId || !mcpWritable(useSettings.getState().mcp, projectId)) {
    return { id, answer: { ok: false, text: "Le projet n'est plus ouvert en écriture dans MondoWrite : rien n'a été écrit." } };
  }
  try {
    const answer = await applyMcpRequest(req, mcpStore(), getT());
    // L'IA relit aussitôt ce qu'elle vient d'écrire : l'instantané suit sans attendre l'enregistrement.
    if (answer.ok) publishOpenProject(true);
    return { id, answer };
  } catch (err) {
    console.error(err);
    return { id, answer: { ok: false, text: "Erreur dans MondoWrite : rien n'a été écrit, ou seulement en partie." } };
  }
}
