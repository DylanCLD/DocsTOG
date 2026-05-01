import type { DocumentManager, DocumentRecord, InternalLinkTarget, PageRecord } from "@/types";

type DocumentTargetRecord = Pick<DocumentRecord, "id" | "parent_document_id" | "title" | "short_description"> & {
  document_managers?: Pick<DocumentManager, "name"> | Array<Pick<DocumentManager, "name">> | null;
};

export function buildInternalLinkTargets(
  pages: Array<Pick<PageRecord, "id" | "parent_page_id" | "title" | "category">>,
  documents: DocumentTargetRecord[]
): InternalLinkTarget[] {
  return [
    ...pages.map((page) => ({
      id: page.id,
      type: "page" as const,
      title: page.title,
      subtitle: page.category,
      href: `/pages/${page.id}`,
      parentId: page.parent_page_id
    })),
    ...documents.map((document) => {
      const manager = Array.isArray(document.document_managers)
        ? document.document_managers[0]
        : document.document_managers;

      return {
        id: document.id,
        type: "document" as const,
        title: document.title,
        subtitle: document.short_description ?? manager?.name ?? null,
        href: `/documents/${document.id}`,
        parentId: document.parent_document_id
      };
    })
  ];
}
