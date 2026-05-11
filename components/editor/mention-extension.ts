import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const mentionPluginKey = new PluginKey("mentionCommands");

export type MentionMenuState = {
  coords: { top: number; left: number };
  query: string;
  from: number;
  to: number;
};

type MentionExtensionOptions = {
  onOpen: (state: MentionMenuState) => void;
  onUpdate: (state: MentionMenuState) => void;
  onClose: () => void;
};

export const MentionExtension = Extension.create<MentionExtensionOptions>({
  name: "mentionExtension",

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

    return [
      new Plugin({
        key: mentionPluginKey,
        view: () => ({
          update: (view) => {
            const { state } = view;
            const { selection } = state;
            const { $from } = selection;

            const textBefore = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 60),
              $from.parentOffset,
              undefined,
              "￼"
            );

            const mentionMatch = /@(\w*)$/.exec(textBefore);

            if (mentionMatch) {
              const query = mentionMatch[1] ?? "";
              const from = $from.pos - mentionMatch[0].length;
              const to = $from.pos;
              const coords = view.coordsAtPos(from);

              const menuState: MentionMenuState = {
                query,
                from,
                to,
                coords: { top: coords.bottom + 4, left: coords.left }
              };

              if (!isOpen) {
                isOpen = true;
                onOpen(menuState);
              } else {
                onUpdate(menuState);
              }
            } else if (isOpen) {
              isOpen = false;
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
