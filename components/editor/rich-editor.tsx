"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Copy,
  ExternalLink,
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
  Search,
  TableIcon,
  Trash2,
  UnderlineIcon,
  Undo2,
  X,
  YoutubeIcon
} from "lucide-react";
import * as Y from "yjs";
import { TableOfContents } from "@/components/editor/table-of-contents";
import { SlashCommandsList, type SlashCommandsListRef } from "@/components/editor/slash-commands-list";
import { SlashCommands, SLASH_COMMANDS, type SlashCommand, type SlashMenuState } from "@/components/editor/slash-commands";
import { SupabaseYjsProvider } from "@/components/editor/supabase-yjs-provider";
import { createSubDocument } from "@/lib/actions/managers";
import { createSubPage } from "@/lib/actions/pages";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import {
  editorRoom,
  extractImageSrcs,
  hasImageSrc,
  type ContentSaveOptions,
  type ContentSaveResult
} from "@/lib/editor-content";
import { createClient } from "@/lib/supabase/browser";
import { cn, emptyDoc } from "@/lib/utils";
import type { InternalLinkTarget, Profile } from "@/types";

type SaveStatus = "idle" | "saving" | "saved" | "image-saving" | "image-saved" | "image-unverified" | "error";
type RealtimeTable = "pages" | "documents";
type CurrentInternalTarget = { type: "page" | "document"; id: string };
type InternalLinkTab = InternalLinkTarget["type"];
type InternalLinkPickerMode = "all" | "pages";
type EditorToast = { id: number; message: string; tone: "success" | "error" | "info" };
type LinkMark = { readonly type: { readonly name: string }; readonly attrs: Record<string, unknown> };
type LinkPositionView = {
  readonly state: {
    readonly doc: {
      resolve: (pos: number) => {
        marks: () => readonly LinkMark[];
        readonly nodeBefore?: { readonly marks?: readonly LinkMark[] } | null;
        readonly nodeAfter?: { readonly marks?: readonly LinkMark[] } | null;
      };
    };
  };
};

const buttonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--muted)] transition hover:border-[var(--border)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] disabled:opacity-45";

const userColors = ["#3dd6b3", "#8fb3ff", "#f3b862", "#f87171", "#65d68a", "#d9a8ff"];
const IMAGE_AUTOSAVE_PROTECTION_MS = 30_000;

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

function waitForEditorTick() {
  return new Promise((resolve) => window.setTimeout(resolve, 50));
}

function getPastedImageFile(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return null;
  }

  const file = Array.from(clipboardData.files).find((item) => item.type.startsWith("image/"));
  if (file) {
    return file;
  }

  const fileItem = Array.from(clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
  return fileItem?.getAsFile() ?? null;
}

function getPastedImageSrc(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return null;
  }

  const html = clipboardData.getData("text/html");
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const src = doc.querySelector("img[src]")?.getAttribute("src")?.trim();
    if (src) {
      return src;
    }
  }

  const text = clipboardData.getData("text/plain").trim();
  return text.startsWith("data:image/") ? text : null;
}

function imageExtensionFromMime(mime: string) {
  const subtype = mime.split("/")[1]?.toLowerCase().split("+")[0] ?? "png";
  return subtype === "jpeg" ? "jpg" : subtype.replace(/[^a-z0-9]/g, "") || "png";
}

function imageFileFromDataUrl(src: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(src);
  if (!match) {
    return null;
  }

  const [, mime, base64] = match;
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], `pasted-image-${Date.now()}.${imageExtensionFromMime(mime)}`, { type: mime });
}

function formatSavedAt(date: Date | null) {
  if (!date) {
    return "Prêt";
  }

  return `Sauvegarde ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function hasAllImageSrcs(content: unknown, srcs: string[]) {
  if (srcs.length === 0) {
    return true;
  }

  const currentSrcs = new Set(extractImageSrcs(content));
  return srcs.every((src) => currentSrcs.has(src));
}

function pruneProtectedImageSrcs(protectedImageSrcs: Map<string, number>) {
  const now = Date.now();

  for (const [src, expiresAt] of protectedImageSrcs) {
    if (expiresAt <= now) {
      protectedImageSrcs.delete(src);
    }
  }
}

function getAnchorHrefFromTarget(target: EventTarget | null) {
  let element: Element | null = null;

  if (target instanceof Element) {
    element = target;
  } else if (typeof Text !== "undefined" && target instanceof Text) {
    element = target.parentElement;
  }

  return element?.closest("a[href]")?.getAttribute("href")?.trim() || null;
}

function getLinkHrefAtPosition(view: LinkPositionView, pos: number) {
  const resolved = view.state.doc.resolve(pos);
  const marks = [
    ...resolved.marks(),
    ...(resolved.nodeBefore?.marks ?? []),
    ...(resolved.nodeAfter?.marks ?? [])
  ];
  const href = marks.find((mark) => mark.type.name === "link")?.attrs.href;

  return typeof href === "string" && href.trim() ? href.trim() : null;
}

function getLinkHrefFromEditorEvent(view: LinkPositionView, pos: number, event: MouseEvent) {
  return getAnchorHrefFromTarget(event.target) ?? getLinkHrefAtPosition(view, pos);
}

function isInternalEditorHref(href: string | null | undefined): href is string {
  return Boolean(href?.startsWith("/pages/") || href?.startsWith("/documents/"));
}

export function RichEditor({
  value,
  onSave,
  readOnly = false,
  collaboration,
  internalLinkTargets = [],
  currentTarget,
  enableQuickCheckbox = false,
  users = []
}: {
  value: unknown;
  onSave: (content: string, options?: ContentSaveOptions) => Promise<ContentSaveResult>;
  readOnly?: boolean;
  internalLinkTargets?: InternalLinkTarget[];
  currentTarget?: CurrentInternalTarget;
  enableQuickCheckbox?: boolean;
  users?: Pick<Profile, "id" | "email" | "full_name">[];
  collaboration?: {
    id: string;
    table: RealtimeTable;
    profile: Pick<Profile, "id" | "email" | "full_name" | "avatar_url">;
  };
}) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [uploading, setUploading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [toasts, setToasts] = useState<EditorToast[]>([]);
  const [activeUsersVersion, setActiveUsersVersion] = useState(0);
  const [internalLinkOpen, setInternalLinkOpen] = useState(false);
  const [internalLinkQuery, setInternalLinkQuery] = useState("");
  const [internalLinkTab, setInternalLinkTab] = useState<InternalLinkTab>("page");
  const [internalLinkPickerMode, setInternalLinkPickerMode] = useState<InternalLinkPickerMode>("all");
  const [internalLinkError, setInternalLinkError] = useState<string | null>(null);
  const [creatingInternalLink, setCreatingInternalLink] = useState(false);
  const seededRef = useRef(false);
  const imageOperationRef = useRef(false);
  const protectedImageSrcsRef = useRef<Map<string, number>>(new Map());
  const internalLinkSelectionRef = useRef<{ from: number; to: number; empty: boolean } | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const router = useRouter();
  const collaborationId = collaboration?.id;
  const collaborationTable = collaboration?.table;
  void users;

  const notify = useCallback((message: string, tone: EditorToast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  const openEditorHref = useCallback(
    (href: string) => {
      if (href.startsWith("/")) {
        router.push(href);
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    },
    [router]
  );

  const initialContent = useMemo(() => {
    if (value && typeof value === "object") {
      return value as JSONContent;
    }

    return emptyDoc() as JSONContent;
  }, [value]);

  const initialImageSrcs = useMemo(() => extractImageSrcs(initialContent), [initialContent]);

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
      room: editorRoom(collaborationTable, collaborationId)
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
    async (content: JSONContent, options: ContentSaveOptions = {}) => {
      if (readOnly) {
        return null;
      }

      const verifyingImage = Boolean(options.verifyImageSrc);
      setSaveStatus(verifyingImage ? "image-saving" : "saving");
      let verificationFailed = false;

      const runSave = async () => {
        const serializedContent = JSON.stringify(content);
        const result = await onSave(serializedContent, options);

        if (options.verifyImageSrc && !result.verifiedImageSrc) {
          verificationFailed = true;
          setSaveStatus("image-unverified");
          throw new Error("Image non confirmée après sauvegarde.");
        }

        const savedAt = new Date();
        setLastSavedAt(savedAt);
        setSaveStatus(verifyingImage ? "image-saved" : "saved");
        return result;
      };

      const nextSave = saveChainRef.current.then(runSave, runSave);
      saveChainRef.current = nextSave.then(
        () => undefined,
        () => undefined
      );

      try {
        return await nextSave;
      } catch (error) {
        if (!verificationFailed) {
          setSaveStatus("error");
        }
        throw error;
      }
    },
    [onSave, readOnly]
  );

  const debouncedSave = useDebouncedCallback(saveContent, collaborationState ? 650 : 1200);

  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const slashListRef = useRef<SlashCommandsListRef | null>(null);

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
        placeholder: "Écris ici, ajoute des blocs, colle des liens YouTube, structure ton projet..."
      }),
      DragHandle.configure({
        render: () => {
          const element = document.createElement("div");
          element.className = "tiptap-drag-handle";
          element.textContent = "::";
          return element;
        }
      }),
      SlashCommands.configure({
        onOpen: (state) => setSlashMenu(state),
        onUpdate: (state) => setSlashMenu(state),
        onClose: () => setSlashMenu(null)
      })
    ],
    onUpdate: ({ editor: currentEditor }) => {
      if (collaborationState && !seededRef.current) return;
      if (imageOperationRef.current) return;

      const content = currentEditor.getJSON();
      pruneProtectedImageSrcs(protectedImageSrcsRef.current);
      const missingProtectedImageSrcs = Array.from(protectedImageSrcsRef.current.keys()).filter((src) => !hasImageSrc(content, src));

      if (missingProtectedImageSrcs.length > 0) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[editor-image] skipped autosave that would drop recently saved image srcs", {
            missingProtectedImageSrcs,
            currentImageSrcs: extractImageSrcs(content)
          });
        }
        return;
      }

      debouncedSave.run(content);
    },
    editorProps: {
      handleClick: (view, pos, event) => {
        const href = getLinkHrefFromEditorEvent(view, pos, event);
        if (!href) return false;

        openEditorHref(href);
        return true;
      },
      handlePaste: (_view, event) => {
        if (!editor || readOnly) {
          return false;
        }

        const imageFile = getPastedImageFile(event.clipboardData);
        if (imageFile) {
          event.preventDefault();
          void uploadImage(imageFile);
          return true;
        }

        const imageSrc = getPastedImageSrc(event.clipboardData);
        if (!imageSrc) {
          return false;
        }

        event.preventDefault();
        void pasteImageSrc(imageSrc);
        return true;
      },
      handleDrop: (_view, event) => {
        if (!editor || readOnly) {
          return false;
        }

        const imageFile = getPastedImageFile(event.dataTransfer);
        if (imageFile) {
          event.preventDefault();
          void uploadImage(imageFile);
          return true;
        }

        const imageSrc = getPastedImageSrc(event.dataTransfer);
        if (!imageSrc) {
          return false;
        }

        event.preventDefault();
        void pasteImageSrc(imageSrc);
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

  useEffect(() => {
    if (!editor || !collaborationState) {
      return;
    }

    seededRef.current = false;

    const trySeed = (isFinalAttempt = false) => {
      if (seededRef.current || !editor || editor.isDestroyed) return;

      const currentContent = editor.getJSON();
      if (initialImageSrcs.length > 0 && hasAllImageSrcs(currentContent, initialImageSrcs)) {
        seededRef.current = true;
        return;
      }

      const doc = editor.state.doc;
      const isEffectivelyEmpty =
        doc.childCount === 0 ||
        (doc.childCount === 1 &&
          doc.firstChild?.type.name === "paragraph" &&
          doc.firstChild.content.size === 0);

      if (isEffectivelyEmpty || isFinalAttempt) {
        try {
          editor.commands.setContent(initialContent, {
            emitUpdate: false,
            errorOnInvalidContent: true
          });
        } catch (err) {
          console.warn("[editor-seed] setContent failed", err);
          if (isFinalAttempt) {
            setSaveStatus("error");
          }
          return;
        }
      }

      if (hasAllImageSrcs(editor.getJSON(), initialImageSrcs)) {
        seededRef.current = true;
        return;
      }

      if (isFinalAttempt) {
        console.error("[editor-seed] initial images missing after seed", {
          expectedImageCount: initialImageSrcs.length,
          expectedImageSrcs: initialImageSrcs,
          currentImageSrcs: extractImageSrcs(editor.getJSON())
        });
        setSaveStatus("error");
        return;
      }

      if (initialImageSrcs.length === 0) {
        seededRef.current = true;
      }
    };

    const t1 = window.setTimeout(() => trySeed(), 100);
    const t2 = window.setTimeout(() => trySeed(), 600);
    const t3 = window.setTimeout(() => trySeed(true), 1500);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [collaborationState, editor, initialContent, initialImageSrcs]);

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
      setInternalLinkError("Ouvre une page ou un document pour créer un enfant.");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setInternalLinkError("Sélectionne un texte pour créer un enfant.");
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
      const message = error instanceof Error ? error.message : "Création impossible.";
      setInternalLinkError(message);
      notify(message, "error");
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

  const persistImageContent = async (src: string) => {
    if (!editor) {
      return;
    }

    imageOperationRef.current = true;
    debouncedSave.cancel();

    try {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const content = editor.getJSON();
        if (hasImageSrc(content, src)) {
          const result = await saveContent(content, { revalidate: true });
          protectedImageSrcsRef.current.set(src, Date.now() + IMAGE_AUTOSAVE_PROTECTION_MS);
          debouncedSave.cancel();
          if (process.env.NODE_ENV === "development") {
            console.debug("[editor-image] save succeeded", {
              savedImageCount: result?.imageSrcs.length ?? 0,
              serverSawImage: result?.imageSrcs.includes(src) ?? false
            });
          }
          notify("Image sauvegardée", "success");
          return;
        }

        await waitForEditorTick();
      }

      console.warn("[editor-image] timeout — getJSON never contained src:", src);
      console.warn("[editor-image] final getJSON:", JSON.stringify(editor.getJSON()).substring(0, 1000));
      setSaveStatus("image-unverified");
      notify("Image non confirmée dans l'éditeur", "error");
      throw new Error("L'image n'a pas pu être insérée dans l'éditeur (timeout). Réessaie.");
    } finally {
      window.setTimeout(() => {
        imageOperationRef.current = false;
      }, 3000);
    }
  };

  const addImageUrl = async () => {
    const url = window.prompt("URL de l'image", "https://");
    if (url?.trim()) {
      const src = url.trim();
      try {
        editor?.chain().focus().insertContent({ type: "image", attrs: { src } }).run();
        await persistImageContent(src);
      } catch (error) {
        const message = error instanceof Error ? error.message : "L'image n'a pas pu etre sauvegardee.";
        notify(message, "error");
      }
    }
  };

  const pasteImageSrc = async (src: string) => {
    if (!editor) {
      return;
    }

    const pastedFile = src.startsWith("data:image/") ? imageFileFromDataUrl(src) : null;
    if (pastedFile) {
      await uploadImage(pastedFile);
      return;
    }

    try {
      editor.chain().focus().insertContent({ type: "image", attrs: { src } }).run();
      await persistImageContent(src);
    } catch (error) {
      const message = error instanceof Error ? error.message : "L'image collee n'a pas pu etre sauvegardee.";
      notify(message, "error");
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
    setSaveStatus("image-saving");
    notify("Image en cours d'envoi...", "info");

    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const path = `editor-images/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("project-media").upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });

      if (error) {
        throw new Error(error.message);
      }

      const { data } = supabase.storage.from("project-media").getPublicUrl(path);
      editor.chain().focus().insertContent({ type: "image", attrs: { src: data.publicUrl } }).run();
      await persistImageContent(data.publicUrl);
    } catch (error) {
      console.error("[editor-image] Upload/save failed", error);
      setSaveStatus("error");
      const message = error instanceof Error ? error.message : "L'image n'a pas pu etre enregistree.";
      notify(`${message} Aucun contenu existant n'a ete efface.`, "error");
    } finally {
      setUploading(false);
    }
  };

  if (!editor) {
    return <div className="min-h-[520px] rounded-lg border border-[var(--border)] bg-[var(--surface)]" />;
  }

  const toolbarDisabled = readOnly;
  const activeLinkHref = editor.getAttributes("link").href as string | undefined;
  const activeImageSrc = editor.getAttributes("image").src as string | undefined;
  const isInternalLinkActive = isInternalEditorHref(activeLinkHref);
  const activeLinkAccessLabel = activeLinkHref?.startsWith("/pages/")
    ? "Acceder a la page"
    : activeLinkHref?.startsWith("/documents/")
      ? "Acceder au document"
      : "Ouvrir le lien";
  const childLabel = currentTarget?.type === "document" ? "sous-document" : "sous-page";
  const statusText =
    saveStatus === "saving"
      ? "Sauvegarde..."
      : saveStatus === "saved"
        ? formatSavedAt(lastSavedAt)
        : saveStatus === "image-saving"
          ? "Image en cours d'envoi..."
          : saveStatus === "image-saved"
            ? formatSavedAt(lastSavedAt)
            : saveStatus === "image-unverified"
              ? "Image non confirmée"
              : saveStatus === "error"
                ? "Erreur de sauvegarde"
                : formatSavedAt(lastSavedAt);

  const copyActiveImageUrl = async () => {
    if (!activeImageSrc) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeImageSrc);
      notify("URL de l'image copiée", "success");
    } catch {
      notify("Copie impossible depuis ce navigateur", "error");
    }
  };

  const openActiveImage = () => {
    if (activeImageSrc) {
      window.open(activeImageSrc, "_blank", "noopener,noreferrer");
    }
  };

  const deleteActiveImage = async () => {
    if (!editor) {
      return;
    }

    try {
      editor.chain().focus().deleteSelection().run();
      await saveContent(editor.getJSON());
      notify("Image supprimee", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Suppression impossible.";
      notify(message, "error");
    }
  };

  const openActiveLink = () => {
    const href = editor.getAttributes("link").href;

    if (typeof href === "string" && href.trim()) {
      openEditorHref(href.trim());
    }
  };

  const copyActiveLinkUrl = async () => {
    const href = editor.getAttributes("link").href;

    if (typeof href !== "string" || !href.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(href.trim());
      notify("Lien copié", "success");
    } catch {
      notify("Copie impossible depuis ce navigateur", "error");
    }
  };

  const removeActiveLink = async () => {
    if (!editor) {
      return;
    }

    try {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      await saveContent(editor.getJSON());
      notify("Lien retiré", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de retirer le lien.";
      notify(message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
    <div className="min-w-0 w-full flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
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
          <span className="text-xs text-[var(--muted)]">Sauvegarde auto en arrière-plan</span>
        </div>
      )}

      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--surface-elevated)] p-2">
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
      </div>

      {!readOnly && (
        <BubbleMenu
          editor={editor}
          updateDelay={80}
          shouldShow={({ editor: menuEditor }) => {
            const href = menuEditor.getAttributes("link").href;
            return menuEditor.isActive("link") && typeof href === "string" && href.trim().length > 0;
          }}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-2xl shadow-black/35"
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openActiveLink}
            className="h-8 rounded-md px-2.5 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-elevated)]"
          >
            {activeLinkAccessLabel}
          </button>
          <IconMenuButton label="Copier le lien" onClick={() => void copyActiveLinkUrl()}>
            <Copy className="h-4 w-4" />
          </IconMenuButton>
          <IconMenuButton label="Retirer le lien" tone="danger" onClick={() => void removeActiveLink()}>
            <Trash2 className="h-4 w-4" />
          </IconMenuButton>
        </BubbleMenu>
      )}

      {!readOnly && (
        <BubbleMenu
          editor={editor}
          updateDelay={80}
          shouldShow={({ editor: menuEditor }) => menuEditor.isActive("image")}
          className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-2xl shadow-black/35"
        >
          <IconMenuButton label="Copier l'URL" onClick={() => void copyActiveImageUrl()}>
            <Copy className="h-4 w-4" />
          </IconMenuButton>
          <IconMenuButton label="Ouvrir" onClick={openActiveImage}>
            <ExternalLink className="h-4 w-4" />
          </IconMenuButton>
          <IconMenuButton label="Supprimer" tone="danger" onClick={() => void deleteActiveImage()}>
            <Trash2 className="h-4 w-4" />
          </IconMenuButton>
        </BubbleMenu>
      )}

      {!readOnly && currentTarget && (
        <BubbleMenu
          editor={editor}
          updateDelay={80}
          shouldShow={({ editor: menuEditor }) => {
            const { from, to, empty } = menuEditor.state.selection;
            return !menuEditor.isActive("link") && !empty && menuEditor.state.doc.textBetween(from, to, " ").trim().length > 0;
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
            {creatingInternalLink ? "Création..." : `Créer ${childLabel}`}
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
                <p className="mt-0.5 text-xs text-[var(--muted)]">Lie le texte sélectionné à une page ou un document.</p>
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
                <p className="text-sm text-[var(--muted)]">Choisis la page à relier au texte sélectionné.</p>
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
                    <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Aucune cible trouvée.</p>
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

      <EditorContent
        editor={editor}
        className="prose-editor"
        onKeyDown={(event) => {
          if (slashMenu && slashListRef.current) {
            const handled = slashListRef.current.onKeyDown(event.nativeEvent);
            if (handled) event.preventDefault();
          }
        }}
      />

      {slashMenu?.coords && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: slashMenu.coords.top + 4,
              left: slashMenu.coords.left,
              zIndex: 50
            }}
          >
            <SlashCommandsList
              ref={slashListRef}
              items={SLASH_COMMANDS.filter((cmd) => {
                const q = slashMenu.query.toLowerCase();
                return !q || cmd.title.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q);
              })}
              command={(item: SlashCommand) => {
                if (!editor) return;
                editor.chain().focus().deleteRange({ from: slashMenu.from, to: slashMenu.from + 1 + slashMenu.query.length }).run();
                item.command(editor);
                setSlashMenu(null);
              }}
            />
          </div>,
          document.body
        )
      }

      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
        <span>Glisse les poignées à gauche des blocs pour réorganiser le contenu.</span>
        <span className={cn(saveStatus === "error" && "text-red-300", saveStatus === "image-saving" && "text-[var(--accent)]")}>
          {statusText}
        </span>
      </div>
    </div>
    <TableOfContents editor={editor} />
    {toasts.length > 0 &&
      createPortal(
        <div className="fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm shadow-2xl shadow-black/25",
                toast.tone === "success" && "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
                toast.tone === "error" && "border-red-400/35 bg-red-500/15 text-red-100",
                toast.tone === "info" && "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              )}
            >
              {toast.message}
            </div>
          ))}
        </div>,
        document.body
      )}
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

function IconMenuButton({
  children,
  label,
  tone,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
        tone === "danger" && "text-red-300 hover:bg-red-500/15 hover:text-red-200"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-7 w-px bg-[var(--border)]" />;
}
