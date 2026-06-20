import { redirect } from 'next/navigation';

/**
 * M3-B redirect stub — Customer Data is now a tab of the consolidated Custom
 * Fields page. Destination re-checks the `settings.custom_fields` gate;
 * bookmarks/deep links preserved.
 */
export default function CustomerDataRedirect() {
  redirect('/settings/custom-fields?tab=customer-data');
}
