import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

const highlights = [
  {
    title: "Trade & Distribution",
    description:
      "A single view of distributors, orders, and field activity across every region.",
  },
  {
    title: "Quality & Standards",
    description:
      "Premium product standards tracked end-to-end, from production to retail shelf.",
  },
  {
    title: "Insightful Reporting",
    description:
      "Clear, board-ready analytics that keep commercial teams aligned and accountable.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <SiteHeader email={user?.email} />

      <main className="brand-surface flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-5 pt-16 pb-12 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold-soft/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-chocolate">
            Confectionery · Since 1996
          </span>

          <h1 className="mt-6 max-w-3xl font-serif text-4xl font-bold leading-tight tracking-tight text-ink sm:text-6xl">
            A premium platform for the{" "}
            <span className="text-burgundy">Roshen</span> business.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Elegant, dependable tooling for the teams behind one of the world&apos;s
            most loved confectionery brands — built for clarity, crafted for trust.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {user ? (
              <Link href="/account">
                <Button size="lg">Go to your account</Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="lg">Sign in to continue</Button>
              </Link>
            )}
            <Link href="/account">
              <Button variant="outline" size="lg">
                Explore the dashboard
              </Button>
            </Link>
          </div>

          {/* Status pill */}
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow-sm ring-1 ring-line">
            <span
              className={`h-2 w-2 rounded-full ${user ? "bg-gold" : "bg-muted/50"}`}
            />
            {user ? (
              <span>
                Signed in as <span className="font-medium">{user.email}</span>
              </span>
            ) : (
              <span className="text-muted">You are not signed in</span>
            )}
          </div>
        </section>

        {/* Highlight cards */}
        <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 pb-20 sm:grid-cols-3">
          {highlights.map((item) => (
            <Card key={item.title} className="p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-burgundy-soft text-burgundy">
                <span className="h-2.5 w-2.5 rounded-full bg-gold" />
              </span>
              <CardContent className="p-0 pt-4">
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
