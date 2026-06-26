import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

export default function NotFound() {
  return (
    <main className="brand-surface flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Wordmark className="text-2xl" />
      <p className="mt-8 font-serif text-6xl font-bold text-burgundy">404</p>
      <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight text-ink">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-burgundy px-5 py-2.5 text-sm font-medium text-cream hover:bg-burgundy-hover"
      >
        Back to Home
      </Link>
    </main>
  );
}
