import { highlightMatch } from '@/lib/erp/search-helpers';

/** Renders `text` with the (case-insensitive) match of `query` highlighted.
 *  Adapts the Typesense/Meilisearch instant-search highlight pattern. Pure
 *  presentational — usable in search results / comboboxes. */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = highlightMatch(text, query);
  return (
    <>
      {segments.map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded bg-warning/30 px-0.5 text-foreground">{s.text}</mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
