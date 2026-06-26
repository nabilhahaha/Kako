import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const stats = [
  { label: "Active distributors", value: "128" },
  { label: "Open orders", value: "342" },
  { label: "Regions covered", value: "16" },
];

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <SiteHeader email={user.email} />

      <main className="brand-surface flex-1">
        <div className="mx-auto w-full max-w-6xl px-5 py-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-hover">
            Dashboard
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as <span className="font-medium text-ink">{user.email}</span>
          </p>

          {/* Stat cards */}
          <section className="mt-8 grid gap-5 sm:grid-cols-3">
            {stats.map((stat) => (
              <Card key={stat.label} className="p-6">
                <p className="text-sm text-muted">{stat.label}</p>
                <p className="mt-2 font-serif text-3xl font-semibold text-burgundy">
                  {stat.value}
                </p>
                <div className="mt-3 h-1 w-12 rounded-full bg-gold-soft" />
              </Card>
            ))}
          </section>

          {/* Detail panels */}
          <section className="mt-6 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Account details</CardTitle>
                <CardDescription>
                  Your Supabase-authenticated session.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-line text-sm">
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted">Email</dt>
                    <dd className="font-medium text-ink">{user.email}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted">User ID</dt>
                    <dd className="font-mono text-xs text-ink">{user.id}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-muted">Status</dt>
                    <dd>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft/50 px-2.5 py-0.5 text-xs font-medium text-chocolate">
                        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                        Active
                      </span>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Getting started</CardTitle>
                <CardDescription>
                  This protected page confirms auth and session refresh are wired up.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-ink/80">
                  {[
                    "Supabase browser, server, and proxy clients configured",
                    "Password login, signup, and signout via Server Actions",
                    "Roshen brand tokens, cards, and buttons in place",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-burgundy" />
                      {line}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
