import { AppShell } from "@/components/layout/app-shell";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast-provider";
import { requireProfile } from "@/lib/auth";
import { getPanelPrefs } from "@/lib/panel-prefs-server";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSettings } from "@/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [settingsResult, favPagesResult, favDocsResult, prefs] = await Promise.all([
    supabase.from("workspace_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("pages").select("id,title,icon").eq("is_favorite", true).order("title"),
    supabase.from("documents").select("id,title").eq("is_favorite", true).order("title"),
    getPanelPrefs()
  ]);

  const favorites = {
    pages: (favPagesResult.data ?? []) as Array<{ id: string; title: string; icon: string }>,
    documents: (favDocsResult.data ?? []) as Array<{ id: string; title: string }>
  };

  return (
    <ToastProvider>
      <AppShell
        initialSidebarWidth={prefs.sidebarWidth}
        initialSidebarCollapsed={prefs.sidebarCollapsed}
        sidebar={<Sidebar profile={profile} settings={(settingsResult.data as WorkspaceSettings | null) ?? null} favorites={favorites} />}
      >
        <Topbar />
        <main className="w-full px-4 py-4 lg:px-6 lg:py-5">{children}</main>
      </AppShell>
    </ToastProvider>
  );
}
