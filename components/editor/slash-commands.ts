import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

export type SlashCommand = {
  title: string;
  description: string;
  icon: string;
  command: (editor: Editor) => void;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    title: "Paragraphe",
    description: "Texte normal",
    icon: "¶",
    command: (editor) => editor.chain().focus().setParagraph().run()
  },
  {
    title: "Titre 1",
    description: "Grand titre de section",
    icon: "H1",
    command: (editor) => editor.chain().focus().setHeading({ level: 1 }).run()
  },
  {
    title: "Titre 2",
    description: "Sous-titre",
    icon: "H2",
    command: (editor) => editor.chain().focus().setHeading({ level: 2 }).run()
  },
  {
    title: "Titre 3",
    description: "Petit titre",
    icon: "H3",
    command: (editor) => editor.chain().focus().setHeading({ level: 3 }).run()
  },
  {
    title: "Liste à puces",
    description: "Liste non ordonnée",
    icon: "•",
    command: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    title: "Liste numérotée",
    description: "Liste ordonnée",
    icon: "1.",
    command: (editor) => editor.chain().focus().toggleOrderedList().run()
  },
  {
    title: "Checklist",
    description: "Cases à cocher",
    icon: "☑",
    command: (editor) => editor.chain().focus().toggleTaskList().run()
  },
  {
    title: "Citation",
    description: "Bloc de citation",
    icon: "❝",
    command: (editor) => editor.chain().focus().toggleBlockquote().run()
  },
  {
    title: "Code",
    description: "Bloc de code",
    icon: "</>",
    command: (editor) => editor.chain().focus().toggleCodeBlock().run()
  },
  {
    title: "Tableau",
    description: "Tableau 3×3",
    icon: "⊞",
    command: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    title: "Séparateur",
    description: "Ligne horizontale",
    icon: "—",
    command: (editor) => editor.chain().focus().setHorizontalRule().run()
  },
  {
    title: "Bloc encadré",
    description: "Note ou avertissement",
    icon: "⬚",
    command: (editor) => editor.chain().focus().setNode("asideBlock").run()
  }
];

const slashPluginKey = new PluginKey("slashCommands");

export type SlashMenuState = {
  active: boolean;
  query: string;
  from: number;
  coords: { top: number; left: number } | null;
};

type SlashCommandsOptions = {
  onOpen: (state: SlashMenuState) => void;
  onUpdate: (state: SlashMenuState) => void;
  onClose: () => void;
};

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return {
      onOpen: () => {},
      onUpdate: () => {},
      onClose: () => {}
    };
  },

  addProseMirrorPlugins() {
    const { onOpen, onUpdate, onClose } = this.options;
    let isOpen = false;
    let startPos = -1;

    return [
      new Plugin({
        key: slashPluginKey,
        props: {
          handleKeyDown: (view, event) => {
            if (isOpen) {
              if (event.key === "Escape") {
                isOpen = false;
                startPos = -1;
                onClose();
                return true;
              }
            }
            return false;
          }
        },
        view: () => ({
          update: (view) => {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            const textBefore = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 100),
              $from.parentOffset,
              undefined,
              "￼"
            );

            const slashMatch = /\/(\w*)$/.exec(textBefore);

            if (slashMatch) {
              const query = slashMatch[1] ?? "";
              const from = $from.pos - slashMatch[0].length;
              const coords = view.coordsAtPos(from);

              const menuState: SlashMenuState = {
                active: true,
                query,
                from,
                coords: { top: coords.bottom, left: coords.left }
              };

              if (!isOpen) {
                isOpen = true;
                startPos = from;
                onOpen(menuState);
              } else {
                onUpdate(menuState);
              }
            } else if (isOpen) {
              isOpen = false;
              startPos = -1;
              onClose();
            }
          },
          destroy: () => {
            if (isOpen) {
              isOpen = false;
              onClose();
            }
          }
        })
      })
    ];
  }
});
