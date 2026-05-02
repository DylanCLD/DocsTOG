"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  CheckSquare,
  Code,
  Columns3,
  FileSymlink,
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
  Search,
  TableIcon,
  UnderlineIcon,
  Undo2,
  X,
  YoutubeIcon
} from "lucide-react";
import * as Y from "yjs";
import { SupabaseYjsProvider } from "@/components/editor/supabase-yjs-provider";
import { createSubDocument } from "@/lib/actions/managers";
import { createSubPage } from "@/lib/actions/pages";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { createClient } from "@/lib/supabase/browser";
import { cn, emptyDoc } from "@/lib/utils";
import type { InternalLinkTarget, Profile } from "@/types";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type RealtimeTable = "pages" | "documents";
type CurrentInternalTarget = { type: "page" | "document"; id: string };
type InternalLinkTab = InternalLinkTarget["type"];
type InternalLinkPickerMode = "all" | "pages";

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
  collaboration,
  internalLinkTargets = [],
  currentTarget,
  enableQuickCheckbox = false
}: {
  value: unknown;
  onSave: (content: JSONContent) => Promise<void>;
  readOnly?: boolean;
  internalLinkTargets?: InternalLinkTarget[];
  currentTarget?: CurrentInternalTarget;
  enableQuickCheckbox?: boolean;
  collaboration?: {
    id: string;
    table: RealtimeTable;
    profile: Pick<Profile, "id" | "email" | "full_name" | "avatar_url">;
  };
}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [uploading, setUploading] = useState(false);
  const [activeUsersVersion, setActiveUsersVersion] = useState(0);
  const [internalLinkOpen, setInternalLinkOpen] = useState(false);
  const [internalLinkQuery, setInternalLinkQuery] = useState("");
  const [internalLinkTab, setInternalLinkTab] = useState<InternalLinkTab>("page");
  const [internalLinkPickerMode, setInternalLinkPickerMode] = useState<InternalLinkPickerMode>("all");
  const [internalLinkError, setInternalLinkError] = useState<string | null>(null);
  const [creatingInternalLink, setCreatingInternalLink] = useState(false);
  const seededRef = useRef(false);
  const internalLinkSelectionRef = useRef<{ from: number; to: number; empty: boolean } | null>(null);
  const router = useRouter();
  const collaborationId = collaboration?.id;
  const collaborationTable = collaboration?.table;

  const initialContent = useMemo(() => {
    if (value && typeof value === "object") {
      return value as JSONContent;
    }

    return emptyDoc() as JSONContent;
  }, [value]);

  const filteredInternalTargets = useMemo(() => {
    const normalizedQuery = internalLinkQuery.trim().toLowerCase();

    return internalLinkTargets
      .filter((target) => target.type === internalLinkTab)
      .filter((target) => {
        if (!normalizedQuery) {
          return true;
        }

        return `${target.title} ${target.subtitle ?? ""}`.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 40);
  }, [internalLinkQuery, internalLinkTab, internalLinkTargets]);

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

  const activeUsers = useMemo(() => {
    void activeUsersVersion;

    if (!collaborationState || !collaboration) {
      return [];
    }

    return Array.from(collaborationState.provider.awareness.states.values())
      .map((state) => state.user)
      .filter((user): user is Record<string, unknown> => {
        return Boolean(user && typeof user === "object" && user.id !== collaboration.profile.id);
      });
  }, [activeUsersVersion, collaboration, collaborationState]);

  useEffect(
    () => () => {
      collaborationState?.provider.destroy();
      collaborationState?.doc.destroy();
    },
    [collaborationState]
  );

  useEffect(() => {
    if (!collaborationState) {
      return;
    }

    const updateUsers = () => setActiveUsersVersion((version) => version + 1);
    collaborationState.provider.awareness.on("update", updateUsers);

    return () => {
      collaborationState.provider.awareness.off("update", updateUsers);
    };
  }, [collaborationState]);

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
        link: false,
        underline: false,
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
        openOnClick: readOnly,
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
    },
    editorProps: {
      handleClick: (_view, _pos, event) => {
        const element = event.target instanceof Element ? event.target : null;
        const anchor = element?.closest("a[href]");
        const href = anchor?.getAttribute("href");

        if (!href) {
          return false;
        }

        if (!readOnly && !event.metaKey && !event.ctrlKey) {
          return false;
        }

        if (href.startsWith("/")) {
          router.push(href);
        } else {
          window.open(href, "_blank", "noopener,noreferrer");
        }

        return true;
      },
      handleDoubleClick: (_view, _pos, event) => {
        const element = event.target instanceof Element ? event.target : null;
        const anchor = element?.closest("a[href]");
        const href = anchor?.getAttribute("href");

        if (!href || (!href.startsWith("/pages/") && !href.startsWith("/documents/"))) {
          return false;
        }

        router.push(href);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (!editor || !enableQuickCheckbox || readOnly || (event.key !== " " && event.key !== "Enter")) {
          return false;
        }

        const { from, empty, $from } = editor.state.selection;
        if (!empty || $from.parent.type.name !== "paragraph") {
          return false;
        }

        const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, " ");
        if (textBeforeCursor !== "[]") {
          return false;
        }

        event.preventDefault();
        editor.chain().focus().deleteRange({ from: from - 2, to: from }).toggleTaskList().run();
        return true;
      }
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

  const captureInternalLinkSelection = () => {
    if (!editor) {
      return "";
    }

    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ").trim();

    internalLinkSelectionRef.current = { from, to, empty };
    return selectedText;
  };

  const openInternalLinkPicker = (mode: InternalLinkPickerMode = "all") => {
    if (!editor) {
      return;
    }

    captureInternalLinkSelection();
    setInternalLinkQuery("");
    setInternalLinkError(null);
    setInternalLinkPickerMode(mode);
    setInternalLinkTab(mode === "pages" ? "page" : currentTarget?.type ?? "page");
    setInternalLinkOpen(true);
  };

  const applyInternalLink = (href: string, fallbackTitle: string) => {
    if (!editor) {
      return;
    }

    const selection = internalLinkSelectionRef.current;
    const label = fallbackTitle.trim() || href;
    let chain = editor.chain().focus();

    if (selection) {
      chain = chain.setTextSelection({ from: selection.from, to: selection.to });
    }

    if (!selection || selection.empty) {
      chain
        .insertContent({
          type: "text",
          text: label,
          marks: [
            {
              type: "link",
              attrs: { href }
            }
          ]
        })
        .run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
    }

    setInternalLinkOpen(false);
    setInternalLinkError(null);
    internalLinkSelectionRef.current = null;
  };

  const createInternalChild = async (title: string) => {
    if (!currentTarget) {
      setInternalLinkError("Ouvre une page ou un document pour creer un enfant.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setInternalLinkError("Selectionne un texte pour creer un enfant.");
      return;
    }

    setCreatingInternalLink(true);
    setInternalLinkError(null);

    try {
      const result =
        currentTarget.type === "page"
          ? await createSubPage(currentTarget.id, trimmedTitle)
          : await createSubDocument(currentTarget.id, trimmedTitle);

      applyInternalLink(result.href, trimmedTitle);
      if (editor) {
        await saveContent(editor.getJSON());
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creation impossible.";
      setInternalLinkError(message);
      window.alert(message);
    } finally {
      setCreatingInternalLink(false);
    }
  };

  const createInternalChildFromSelection = async () => {
    if (!editor || creatingInternalLink) {
      return;
    }

    const selectedText = captureInternalLinkSelection();
    if (!selectedText) {
      return;
    }

    await createInternalChild(selectedText);
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
    // eslint-disable-next-line react-hooks/purity
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
  const activeLinkHref = editor.getAttributes("link").href as string | undefined;
  const isInternalLinkActive = Boolean(activeLinkHref?.startsWith("/pages/") || activeLinkHref?.startsWith("/documents/"));
  const childLabel = currentTarget?.type === "document" ? "sous-document" : "sous-page";

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
        <ToolbarButton label="Lien interne" disabled={toolbarDisabled} active={isInternalLinkActive} onClick={() => openInternalLinkPicker()}>
          <FileSymlink className="h-4 w-4" />
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

      {!readOnly && currentTarget && (
        <BubbleMenu
          editor={editor}
          updateDelay={80}
          shouldShow={({ editor: menuEditor }) => {
            const { from, to, empty } = menuEditor.state.selection;
            return !empty && menuEditor.state.doc.textBetween(from, to, " ").trim().length > 0;
          }}
          className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-2xl shadow-black/35"
        >
          <button
            type="button"
            disabled={creatingInternalLink}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void createInternalChildFromSelection()}
            className="h-8 rounded-md px-2.5 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-elevated)] disabled:opacity-50"
          >
            {creatingInternalLink ? "Creation..." : `Creer ${childLabel}`}
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openInternalLinkPicker("all")}
            className="h-8 rounded-md px-2.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
          >
            Relier a une page/document
          </button>
        </BubbleMenu>
      )}

      {internalLinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Lien interne</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Lie le texte selectionne a une page ou un document.</p>
              </div>
              <button
                type="button"
                className={cn(buttonClass, "shrink-0")}
                aria-label="Fermer"
                onClick={() => {
                  setInternalLinkOpen(false);
                  setInternalLinkError(null);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {internalLinkPickerMode === "all" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setInternalLinkTab("page")}
                    className={cn(
                      "h-9 rounded-lg border px-3 text-sm font-medium transition",
                      internalLinkTab === "page"
                        ? "border-[var(--accent)] bg-emerald-400/10 text-emerald-200"
                        : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
                    )}
                  >
                    Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => setInternalLinkTab("document")}
                    className={cn(
                      "h-9 rounded-lg border px-3 text-sm font-medium transition",
                      internalLinkTab === "document"
                        ? "border-[var(--accent)] bg-emerald-400/10 text-emerald-200"
                        : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
                    )}
                  >
                    Documents
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">Choisis la page a relier au texte selectionne.</p>
              )}

              <div className="space-y-3">
                <div className="relative">
                  <input
                    value={internalLinkQuery}
                    onChange={(event) => setInternalLinkQuery(event.target.value)}
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 pl-9 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                    placeholder="Rechercher..."
                  />
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                </div>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--border)]">
                  {filteredInternalTargets.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Aucune cible trouvee.</p>
                  ) : (
                    filteredInternalTargets.map((target) => (
                      <button
                        key={`${target.type}-${target.id}`}
                        type="button"
                        onClick={() => applyInternalLink(target.href, target.title)}
                        className="block w-full border-b border-[var(--border)] px-3 py-2 text-left transition last:border-b-0 hover:bg-[var(--surface-elevated)]"
                      >
                        <span className="block truncate text-sm font-medium">{target.title}</span>
                        {target.subtitle && <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{target.subtitle}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {internalLinkError && <p className="text-sm text-red-300">{internalLinkError}</p>}
            </div>
          </div>
        </div>
      )}

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
