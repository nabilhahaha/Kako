import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ArrowRight } from 'lucide-react';

/** Public shell for the privacy / terms pages. */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link href="/"><Logo withWordmark /></Link>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            العودة للرئيسية <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">{title}</h1>
        {updated && <p className="mt-1 text-sm text-muted-foreground">آخر تحديث: {updated}</p>}
        <div className="mt-6 space-y-6 text-sm leading-7">{children}</div>
      </main>
    </div>
  );
}

/** A titled section within a legal page. */
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{heading}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
