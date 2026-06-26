import { Search, Bell } from "lucide-react";
import { signout } from "@/app/login/actions";

function initials(name?: string | null, email?: string | null) {
  const base = name?.trim() || email?.split("@")[0] || "U";
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppTopbar({
  name,
  email,
  roleLabel,
}: {
  name?: string | null;
  email?: string | null;
  roleLabel: string;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-line bg-cream/85 px-4 backdrop-blur lg:px-6">
      {/* Search */}
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          placeholder="Search regions, branches, agents, items…"
          className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted/60 focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Arabic language placeholder */}
        <button
          className="rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium text-ink/70 hover:bg-burgundy-soft hover:text-burgundy"
          title="Arabic (coming soon)"
        >
          العربية
        </button>

        {/* Notifications placeholder */}
        <button className="relative rounded-lg border border-line p-2 text-muted hover:bg-burgundy-soft hover:text-burgundy">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-roshen-red px-1 text-[10px] font-semibold text-cream">
            3
          </span>
        </button>

        {/* User + role */}
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-2 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-burgundy text-xs font-semibold text-cream">
            {initials(name, email)}
          </span>
          <div className="hidden text-left leading-tight sm:block">
            <p className="text-sm font-medium text-ink">{name ?? email}</p>
            <p className="text-[11px] font-medium text-gold-hover">{roleLabel}</p>
          </div>
        </div>

        <form action={signout}>
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-burgundy hover:bg-burgundy-soft">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
