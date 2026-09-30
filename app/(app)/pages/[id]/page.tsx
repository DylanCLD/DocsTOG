import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BacklinksPanel, BacklinksSkeleton } from "@/components/backlinks/backlinks-panel";
import { TreeLayout } from "@/components/layout/tree-layout";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/breadcrumbs";
import { SubItemsList } from "@/components/navigation/sub-items-list";
import { PageEditorClient } from "@/components/pages/page-editor-client";
import { PageHeaderBar } from "@/components/pages/page-header-bar";
import { PageTreeNav } from "@/components/pages/page-tree-nav";
import { deletePage, movePageInTree, updatePageOrder } from "@/lib/actions/pages";
import { fetchBacklinks } from "@/lib/backlinks";
import { canDelete, canWrite, requireProfile } from "@/lib/auth";
import { collectAncestors } from "@/lib/hierarchy";
import { buildInternalLinkTargets } from "@/lib/internal-links";
import { getPanelPrefs } from "@/lib/panel-prefs-server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { PageRecord } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("pages").select("*").eq("id", id).maybeSingle();

  if (!data) {
    notFound();
  }

  const page = data as PageRecord;
  // Started now so it runs alongside the queries below; the panel awaits it inside
  // <Suspense>, so it never delays the page. fetchBacklinks never rejects.
  const backlinks = fetchBacklinks(supabase, { type: "page", id: page.id });
  const [allPagesResult, allDocumentsResult, usersResult, prefs] = await Promise.all([
    supabase
      .from("pages")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id,parent_document_id,title,short_description,document_managers(name)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("users").select("id,email,full_name"),
    getPanelPrefs()
  ]);
  let pages = (allPagesResult.data ?? []) as PageRecord[];
  let allDocuments = (allDocumentsResult.data ?? []) as Parameters<typeof buildInternalLinkTargets>[1];

  if (allPagesResult.error && isMissingSortOrderColumn(allPagesResult.error)) {
    const fallbackPagesResult = await supabase.from("pages").select("*").order("created_at", { ascending: true });
    pages = (fallbackPagesResult.data ?? []) as PageRecord[];
  }

  if (allDocumentsResult.error && isMissingSortOrderColumn(allDocumentsResult.error)) {
    const fallbackDocumentsResult = await supabase
      .from("documents")
      .select("id,parent_document_id,title,short_description,document_managers(name)")
      .order("created_at", { ascending: true });

    allDocuments = (fallbackDocumentsResult.data ?? []) as Parameters<typeof buildInternalLinkTargets>[1];
  }

  const writer = canWrite(profile.role);
  const internalLinkTargets = buildInternalLinkTargets(pages, allDocuments);
  const users = (usersResult.data ?? []) as Array<{ id: string; email: string; full_name: string | null }>;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Pages", href: "/pages" },
    ...collectAncestors(pages, page.id, (item) => item.parent_page_id).map((ancestor) => ({
      label: ancestor.title,
      href: `/pages/${ancestor.id}`,
      icon: ancestor.icon
    })),
    { label: page.title, icon: page.icon }
  ];
  const subPages = pages
    .filter((item) => item.parent_page_id === page.id)
    .map((child) => ({ id: child.id, title: child.title, href: `/pages/${child.id}`, icon: child.icon }));

  return (
    <TreeLayout
      eyebrow="Pages"
      heading="Arborescence"
      initialWidth={prefs.treeWidth}
      initialCollapsed={prefs.treeCollapsed}
      tree={
        <PageTreeNav
          pages={pages}
          activePageId={page.id}
          compact
          canReorder={writer}
          onReorder={updatePageOrder}
          onMove={movePageInTree}
        />
      }
    >
      <div className="space-y-3">
        <Breadcrumbs items={breadcrumbs} />
        <PageHeaderBar
          key={page.id}
          page={{ id: page.id, title: page.title, icon: page.icon, category: page.category, is_favorite: page.is_favorite }}
          readOnly={!writer}
          createdLabel={formatDateTime(page.created_at)}
          updatedLabel={formatDateTime(page.updated_at)}
          deleteAction={canDelete(profile.role) ? deletePage.bind(null, page.id) : undefined}
        />
        <SubItemsList label="Sous-pages" items={subPages} />
        <PageEditorClient page={page} profile={profile} internalLinkTargets={internalLinkTargets} users={users} />
        <Suspense fallback={<BacklinksSkeleton />}>
          <BacklinksPanel result={backlinks} subject="cette page" />
        </Suspense>
      </div>
    </TreeLayout>
  );
}

function isMissingSortOrderColumn(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.code === "42703" || error.code === "PGRST204" || (message.includes("sort_order") && message.includes("column"));
}
