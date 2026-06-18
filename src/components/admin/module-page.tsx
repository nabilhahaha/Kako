import type { ReactNode } from 'react';

/**
 * ModulePage — the platform page shell mandated by the VANTORA Navigation
 * Standard ("One rail, then rise"). It renders: an optional title/subtitle +
 * actions, an optional `nav` slot (a TopGroupingNav — module sections rising to
 * the top), then the content. It deliberately exposes NO secondary side-rail
 * slot: that structural omission is how the standard prevents a module from
 * introducing a second persistent navigation layer. A collection screen places
 * its master list inside `children` (content), not here. Presentation-only.
 */
export function ModulePage({
  title,
  subtitle,
  actions,
  nav,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  /** TopGroupingNav (one or two tiers). Rendered between the header and content. */
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h1 className="truncate text-xl font-semibold">{title}</h1>}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {nav && <div className="space-y-1">{nav}</div>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
