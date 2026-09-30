import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { BacklinksPanel, BacklinksSkeleton } from "@/components/backlinks/backlinks-panel";
import { DocumentEditorClient } from "@/components/documents/document-editor-client";
import { DocumentHeaderBar } from "@/components/documents/document-header-bar";
import { DocumentTreeNav, type DocumentTreeRecord } from "@/components/documents/document-tree-nav";
import { TreeLayout } from "@/components/layout/tree-layout";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/breadcrumbs";
import { SubItemsList } from "@/components/navigation/sub-items-list";
import { deleteDocument, moveDocumentInTree, updateDocumentOrder } from "@/lib/actions/managers";
import { fetchBacklinks } from "@/lib/backlinks";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { collectAncestors } from "@/lib/hierarchy";
import { buildInternalLinkTargets } from "@/lib/internal-links";
import { getPanelPrefs } from "@/lib/panel-prefs-server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { DocumentManager, DocumentRecord, Profile } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DocumentWithManager = DocumentRecord & { document_managers: DocumentManager };

type NavigationDocumentRow = DocumentTreeRecord & {
  parent_document_id?: string | null;
};

type NavigationDocumentsResult = {
  documents: DocumentTreeRecord[];
  canReorder: boolean;
};

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("documents")
    .select("*, document_managers(*), users:responsible_id(id,email,full_name,avatar_url), document_tags(tags(id,name,color,created_at))")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const document = data as DocumentWithManager;
  // Started now so it runs alongside the queries below; the panel awaits it inside
  // <Suspense>, so it never delays the page. fetchBacklinks never rejects.
  const backlinks = fetchBacklinks(supabase, { type: "document", id: document.id });

  const [usersResult, siblingDocumentsResult, allPagesResult, allDocumentsResult, prefs] = await Promise.all([
    supabase.from("users").select("*").order("full_name", { ascending: true }),
    fetchNavigationDocuments(supabase, document.manager_id),
    supabase
      .from("pages")
      .select("id,parent_page_id,title,category")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id,parent_document_id,title,short_description,document_managers(name)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    getPanelPrefs()
  ]);

  const users = (usersResult.data ?? []) as Profile[];
  const navigationDocuments = siblingDocumentsResult.documents;
  let allPages = allPagesResult.data ?? [];
  let allDocuments = (allDocumentsResult.data ?? []) as Parameters<typeof buildInternalLinkTargets>[1];

  if (allPagesResult.error) {
    const fallbackPagesResult = await supabase
      .from("pages")
      .select("id,parent_page_id,title,category")
      .order("created_at", { ascending: true });

    if (!fallbackPagesResult.error) {
      allPages = fallbackPagesResult.data ?? [];
    } else {
      const flatPagesResult = await supabase
        .from("pages")
        .select("id,title,category")
        .order("created_at", { ascending: true });

      allPages = (flatPagesResult.data ?? []).map((page) => ({
        ...page,
        parent_page_id: null
      }));
    }
  }

  if (allDocumentsResult.error) {
    const fallbackDocumentsResult = await supabase
      .from("documents")
      .select("id,parent_document_id,title,short_description,document_managers(name)")
      .order("created_at", { ascending: true });

    if (!fallbackDocumentsResult.error) {
      allDocuments = (fallbackDocumentsResult.data ?? []) as Parameters<typeof buildInternalLinkTargets>[1];
    } else {
      const flatDocumentsResult = await supabase
        .from("documents")
        .select("id,title,short_description,document_managers(name)")
        .order("created_at", { ascending: true });

      allDocuments = (flatDocumentsResult.data ?? []).map((document) => ({
        ...document,
        parent_document_id: null
      })) as Parameters<typeof buildInternalLinkTargets>[1];
    }
  }

  const siblings = mergeCurrentDocumentIntoNavigation(document, navigationDocuments);
  const writer = canWrite(profile.role);
  const canReorderDocuments = writer && siblingDocumentsResult.canReorder;
  const internalLinkTargets = buildInternalLinkTargets(allPages, allDocuments);

  const managerName = document.document_managers?.name ?? "Gestionnaire";
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Gestionnaires", href: "/managers" },
    { label: managerName, href: `/managers/${document.manager_id}`, icon: document.document_managers?.icon },
    ...collectAncestors(siblings, document.id, (item) => item.parent_document_id).map((ancestor) => ({
      label: ancestor.title,
      href: `/documents/${ancestor.id}`
    })),
    { label: document.title }
  ];
  const subDocuments = siblings
    .filter((item) => item.parent_document_id === document.id)
    .map((child) => ({
      id: child.id,
      title: child.title,
      href: `/documents/${child.id}`,
      icon: <FileText className="h-3.5 w-3.5 text-[var(--accent)]" />
    }));

  return (
    <TreeLayout
      eyebrow={`${document.document_managers?.icon ?? ""} ${managerName}`.trim()}
      heading="Documents du gestionnaire"
      initialWidth={prefs.treeWidth}
      initialCollapsed={prefs.treeCollapsed}
      tree={
        <DocumentTreeNav
          documents={siblings}
          activeDocumentId={document.id}
          compact
          canReorder={canReorderDocuments}
          managerId={document.manager_id}
          onReorder={updateDocumentOrder}
          onMove={moveDocumentInTree}
        />
      }
    >
      <div className="space-y-3">
        <Breadcrumbs items={breadcrumbs} />
        <DocumentHeaderBar
          key={document.id}
          document={{
            id: document.id,
            manager_id: document.manager_id,
            title: document.title,
            short_description: document.short_description,
            status: document.status,
            priority: document.priority,
            responsible_id: document.responsible_id,
            is_favorite: document.is_favorite,
            users: document.users,
            document_tags: document.document_tags
          }}
          users={users}
          readOnly={!writer}
          createdLabel={formatDateTime(document.created_at)}
          updatedLabel={formatDateTime(document.updated_at)}
          deleteAction={canDelete(profile.role) ? deleteDocument.bind(null, document.id, document.manager_id) : undefined}
        />
        <SubItemsList label="Sous-documents" items={subDocuments} />
        <DocumentEditorClient document={document} users={users} profile={profile} internalLinkTargets={internalLinkTargets} />
        <Suspense fallback={<BacklinksSkeleton />}>
          <BacklinksPanel result={backlinks} subject="ce document" />
        </Suspense>
      </div>
    </TreeLayout>
  );
}

async function fetchNavigationDocuments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  managerId: string
): Promise<NavigationDocumentsResult> {
  const orderedResult = await supabase
    .from("documents")
    .select("id,manager_id,parent_document_id,title,short_description,sort_order,created_at")
    .eq("manager_id", managerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!orderedResult.error) {
    return {
      documents: normalizeNavigationDocuments((orderedResult.data ?? []) as NavigationDocumentRow[]),
      canReorder: true
    };
  }

  const hierarchyFallbackResult = await supabase
    .from("documents")
    .select("id,manager_id,parent_document_id,title,short_description,created_at")
    .eq("manager_id", managerId)
    .order("created_at", { ascending: true });

  if (!hierarchyFallbackResult.error) {
    return {
      documents: normalizeNavigationDocuments((hierarchyFallbackResult.data ?? []) as NavigationDocumentRow[]),
      canReorder: true
    };
  }

  const flatFallbackResult = await supabase
    .from("documents")
    .select("id,manager_id,title,short_description,created_at")
    .eq("manager_id", managerId)
    .order("created_at", { ascending: true });

  if (flatFallbackResult.error) {
    return {
      documents: [],
      canReorder: false
    };
  }

  return {
    documents: normalizeFlatNavigationDocuments((flatFallbackResult.data ?? []) as Array<Omit<NavigationDocumentRow, "parent_document_id">>),
    canReorder: true
  };
}

function normalizeNavigationDocuments(documents: NavigationDocumentRow[]): DocumentTreeRecord[] {
  return documents.map((document, index) => ({
    ...document,
    parent_document_id: document.parent_document_id ?? null,
    sort_order: typeof document.sort_order === "number" ? document.sort_order : index
  }));
}

function normalizeFlatNavigationDocuments(documents: Array<Omit<NavigationDocumentRow, "parent_document_id">>): DocumentTreeRecord[] {
  return documents.map((document, index) => ({
    ...document,
    parent_document_id: null,
    sort_order: index
  }));
}

function mergeCurrentDocumentIntoNavigation(current: DocumentWithManager, documents: DocumentTreeRecord[]): DocumentTreeRecord[] {
  const normalized = documents.map((document) => ({
    ...document,
    parent_document_id: document.parent_document_id ?? null
  }));

  if (normalized.some((document) => document.id === current.id)) {
    return normalized;
  }

  return [
    {
      id: current.id,
      manager_id: current.manager_id,
      parent_document_id: current.parent_document_id ?? null,
      title: current.title,
      short_description: current.short_description,
      sort_order: current.sort_order ?? 0,
      created_at: current.created_at
    },
    ...normalized
  ];
}
