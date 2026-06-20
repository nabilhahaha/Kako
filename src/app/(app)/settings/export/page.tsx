import { redirect } from 'next/navigation';

/**
 * M3-C redirect stub — Export is now the Export tab of the consolidated Data
 * Exchange page (/settings/import). Destination re-checks the
 * `integrations.manage` gate; bookmarks/deep links preserved.
 */
export default function ExportRedirect() {
  redirect('/settings/import?tab=export');
}
