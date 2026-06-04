'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

/**
 * Server-side search box. Debounces input into the URL as `?<paramName>=…`
 * (resetting `page` to 1) so the server component re-queries with the filter
 * applied across the whole table — not just the rows on the current page.
 */
export function ListSearch({
  paramName = 'q',
  placeholder,
  className,
}: {
  paramName?: string;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramName) ?? '';
  const [value, setValue] = useState(current);

  useEffect(() => {
    const v = value.trim();
    // Already in sync (covers the post-navigation re-render) — nothing to push.
    if (v === current) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (v) params.set(paramName, v);
      else params.delete(paramName);
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 350);
    return () => clearTimeout(t);
  }, [value, current, paramName, pathname, router, searchParams]);

  return (
    <div className={`relative ${className ?? 'w-full sm:w-72'}`}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="ps-9"
      />
    </div>
  );
}
