"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Node, type JSONContent } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Color from "@tiptap/extension-color";
import DragHandle from "@tiptap/extension-drag-handle";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import Youtube from "@tiptap/extension-youtube";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  CheckSquare,
  Code,
  Columns3,
  Heading1,
  Heading2,
  Highlighter,
  ImageIcon,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  Minus,
  PanelTop,
  Pilcrow,
  Quote,
  Redo2,
  Save,
  TableIcon,
  UnderlineIcon,
  Undo2,
  YoutubeIcon
} from "lucide-react";
import * as Y from "yjs";
import { SupabaseYjsProvider } from "@/components/editor/supabase-yjs-provider";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { createClient } from "@/lib/supabase/browser";
import { cn, emptyDoc } from "@/lib/utils";
import type { Profile } from "@/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type RealtimeTable = "pages" | "documents";

const buttonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--muted)] transition hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] disabled:opacity-45";

const userColors = ["#3dd6b3", "#8fb3ff", "#f3b862", "#f87171", "#65d68a", "#d9a8ff"];

const AsideBlock = Node.create({
  name: "asideBlock",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "aside" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["aside", HTMLAttributes, 0];
  }
});

function userColor(id: string) {
  const total = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return userColors[total % userColors.length];
}

function userName(profile: Pick<Profile, "email" | "full_name">) {
  return profile.full_name ?? profile.email;
}

export function RichEditor({
  value,
  onSave,
  readOnly = false,
  collaboration
}: {
  value: unknown;
  onSave: (content: JSONContent) => Promise<void>;
  readOnly?: boolean;
  collaboration?: {
    id: string;
    table: RealtimeTable;
    profile: Pick<Profile, "id" | "email" | "full_name" | "avatar_url">;
  };
}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [uploading, setUploading] = useState(false);
  const [activeUsers, setActiveUsers] = useState<Array<Record<string, unknown>>>([]);
  const seededRef = useRef(false);
  const collaborationId = collaboration?.id;
  const collaborationTable = collaboration?.table;

  const initialContent = useMemo(() => {
    if (value && typeof value === "object") {
      return value as JSONContent;
    }

    return emptyDoc() as JSONContent;
  }, [value]);

  const collaborationState = useMemo(() => {
    if (!collaborationId || !collaborationTable) {
      return null;
    }

    const doc = new Y.Doc();
    const provider = new SupabaseYjsProvider({
      doc,
      room: `editor-yjs:${collaborationTable}:${collaborationId}`
    });

    return { doc, provider };
  }, [collaborationId, collaborationTable]);

  useEffect(
    () => () => {
      collaborationState?.provider.destroy();
      collaborationState?.doc.destroy();
    },
    [collaborationState]
  );

  const saveContent = useCallback(
    async (content: JSONContent) => {
      if (readOnly) {
        return;
      }

      setSaveStatus("saving");
      try {
        await onSave(content);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [onSave, readOnly]
  );

  const debouncedSave = useDebouncedCallback(saveContent, collaborationState ? 650 : 1200);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    content: collaborationState ? undefined : initialContent,
    extensions: [
      StarterKit.configure({
        undoRedo: collaborationState ? false : undefined,
        heading: {
          levels: [1, 2, 3]
        }
      }),
      ...(collaborationState && collaboration
        ? [
            Collaboration.configure({
              document: collaborationState.doc
            }),
            CollaborationCaret.configure({
              provider: collaborationState.provider,
              user: {
                id: collaboration.profile.id,
                name: userName(collaboration.profile),
                color: userColor(collaboration.profile.id)
              },
              onUpdate: (users) => {
                setActiveUsers(users.filter((user) => user.id !== collaboration.profile.id));
                return null;
              },
              render: (user) => {
                const cursor = document.createElement("span");
                cursor.classList.add("collaboration-caret");
                cursor.style.borderColor = user.color;

                const label = document.createElement("div");
                label.classList.add("collaboration-caret-label");
                label.style.backgroundColor = user.color;
                label.textContent = user.name;

                cursor.appendChild(label);
                return cursor;
              },
              selectionRender: (user) => ({
                nodeName: "span",
                class: "collaboration-selection",
                style: `background-color: ${user.color}33`
              })
            })
          ]
        : []),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https"
      }),
      Image.configure({
        allowBase64: false
      }),
      Youtube.configure({
        controls: true,
        nocookie: true
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"]
      }),
      Table.configure({
        resizable: true
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      AsideBlock,
      Typography,
      Placeholder.configure({
        placeholder: "Ecris ici, ajoute des blocs, colle des liens YouTube, structure ton projet..."
      }),
      DragHandle.configure({
        render: () => {
          const element = document.createElement("div");
          element.className = "tiptap-drag-handle";
          element.textContent = "::";
          return element;
        }
      })
    ],
    onCreate: ({ editor: currentEditor }) => {
      if (!collaborationState || seededRef.current) {
        return;
      }

      seededRef.current = true;

      window.setTimeout(() => {
        if (currentEditor.isEmpty) {
          currentEditor.commands.setContent(initialContent, { emitUpdate: true });
        }
      }, 350);
    },
    onUpdate: ({ editor: currentEditor }) => {
      debouncedSave(currentEditor.getJSON());
    }
  });

  const runSave = async () => {
    if (!editor) {
      return;
    }

    await saveContent(editor.getJSON());
  };

  const addLink = () => {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien", previousUrl ?? "https://");
    if (url === null) {
      return;
    }

    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImageUrl = () => {
    const url = window.prompt("URL de l'image", "https://");
    if (url?.trim()) {
      editor?.chain().focus().setImage({ src: url.trim() }).run();
    }
  };

  const addYoutube = () => {
    const url = window.prompt("URL YouTube", "https://www.youtube.com/watch?v=");
    if (url?.trim()) {
      editor?.chain().focus().setYoutubeVideo({ src: url.trim(), width: 720, height: 405 }).run();
    }
  };

  const addAside = () => {
    if (!editor) {
      return;
    }

    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ").trim();

    editor
      .chain()
      .focus()
      .insertContent({
        type: "asideBlock",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: selectedText || "Objectif: "
              }
            ]
          }
        ]
      })
      .run();
  };

  const uploadImage = async (file: File) => {
    if (!editor) {
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
    const path = `editor-images/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("project-media").upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });

    if (!error) {
      const { data } = supabase.storage.from("project-media").getPublicUrl(path);
      editor.chain().focus().setImage({ src: data.publicUrl }).run();
    }

    setUploading(false);
  };

  if (!editor) {
    return <div className="min-h-[520px] rounded-lg border border-[var(--border)] bg-[var(--surface)]" />;
  }

  const toolbarDisabled = readOnly;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {collaborationState && (
        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
            <span className="inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            <span>Collaboration en direct active</span>
            {activeUsers.length > 0 && (
              <strong className="text-[var(--text)]">
                {activeUsers.map((user) => String(user.name ?? "Utilisateur")).join(", ")}
              </strong>
            )}
          </div>
          <span className="text-xs text-[var(--muted)]">Sauvegarde auto en arriere-plan</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--surface-elevated)] p-2">
        <ToolbarButton label="Paragraphe" disabled={toolbarDisabled} onClick={() => editor.chain().focus().setParagraph().run()}>
          <Pilcrow className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Titre 1"
          disabled={toolbarDisabled}
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Titre 2"
          disabled={toolbarDisabled}
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Gras" disabled={toolbarDisabled} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Italique" disabled={toolbarDisabled} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Souligne" disabled={toolbarDisabled} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Code" disabled={toolbarDisabled} active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Liste" disabled={toolbarDisabled} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Liste numerotee" disabled={toolbarDisabled} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Checklist" disabled={toolbarDisabled} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <CheckSquare className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Citation" disabled={toolbarDisabled} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Bloc encadre" disabled={toolbarDisabled} active={editor.isActive("asideBlock")} onClick={addAside}>
          <PanelTop className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Separateur" disabled={toolbarDisabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Lien" disabled={toolbarDisabled} active={editor.isActive("link")} onClick={addLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Image par URL" disabled={toolbarDisabled} onClick={addImageUrl}>
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
        <label className={cn(buttonClass, uploading && "cursor-wait opacity-60")} title="Importer une image">
          <ImageIcon className="h-4 w-4" />
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={toolbarDisabled || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadImage(file);
              }
              event.target.value = "";
            }}
          />
        </label>
        <ToolbarButton label="YouTube" disabled={toolbarDisabled} onClick={addYoutube}>
          <YoutubeIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Tableau" disabled={toolbarDisabled} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Colonne +" disabled={toolbarDisabled || !editor.isActive("table")} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          <Columns3 className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <input
          type="color"
          className="h-9 w-9 rounded-lg border border-[var(--border)] bg-transparent p-1"
          title="Couleur du texte"
          disabled={toolbarDisabled}
          onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
        />
        <ToolbarButton label="Fond jaune" disabled={toolbarDisabled} onClick={() => editor.chain().focus().toggleHighlight({ color: "#f3b86255" }).run()}>
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton label="Annuler" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Retablir" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <button
          type="button"
          onClick={runSave}
          disabled={readOnly}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-[#07110f] transition hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          Sauvegarder
        </button>
      </div>

      <EditorContent editor={editor} className="prose-editor" />

      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
        <span>Glisse les poignees a gauche des blocs pour reorganiser le contenu.</span>
        <span>
          {saveStatus === "saving" && "Sauvegarde..."}
          {saveStatus === "saved" && "Sauvegarde auto OK"}
          {saveStatus === "error" && "Erreur de sauvegarde"}
          {saveStatus === "idle" && "Pret"}
        </span>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  active,
  disabled,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(buttonClass, active && "border-[var(--accent)] bg-emerald-400/10 text-emerald-200")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-7 w-px bg-[var(--border)]" />;
}
