// Reusable print/document brand logo. Renders the company logo when present
// (additive — nothing shows when there is no logo_url). Uses a plain <img> on
// purpose: print pages are server-rendered static documents, not app surfaces,
// so next/image optimization is unnecessary and would complicate printing.
export function BrandLogo({ url, className }: { url?: string | null; className?: string }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className ?? 'h-12 w-auto max-w-[160px] object-contain'} />;
}
