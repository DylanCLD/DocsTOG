"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FileText,
  FolderKanban,
  GalleryVerticalEnd,
  LayoutDashboard,
  LogOut,
  Settings,
  Star,
  StickyNote
} from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { cn, getInitials } from "@/lib/utils";
import type { Profile, WorkspaceSettings } from "@/types";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pages", label: "Pages", icon: StickyNote },
  { href: "/managers", label: "Gestionnaires", icon: FolderKanban },
  { href: "/planning", label: "Planning vocal", icon: CalendarDays },
  { href: "/media", label: "Médias", icon: GalleryVerticalEnd },
  { href: "/settings", label: "Paramètres", icon: Settings }
];

type Favorites = {
  pages: Array<{ id: string; title: string; icon: string }>;
  documents: Array<{ id: string; title: string }>;
};

export function Sidebar({
  profile,
  settings,
  favorites
}: {
  profile: Profile;
  settings: WorkspaceSettings | null;
  favorites?: Favorites;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-dvh w-full flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-0 lg:w-72">
      <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)]">
          <Image
            src={settings?.logo_url ?? "/logo.svg"}
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-cover"
            priority
            unoptimized
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{settings?.project_name ?? "Workspace Projet"}</p>
          <p className="truncate text-xs text-[var(--muted)]">Site équipe jeu/serveur</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
                isActive && "bg-[var(--surface-elevated)] text-[var(--text)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {((favorites?.pages?.length ?? 0) > 0 || (favorites?.documents?.length ?? 0) > 0) && (
          <div className="pt-3">
            <p className="mb-1 flex items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Star className="h-3 w-3" />
              Épinglés
            </p>
            {favorites?.pages?.map((page) => (
              <Link
                key={`fav-page-${page.id}`}
                href={`/pages/${page.id}`}
                className={cn(
                  "flex h-9 items-center gap-2 truncate rounded-lg px-3 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
                  pathname === `/pages/${page.id}` && "bg-[var(--surface-elevated)] text-[var(--text)]"
                )}
              >
                <span className="shrink-0 text-sm">{page.icon}</span>
                <span className="truncate">{page.title}</span>
              </Link>
            ))}
            {favorites?.documents?.map((doc) => (
              <Link
                key={`fav-doc-${doc.id}`}
                href={`/documents/${doc.id}`}
                className={cn(
                  "flex h-9 items-center gap-2 truncate rounded-lg px-3 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
                  pathname === `/documents/${doc.id}` && "bg-[var(--surface-elevated)] text-[var(--text)]"
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{doc.title}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-[var(--surface-elevated)] p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-soft)] text-sm font-semibold">
            {getInitials(profile.full_name ?? profile.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile.full_name ?? profile.email}</p>
            <p className="truncate text-xs capitalize text-[var(--muted)]">{profile.role}</p>
          </div>
        </div>
        <form action={signOut}>
          <button className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-200">
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  );
}
