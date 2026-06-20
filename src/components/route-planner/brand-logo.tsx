import * as React from 'react';

/**
 * VANTORA Route Planner brand mark + wordmark (pure SVG/inline — no image assets, so it
 * is crisp at any size and theme-aware via currentColor / the primary token).
 *
 * The mark is a rounded "map tile" with a route line threading three stops — the product
 * in one glyph: territory + sequence + visit points.
 */

export function RoutePlannerMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden role="img">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" className="fill-primary" />
      {/* route line */}
      <path d="M8 22 C 12 22, 12 13, 16 13 C 20 13, 20 21, 24 10" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95" />
      {/* stops */}
      <circle cx="8" cy="22" r="2.4" fill="white" />
      <circle cx="16" cy="13" r="2.4" fill="white" />
      <circle cx="24" cy="10" r="2.4" fill="white" />
      <circle cx="16" cy="13" r="1" className="fill-primary" />
    </svg>
  );
}

/**
 * Full lockup: mark + "VANTORA Route Planner" wordmark. `tone` flips the text colour for
 * dark/coloured backgrounds.
 */
export function RoutePlannerLogo({
  size = 28,
  tone = 'default',
  showProduct = true,
  className,
}: {
  size?: number;
  tone?: 'default' | 'invert';
  showProduct?: boolean;
  className?: string;
}) {
  const brand = tone === 'invert' ? 'text-white' : 'text-foreground';
  const product = tone === 'invert' ? 'text-white/80' : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <RoutePlannerMark size={size} />
      <span className="leading-none">
        <span className={`font-bold tracking-tight ${brand}`}>VANTORA</span>
        {showProduct && <span className={`font-medium ${product}`}> Route Planner</span>}
      </span>
    </span>
  );
}
