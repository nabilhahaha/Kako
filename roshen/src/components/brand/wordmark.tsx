import { cn } from "@/lib/cn";

/**
 * Text-based Roshen wordmark. We use temporary text branding because no
 * approved Roshen logo asset is available; swap for the official mark when
 * one is provided.
 */
export function Wordmark({
  className,
  tone = "burgundy",
}: {
  className?: string;
  tone?: "burgundy" | "cream";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-serif font-bold tracking-tight",
        tone === "cream" ? "text-cream" : "text-burgundy",
        className,
      )}
    >
      Roshen
      <span
        aria-hidden
        className={cn(
          "ml-1 inline-block h-1.5 w-1.5 translate-y-[-0.15em] rounded-full",
          tone === "cream" ? "bg-gold-soft" : "bg-gold",
        )}
      />
    </span>
  );
}
