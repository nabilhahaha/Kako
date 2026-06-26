import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { signout } from "@/app/login/actions";

export function SiteHeader({ email }: { email?: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-cream/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <Wordmark className="text-xl" />
          <span className="hidden text-xs font-medium uppercase tracking-[0.2em] text-muted sm:inline">
            Platform
          </span>
        </Link>

        <nav className="flex items-center gap-1.5 text-sm">
          {email ? (
            <>
              <Link
                href="/account"
                className="rounded-lg px-3 py-2 font-medium text-ink/80 hover:bg-burgundy-soft hover:text-burgundy"
              >
                Account
              </Link>
              <form action={signout}>
                <button className="rounded-lg px-3 py-2 font-medium text-burgundy hover:bg-burgundy-soft">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-xl bg-burgundy px-4 py-2 font-medium text-cream hover:bg-burgundy-hover"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
