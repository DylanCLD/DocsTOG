import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { PageEditorClient } from "@/components/pages/page-editor-client";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/ui/delete-button";
import { deletePage } from "@/lib/actions/pages";
import { canDelete, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { PageRecord } from "@/types";

export default async function PageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("pages").select("*").eq("id", id).maybeSingle();

  if (!data) {
    notFound();
  }

  const page = data as PageRecord;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <Button variant="ghost" size="sm" asChildCompat>
            <Link href="/pages">
              <ArrowLeft className="h-4 w-4" />
              Retour aux pages
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-[var(--accent)]">Page</p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-semibold">
            <span>{page.icon}</span>
            {page.title}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
            <CalendarClock className="h-4 w-4" />
            Créée {formatDateTime(page.created_at)} · modifiée {formatDateTime(page.updated_at)}
          </p>
        </div>
        {canDelete(profile.role) && <DeleteButton action={deletePage.bind(null, page.id)} />}
      </div>

      <PageEditorClient page={page} profile={profile} />
    </div>
  );
}
