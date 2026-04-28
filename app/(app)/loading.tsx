export default function AppLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-28 animate-pulse rounded bg-[var(--surface-elevated)]" />
        <div className="h-9 w-72 max-w-full animate-pulse rounded bg-[var(--surface-elevated)]" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-[var(--surface-elevated)]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
        <div className="h-80 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    </div>
  );
}
