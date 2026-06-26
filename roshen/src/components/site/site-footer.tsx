import { Wordmark } from "@/components/brand/wordmark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-muted sm:flex-row">
        <Wordmark className="text-base" />
        <p>Premium confectionery business platform</p>
      </div>
    </footer>
  );
}
