import { ShieldCheck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import {
  addAllowedEmail,
  updateAllowedEmail,
  updateUserRole,
  updateWorkspaceSettings
} from "@/lib/actions/settings";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { AllowedEmail, Profile, WorkspaceSettings } from "@/types";
import { ROLE_LABELS } from "@/types";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [settingsResult, allowedEmailsResult, usersResult] = await Promise.all([
    supabase.from("workspace_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("allowed_emails").select("*").order("created_at", { ascending: false }),
    supabase.from("users").select("*").order("last_seen_at", { ascending: false })
  ]);

  const settings = settingsResult.data as WorkspaceSettings | null;
  const allowedEmails = (allowedEmailsResult.data ?? []) as AllowedEmail[];
  const users = (usersResult.data ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--accent)]">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold">Paramètres</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Configure le workspace, les accès autorisés, les rôles et les préférences globales du site.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Workspace</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Nom, logo et thème par défaut.</p>
          </CardHeader>
          <CardContent>
            <form action={updateWorkspaceSettings} className="space-y-3">
              <div>
                <Label htmlFor="project_name">Nom du projet</Label>
                <Input id="project_name" name="project_name" defaultValue={settings?.project_name ?? "Workspace Projet"} required />
              </div>
              <div>
                <Label htmlFor="logo_url">Logo du projet</Label>
                <Input id="logo_url" name="logo_url" defaultValue={settings?.logo_url ?? ""} placeholder="https://..." />
              </div>
              <div>
                <Label htmlFor="theme">Thème par défaut</Label>
                <Select id="theme" name="theme" defaultValue={settings?.theme ?? "dark"}>
                  <option value="dark">Sombre</option>
                  <option value="light">Clair</option>
                </Select>
              </div>
              <Button type="submit">Enregistrer le workspace</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="font-semibold">Emails autorisés</h2>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">Ajoute les membres avant leur première connexion Google.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={addAllowedEmail} className="grid gap-3 md:grid-cols-[1fr_12rem_auto] md:items-end">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="membre@example.com" required />
              </div>
              <div>
                <Label htmlFor="role">Rôle</Label>
                <Select id="role" name="role" defaultValue="member">
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
              <Button type="submit">Ajouter</Button>
            </form>

            <div className="space-y-2">
              {allowedEmails.map((item) => (
                <form key={item.id} action={updateAllowedEmail.bind(null, item.id)} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3 md:grid-cols-[1fr_10rem_8rem_auto] md:items-center">
                  <Input name="email" type="email" defaultValue={item.email} />
                  <Select name="role" defaultValue={item.role}>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <input name="is_active" type="checkbox" defaultChecked={item.is_active} />
                    Actif
                  </label>
                  <Button type="submit" variant="secondary" size="sm">Mettre à jour</Button>
                </form>
              ))}
              {allowedEmails.length === 0 && <p className="text-sm text-[var(--muted)]">Aucun email autorisé en base.</p>}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="font-semibold">Utilisateurs connectés</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">Ajuste les rôles des comptes déjà passés par Google Auth.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((user) => (
            <form key={user.id} action={updateUserRole.bind(null, user.id)} className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3 md:grid-cols-[1fr_12rem_12rem_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium">{user.full_name ?? user.email}</p>
                <p className="truncate text-sm text-[var(--muted)]">{user.email}</p>
              </div>
              <Badge tone={user.role === "admin" ? "accent" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
              <Select name="role" defaultValue={user.role}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" size="sm">Changer</Button>
              <p className="md:col-span-4 text-xs text-[var(--muted)]">Dernière activité: {formatDateTime(user.last_seen_at)}</p>
            </form>
          ))}
          {users.length === 0 && <p className="text-sm text-[var(--muted)]">Aucun utilisateur connecté.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
