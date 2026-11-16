// Bloc des choix d'une scène (roman interactif, lot 2) : nœud TipTap des éditeurs de prose. Dans le texte, un
// encadré « Choix » (une ligne par choix : texte et destination) ; dans le fichier, le bloc ```choix (voir
// interactive/choices.ts). Le nœud garde le texte du bloc tel quel : une ligne qu'il ne sait pas lire ne se perd pas.

import { Node } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { fmt, getT } from "../i18n";
import { SCENE_MARK } from "../bookDoc";
import { END_TARGET, cleanLabel, editChoice, parseChoices, resolveTarget, serializeChoices, type ChoiceLine } from "../interactive/choices";
import { interactiveScenes, interactiveSlugs } from "../interactive/scenes";
import { condFromValue, condValue, givenFact, otherEffects, withGiven, type Fact } from "../interactive/facts";
import { projectFacts } from "../interactive/projectFacts";
import { useCosmos } from "../store";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    sceneChoices: {
      /** Ajoute un choix à la scène du curseur (crée son bloc en fin de scène s'il n'y en a pas). */
      addChoice: () => ReturnType;
    };
  }
}

/**
 * Scène qui contient `pos` : du repère qui la précède (ou du début du document, dans l'éditeur d'une seule scène)
 * au repère suivant (ou à la fin). Rend la fin et son bloc de choix s'il en a un.
 */
function sceneEnd(doc: PMNode, pos: number): { end: number; block: { pos: number; node: PMNode } | null } {
  const children: { node: PMNode; at: number }[] = [];
  doc.forEach((node, at) => children.push({ node, at }));
  let start = 0;
  let end = doc.content.size;
  for (const c of children) {
    if (c.node.type.name !== SCENE_MARK) continue;
    if (c.at <= pos) start = c.at;
    else {
      end = c.at;
      break;
    }
  }
  const block = children.filter((c) => c.at >= start && c.at < end && c.node.type.name === "sceneChoices").pop();
  return { end, block: block ? { pos: block.at, node: block.node } : null };
}

export const SceneChoices = Node.create({
  name: "sceneChoices",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (el: HTMLElement) => (el.textContent ?? "").replace(/\n+$/, ""),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'pre[data-choices="true"]', priority: 60 }];
  },
  renderHTML({ node }) {
    return ["pre", { "data-choices": "true" }, String(node.attrs.text ?? "")];
  },
  addCommands() {
    return {
      addChoice:
        () =>
        ({ state, dispatch }) => {
          const { end, block } = sceneEnd(state.doc, state.selection.from);
          const row = `* [] -> ${END_TARGET}`;
          if (!dispatch) return true;
          if (block) {
            const text = String(block.node.attrs.text ?? "");
            dispatch(state.tr.setNodeMarkup(block.pos, undefined, { text: text ? `${text}\n${row}` : row }));
          } else {
            dispatch(state.tr.insert(end, state.schema.nodes.sceneChoices.create({ text: row })).scrollIntoView());
          }
          // Le nouveau choix prend le focus (texte vide) : l'auteur l'écrit tout de suite.
          requestAnimationFrame(() => {
            const all = document.querySelectorAll<HTMLInputElement>(".scene-choices input.choice-label");
            for (const input of Array.from(all).reverse()) {
              if (!input.value) {
                input.focus();
                break;
              }
            }
          });
          return true;
        },
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const dom = document.createElement("div");
      dom.className = "scene-choices";
      dom.contentEditable = "false";
      const head = document.createElement("p");
      head.className = "scene-choices-title";
      const list = document.createElement("ol");
      const add = document.createElement("button");
      add.type = "button";
      add.className = "ghost-button scene-choices-add";
      dom.append(head, list, add);

      const lines = (): ChoiceLine[] => parseChoices(String(current.attrs.text ?? ""));
      const write = (next: ChoiceLine[]) => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined) return;
        if (!next.length) {
          editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
          return;
        }
        const text = serializeChoices(next);
        if (text === current.attrs.text) return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { text }));
      };
      add.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined) return;
        editor.chain().setTextSelection(pos).addChoice().run();
      });

      let factsKey = "";
      const render = () => {
        const t = getT().interactive.choices;
        head.textContent = t.title;
        add.textContent = `+ ${t.add}`;
        const { nodes, plan } = useCosmos.getState();
        const scenes = interactiveScenes(nodes, plan);
        const slugs = interactiveSlugs(nodes, plan);
        const facts = projectFacts(useCosmos.getState());
        factsKey = facts.map((f) => `${f.name}:${f.label}:${f.kind}`).join("|");
        // Un champ en cours d'écriture n'est pas redessiné (le curseur y resterait perdu).
        if (dom.contains(document.activeElement) && document.activeElement?.tagName === "INPUT") return;
        const rows: HTMLElement[] = [];
        let rank = -1;
        const all = lines();
        all.forEach((line) => {
          const li = document.createElement("li");
          if (line.kind === "raw") {
            li.className = "is-raw";
            const code = document.createElement("code");
            code.textContent = line.text;
            code.title = t.raw;
            li.append(code);
            rows.push(li);
            return;
          }
          const n = ++rank;
          const label = document.createElement("input");
          label.type = "text";
          label.className = "choice-label";
          label.maxLength = 200;
          label.value = line.label;
          label.placeholder = t.labelPlaceholder;
          label.setAttribute("aria-label", fmt(t.labelAria, { n: n + 1 }));
          const commit = () => write(editChoice(lines(), n, { ...line, label: cleanLabel(label.value) }));
          label.addEventListener("change", commit);
          label.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              commit();
              label.blur();
              editor.commands.focus();
            }
          });
          const target = document.createElement("select");
          target.className = "choice-target";
          target.setAttribute("aria-label", fmt(t.targetAria, { n: n + 1 }));
          const option = (value: string, text: string, selected: boolean) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = text;
            o.selected = selected;
            return o;
          };
          const resolved = resolveTarget(line.target, slugs);
          const options = [
            // Numérotées comme dans le volet des scènes : deux scènes au même titre restent distinctes.
            ...scenes.map((s, i) => option(slugs.get(s.id)!, `${i + 1}. ${s.title.trim() || getT().interactive.map.untitled}`, resolved === s.id)),
            option(END_TARGET, t.end, resolved === END_TARGET),
          ];
          if (resolved === null) options.unshift(option(line.target, fmt(t.missing, { name: line.target }), true));
          target.replaceChildren(...options);
          if (resolved === null) li.classList.add("is-broken");
          target.addEventListener("change", () => write(editChoice(lines(), n, { ...line, target: target.value })));
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "icon-button choice-remove";
          remove.textContent = "×";
          remove.title = t.remove;
          remove.setAttribute("aria-label", fmt(t.removeAria, { n: n + 1 }));
          remove.addEventListener("click", () => write(editChoice(lines(), n, null)));
          const arrow = document.createElement("span");
          arrow.className = "choice-arrow";
          arrow.setAttribute("aria-hidden", "true");
          arrow.textContent = "→";
          li.append(label, arrow, target, remove, choiceRules(line, n, facts, (next) => write(editChoice(lines(), n, next))));
          rows.push(li);
        });
        list.replaceChildren(...rows);
      };
      render();
      // Les titres des scènes changent ailleurs : la liste des destinations suit.
      const unsubscribe = useCosmos.subscribe((s, prev) => {
        if (s.nodes !== prev.nodes || s.plan !== prev.plan) render();
        // Un fait créé ou renommé ailleurs (autre scène, carte des choix) : les listes suivent.
        else if (s.metaKeep !== prev.metaKeep || s.manuscript !== prev.manuscript) {
          const key = projectFacts(s).map((f) => `${f.name}:${f.label}:${f.kind}`).join("|");
          if (key !== factsKey) render();
        }
      });

      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false;
          current = next;
          render();
          return true;
        },
        selectNode: () => dom.classList.add("is-selected"),
        deselectNode: () => dom.classList.remove("is-selected"),
        stopEvent: (event) => dom.contains(event.target as globalThis.Node) && event.target !== dom,
        ignoreMutation: () => true,
        destroy: () => unsubscribe(),
      };
    };
  },
});

type ChoiceValue = Omit<Extract<ChoiceLine, { kind: "choice" }>, "kind">;

/**
 * Seconde ligne d'un choix (lot 4) : « Seulement si » (un fait demandé, ou son absence) et « Donne » (un fait
 * acquis). Une condition ou des effets écrits à la main restent tels quels et s'affichent en clair.
 */
function choiceRules(line: ChoiceValue, n: number, facts: readonly Fact[], save: (next: ChoiceValue) => void): HTMLElement {
  const t = getT().interactive.choices;
  const box = document.createElement("div");
  box.className = "choice-rules";
  const option = (value: string, text: string, selected: boolean) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    o.selected = selected;
    return o;
  };
  const bools = facts.filter((f) => f.kind === "bool");
  const NEW = "+new";

  // Champ qui remplace une liste le temps de nommer un nouveau fait.
  const askNew = (select: HTMLSelectElement, done: (name: string | null) => void) => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "choice-new-fact";
    input.maxLength = 120;
    input.placeholder = t.newFactPlaceholder;
    input.setAttribute("aria-label", t.newFactAria);
    let finished = false;
    const finish = (keep: boolean) => {
      if (finished) return;
      finished = true;
      const name = keep && input.value.trim() ? useCosmos.getState().createFact(input.value) : null;
      input.replaceWith(select);
      done(name);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    select.replaceWith(input);
    input.focus();
  };

  const field = (text: string, select: HTMLSelectElement) => {
    const label = document.createElement("label");
    label.className = "choice-rule";
    const span = document.createElement("span");
    span.textContent = text;
    label.append(span, select);
    return label;
  };

  // Seulement si
  const only = document.createElement("select");
  only.className = "choice-only";
  only.setAttribute("aria-label", fmt(t.onlyAria, { n: n + 1 }));
  const cv = condValue(line.cond);
  const condOptions = [option("", t.always, cv === "")];
  if (cv === "custom") condOptions.push(option("custom", fmt(t.custom, { cond: line.cond ?? "" }), true));
  for (const f of bools) condOptions.push(option(`has:${f.name}`, f.label, cv === `has:${f.name}`), option(`not:${f.name}`, fmt(t.notFact, { fact: f.label }), cv === `not:${f.name}`));
  // Un fait demandé qui n'est plus dans la liste (compteur, nom inconnu) reste choisi.
  if (cv && cv !== "custom" && !condOptions.some((o) => o.selected)) condOptions.push(option(cv, line.cond ?? "", true));
  condOptions.push(option(NEW, t.newFact, false));
  only.replaceChildren(...condOptions);
  only.addEventListener("change", () => {
    if (only.value === NEW) {
      askNew(only, (name) => (name ? save({ ...line, cond: condFromValue(`has:${name}`, line.cond) }) : (only.value = cv)));
      return;
    }
    save({ ...line, cond: condFromValue(only.value, line.cond) });
  });

  // Donne
  const gives = document.createElement("select");
  gives.className = "choice-gives";
  gives.setAttribute("aria-label", fmt(t.givesAria, { n: n + 1 }));
  const given = givenFact(line.effects);
  const giveOptions = [option("", t.nothing, !given), ...bools.map((f) => option(f.name, f.label, given === f.name))];
  if (given && !bools.some((f) => f.name === given)) giveOptions.push(option(given, given, true));
  giveOptions.push(option(NEW, t.newFact, false));
  gives.replaceChildren(...giveOptions);
  gives.addEventListener("change", () => {
    if (gives.value === NEW) {
      askNew(gives, (name) => (name ? save({ ...line, effects: withGiven(line.effects, name) }) : (gives.value = given ?? "")));
      return;
    }
    save({ ...line, effects: withGiven(line.effects, gives.value || null) });
  });

  box.append(field(t.only, only), field(t.gives, gives));
  const others = otherEffects(line.effects);
  if (others.length) {
    const more = document.createElement("code");
    more.className = "choice-effects";
    more.textContent = fmt(t.effects, { effects: others.join(", ") });
    box.append(more);
  }
  return box;
}
