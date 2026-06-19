import { redirect } from 'next/navigation';

/**
 * P5-4: the bespoke Customer 360 page is superseded by the Customer Workbench.
 * Preserve the deep link — /customers/[id]/360 lands on the workbench with that
 * customer selected, on the Activity facet (the unified 360 timeline).
 */
export default async function Customer360Redirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/customers?id=${id}&tab=activity`);
}
