import { redirect } from 'next/navigation';

/**
 * M3-B redirect stub — Field Governance is now the Governance tab of the
 * consolidated Custom Fields page. The `entity` param is forwarded so the
 * manager's entity selector (which pushes to this route) keeps working unchanged.
 * Destination re-checks the `settings.custom_fields` gate; bookmarks preserved.
 */
export default async function FieldGovernanceRedirect({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const sp = await searchParams;
  const entity = sp.entity ? `&entity=${encodeURIComponent(sp.entity)}` : '';
  redirect(`/settings/custom-fields?tab=governance${entity}`);
}
