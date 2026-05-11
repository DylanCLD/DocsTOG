import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast-provider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSettings } from "@/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [settingsResult, favPagesResult, favDocsResult] = await Promise.all([
    supabase.from("workspace_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("pages").select("id,title,icon").eq("is_favorite", true).order("title"),
    supabase.from("documents").select("id,title").eq("is_favorite", true).order("title")
  ]);

  const favorites = {
    pages: (favPagesResult.data ?? []) as Array<{ id: string; title: string; icon: string }>,
    documents: (favDocsResult.data ?? []) as Array<{ id: string; title: string }>
  };

  return (
    <ToastProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[18rem_1fr]">
        <Sidebar profile={profile} settings={(settingsResult.data as WorkspaceSettings | null) ?? null} favorites={favorites} />
        <div className="min-w-0">
          <Topbar />
          <main className="w-full px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
