"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Star,
  StickyNote
} from "lucide-react";
import { useSidebarCollapse } from "@/components/layout/app-shell";
import { useTitleTooltip } from "@/components/navigation/title-tooltip";
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

// Retracted rail (lg and up only; below lg the sidebar is stacked and always expanded).
// Rules key off the `data-collapsed` attribute on the <aside>, so the markup stays a single path.
const RAIL_CENTER = "group-data-[collapsed=true]/sidebar:lg:justify-center group-data-[collapsed=true]/sidebar:lg:px-0";
const RAIL_HIDE = "group-data-[collapsed=true]/sidebar:lg:hidden";
const RAIL_LABEL = "group-data-[collapsed=true]/sidebar:lg:sr-only";

const iconButtonClass =
  "h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

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
  const sidebarState = useSidebarCollapse();
  const collapsed = sidebarState?.collapsed ?? false;
  const projectName = settings?.project_name ?? "Workspace Projet";
  const userName = profile.full_name ?? profile.email;

  // The two toggle buttons are different elements (header vs rail): hand the focus over
  // to the one that takes its place so keyboard users do not lose their position.
  const collapseButton = useRef<HTMLButtonElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!restoreFocus.current) {
      return;
    }

    restoreFocus.current = false;
    (collapsed ? expandButton : collapseButton).current?.focus();
  }, [collapsed]);

  const handleToggle = () => {
    restoreFocus.current = true;
    sidebarState?.toggle();
  };

  return (
    <aside
      data-collapsed={collapsed}
      className="group/sidebar flex h-dvh w-full flex-col border-r border-[var(--border)] bg-[var(--surface)]"
    >
      <div className={cn("flex h-16 items-center gap-3 border-b border-[var(--border)] px-4", RAIL_CENTER)}>
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
        <div className={cn("min-w-0 flex-1", RAIL_HIDE)}>
          <p className="truncate text-sm font-semibold" title={projectName}>{projectName}</p>
          <p className="truncate text-xs text-[var(--muted)]">Site équipe jeu/serveur</p>
        </div>
        {sidebarState ? (
          <button
            ref={collapseButton}
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            aria-label="Réduire la barre latérale"
            title="Réduire la barre latérale"
            className={cn("hidden lg:inline-flex", RAIL_HIDE, iconButtonClass)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 group-data-[collapsed=true]/sidebar:lg:p-2">
        {sidebarState ? (
          <button
            ref={expandButton}
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            aria-label="Agrandir la barre latérale"
            title="Agrandir la barre latérale"
            className="mb-1 hidden h-10 w-full items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] group-data-[collapsed=true]/sidebar:lg:flex"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : null}

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
                RAIL_CENTER,
                isActive && "bg-[var(--surface-elevated)] text-[var(--text)] shadow-[inset_2px_0_0_var(--accent)]"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-[var(--accent)]")} />
              <span className={RAIL_LABEL}>{item.label}</span>
            </Link>
          );
        })}

        {((favorites?.pages?.length ?? 0) > 0 || (favorites?.documents?.length ?? 0) > 0) && (
          <div className="pt-3">
            <p className={cn("mb-1 flex items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]", RAIL_HIDE)}>
              <Star className="h-3 w-3" />
              Épinglés
            </p>
            <div aria-hidden="true" className="mx-2 mb-2 hidden border-t border-[var(--border)] group-data-[collapsed=true]/sidebar:lg:block" />
            {favorites?.pages?.map((page) => (
              <PinnedLink
                key={`fav-page-${page.id}`}
                href={`/pages/${page.id}`}
                title={page.title}
                active={pathname === `/pages/${page.id}`}
                collapsed={collapsed}
                icon={<span className="shrink-0 text-sm">{page.icon}</span>}
              />
            ))}
            {favorites?.documents?.map((doc) => (
              <PinnedLink
                key={`fav-doc-${doc.id}`}
                href={`/documents/${doc.id}`}
                title={doc.title}
                active={pathname === `/documents/${doc.id}`}
                collapsed={collapsed}
                icon={<FileText className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-[var(--border)] p-3 group-data-[collapsed=true]/sidebar:lg:p-2">
        <div
          title={collapsed ? `${userName} (${profile.role})` : undefined}
          className={cn(
            "mb-3 flex items-center gap-3 rounded-lg bg-[var(--surface-elevated)] p-3",
            RAIL_CENTER,
            "group-data-[collapsed=true]/sidebar:lg:p-1.5"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-soft)] text-sm font-semibold">
            {getInitials(userName)}
          </div>
          <div className={cn("min-w-0 flex-1", RAIL_HIDE)}>
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs capitalize text-[var(--muted)]">{profile.role}</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            title={collapsed ? "Déconnexion" : undefined}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-[var(--muted)] transition hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger)]",
              RAIL_CENTER
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={RAIL_LABEL}>Déconnexion</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

function PinnedLink({
  href,
  title,
  active,
  collapsed,
  icon
}: {
  href: string;
  title: string;
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
}) {
  const { bindLabel, anchorProps, portal } = useTitleTooltip(title);

  return (
    <>
      <Link
        href={href}
        // Retracted rail: the label is hidden, so a native tooltip carries the title.
        // Expanded: the floating tooltip only shows when the title is truncated.
        {...(collapsed ? {} : anchorProps)}
        title={collapsed ? title : undefined}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]",
          RAIL_CENTER,
          active && "bg-[var(--surface-elevated)] text-[var(--text)]"
        )}
      >
        {icon}
        <span ref={bindLabel} className={cn("truncate", RAIL_LABEL)}>{title}</span>
      </Link>
      {portal}
    </>
  );
}
