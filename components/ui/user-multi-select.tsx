"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, UsersRound } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/types";

type UserOption = Pick<Profile, "id" | "email" | "full_name" | "avatar_url">;

export function UserMultiSelect({
  name,
  users,
  defaultEmails = [],
  label = "Participants"
}: {
  name: string;
  users: UserOption[];
  defaultEmails?: string[];
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedEmails, setSelectedEmails] = useState(
    () => new Set(defaultEmails.map((email) => email.toLowerCase()))
  );

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return users.filter((user) => {
      const target = `${user.full_name ?? ""} ${user.email}`.toLowerCase();
      return !normalized || target.includes(normalized);
    });
  }, [query, users]);

  const allSelected = users.length > 0 && users.every((user) => selectedEmails.has(user.email.toLowerCase()));
  const value = Array.from(selectedEmails).join(", ");

  const toggleEmail = (email: string) => {
    const normalized = email.toLowerCase();
    setSelectedEmails((current) => {
      const next = new Set(current);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedEmails((current) => {
      if (allSelected) {
        return new Set();
      }

      return new Set([...current, ...users.map((user) => user.email.toLowerCase())]);
    });
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>

      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus-visible:border-[var(--accent)]">
          <span className="flex min-w-0 items-center gap-2">
            <UsersRound className="h-4 w-4 text-[var(--accent)]" />
            <span className="truncate text-[var(--muted)]">
              {selectedEmails.size === 0
                ? "Selectionner des personnes"
                : `${selectedEmails.size} personne${selectedEmails.size > 1 ? "s" : ""} selectionnee${selectedEmails.size > 1 ? "s" : ""}`}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-open:rotate-180" />
        </summary>

        <div className="absolute left-0 right-0 z-40 mt-2 max-h-[26rem] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl shadow-black/30 md:w-[28rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une personne..."
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={toggleAll}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--surface-soft)]"
          >
            <span>Tout le monde</span>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded border",
                allSelected ? "border-[var(--accent)] bg-[var(--accent)] text-[#07110f]" : "border-[var(--border)]"
              )}
            >
              {allSelected && <Check className="h-3.5 w-3.5" />}
            </span>
          </button>

          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
            {filteredUsers.map((user) => {
              const checked = selectedEmails.has(user.email.toLowerCase());

              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleEmail(user.email)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--surface-elevated)]"
                >
                  <UserAvatar user={user} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{user.full_name ?? user.email}</span>
                    <span className="block truncate text-xs text-[var(--muted)]">{user.email}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border",
                      checked ? "border-[var(--accent)] bg-[var(--accent)] text-[#07110f]" : "border-[var(--border)]"
                    )}
                  >
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}

            {filteredUsers.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-[var(--muted)]">Aucun utilisateur trouve.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function UserAvatar({ user }: { user: UserOption }) {
  if (user.avatar_url) {
    return (
      <span
        className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${user.avatar_url}")` }}
        aria-label={user.full_name ?? user.email}
      />
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-elevated)] text-xs font-semibold">
      {getInitials(user.full_name ?? user.email)}
    </span>
  );
}
