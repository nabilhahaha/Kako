import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAnyPermission } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ArrowRight } from 'lucide-react';
import { RouteCustomers, type Cust } from './route-customers';

export default async function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission(['reports.view', 'customers.manage']);
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const supabase = await createClient();
  const { data: route } = await supabase.from('erp_routes').select('id, name').eq('id', id).maybeSingle();
  if (!route) notFound();
  const { data: customers } = await supabase.from('erp_customers').select('id, code, name, name_ar, route_id').order('name').limit(1000);
  const list: Cust[] = ((customers as { id: string; code: string; name: string; name_ar: string | null; route_id: string | null }[]) ?? [])
    .map((c) => ({ id: c.id, code: c.code, name: c.name_ar || c.name, route_id: c.route_id }));

  return (
    <div>
      <Link href="/distribution/routes" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /> خطوط السير</Link>
      <PageHeader title={`عملاء خط: ${(route as { name: string }).name}`} description="أضِف عملاء للخط — هيتربطوا تلقائياً بمندوب الخط ويوم زيارته." />
      <RouteCustomers routeId={id} customers={list} />
    </div>
  );
}
