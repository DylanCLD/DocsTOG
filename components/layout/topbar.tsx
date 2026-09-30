import { ThemeToggle } from "@/components/layout/theme-toggle";
import { GlobalSearch } from "@/components/layout/global-search";

// The height is fixed on purpose: the editor toolbar sticks at `top-16` (4rem)
// right under this bar, so both must stay in sync.
export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_88%,transparent)] px-4 backdrop-blur-xl lg:px-6">
      <GlobalSearch />
      <ThemeToggle />
    </header>
  );
}
