import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSettings } from "@/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("workspace_settings").select("*").eq("id", true).maybeSingle();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[18rem_1fr]">
      <Sidebar profile={profile} settings={(settings as WorkspaceSettings | null) ?? null} />
      <div className="min-w-0">
        <Topbar />
        <main className="w-full px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
