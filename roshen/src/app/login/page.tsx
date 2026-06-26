import Link from "next/link";
import { login, signup } from "./actions";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand hero panel */}
      <aside className="brand-panel relative flex flex-col justify-between overflow-hidden px-8 py-10 text-cream lg:w-[46%] lg:px-14 lg:py-14">
        <Link href="/" className="relative z-10">
          <Wordmark tone="cream" className="text-2xl" />
        </Link>

        <div className="relative z-10 max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-gold-soft">
            Confectionery Excellence
          </p>
          <h1 className="mt-4 font-serif text-3xl font-semibold leading-snug sm:text-4xl">
            Crafted with care, managed with confidence.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-cream/75">
            Sign in to the Roshen business platform — a calm, premium workspace
            for the people behind every sweet moment.
          </p>
        </div>

        <p className="relative z-10 text-xs text-cream/55">
          © {new Date().getFullYear()} Roshen. Internal business platform.
        </p>

        {/* Decorative gold rings */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-gold/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full border border-gold/10"
        />
      </aside>

      {/* Form panel */}
      <section className="brand-surface flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Wordmark className="text-2xl" />
          </div>

          <div className="mt-6 lg:mt-0">
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink">
              Sign in
            </h2>
            <p className="mt-1 text-sm text-muted">
              Use your email and password to access the platform.
            </p>
          </div>

          {error ? (
            <p className="mt-5 rounded-xl border border-roshen-red/30 bg-burgundy-soft px-3.5 py-2.5 text-sm text-burgundy">
              {error}
            </p>
          ) : null}

          <form className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@roshen.com"
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none transition focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none transition focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
              />
            </div>

            <div className="flex flex-col gap-2.5 pt-2 sm:flex-row">
              <Button formAction={login} className="flex-1">
                Log in
              </Button>
              <Button formAction={signup} variant="outline" className="flex-1">
                Create account
              </Button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Protected workspace · Authorized personnel only
          </p>
        </div>
      </section>
    </main>
  );
}
