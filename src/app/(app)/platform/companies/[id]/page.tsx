import { redirect } from 'next/navigation';

/**
 * The standalone company detail page is now folded into the Companies Workbench
 * (the single company administration center). This route redirects to the
 * workbench with the company preselected, preserving the requested tab — so
 * existing deep links keep working. Sub-routes (/analytics, /view-as) are
 * unaffected.
 */
export default async function PlatformCompanyDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  redirect(`/platform/companies?id=${id}${tab ? `&tab=${encodeURIComponent(tab)}` : ''}`);
}
