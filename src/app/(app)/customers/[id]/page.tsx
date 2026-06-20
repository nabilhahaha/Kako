import { redirect } from 'next/navigation';

/**
 * P5-4: the bespoke customer statement page is superseded by the Customer
 * Workbench. Preserve the deep link — /customers/[id] lands on the workbench
 * with that customer selected, on the Statement facet.
 */
export default async function CustomerDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/customers?id=${id}&tab=statement`);
}
