import { ThemeToggle } from "@/components/layout/theme-toggle";
import { GlobalSearch } from "@/components/layout/global-search";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] px-4 backdrop-blur-xl lg:px-6">
      <GlobalSearch />
      <ThemeToggle />
    </header>
  );
}
