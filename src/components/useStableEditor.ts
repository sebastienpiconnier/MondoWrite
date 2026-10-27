// useEditor de TipTap, sans reconfiguration à chaque rendu.
//
// À chaque rendu, useEditor compare les options reçues à celles de l'éditeur et, au moindre écart, appelle
// setOptions : ProseMirror retire puis remet tous ses écouteurs du DOM et redessine son état. Or les options
// sont recréées à chaque rendu (tableau d'extensions, objet editorProps, contenu) : chaque rendu d'une carte,
// d'une fiche ou de la feuille reconfigurait donc son éditeur. Avec 400 cartes, l'ouverture d'un projet prenait
// plusieurs secondes de plus, et chaque déplacement ou sélection en payait aussi le prix.
//
// Ici, une fois l'éditeur créé, on lui rend ses propres options (sauf les fonctions on…, que TipTap relaie
// toujours vers celles du dernier rendu) : la comparaison est égale, rien n'est refait. Ce qui doit changer
// ensuite (langue, titre, correcteur) passe par les effets des composants, qui appellent setOptions eux-mêmes.

import { useEditor, type Editor, type UseEditorOptions } from "@tiptap/react";
import { useRef } from "react";

/** Mêmes surcharges que useEditor (avec `immediatelyRender: true`, l'éditeur n'est jamais null). */
export const useStableEditor = ((options: UseEditorOptions) => {
  const ref = useRef<Editor | null>(null);
  const current = ref.current;
  let passed = options;
  if (current && !current.isDestroyed) {
    const own = current.options as unknown as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...options };
    for (const [key, value] of Object.entries(options)) if (typeof value !== "function") merged[key] = own[key];
    passed = merged as UseEditorOptions;
  }
  const editor = useEditor(passed);
  ref.current = editor;
  return editor;
}) as typeof useEditor;
