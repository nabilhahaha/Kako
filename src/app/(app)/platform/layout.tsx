import { PlatformSearchBar } from './platform-search-bar';

/**
 * Platform-area shell. Mounts the global-search command palette (⌘K) + its
 * header trigger so it works across /platform/*. Pure UI; the per-page guards
 * (owner/permission checks) live in each page.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PlatformSearchBar />
      {children}
    </>
  );
}
