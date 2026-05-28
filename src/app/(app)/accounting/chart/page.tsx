import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ACCOUNT_TYPE_LABELS } from '@/lib/erp/constants';
import type { AccountType, ChartOfAccount } from '@/lib/erp/types';

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

function depthOf(acc: ChartOfAccount, byId: Map<string, ChartOfAccount>): number {
  let d = 0;
  let cur = acc;
  while (cur.parent_id && byId.has(cur.parent_id) && d < 10) {
    cur = byId.get(cur.parent_id)!;
    d++;
  }
  return d;
}

export default async function ChartOfAccountsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_chart_of_accounts')
    .select('*')
    .order('code');
  const accounts = (data as ChartOfAccount[]) ?? [];
  const byId = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div>
      <PageHeader
        title="شجرة الحسابات"
        description={`دليل الحسابات المحاسبي (${accounts.length} حساب)`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {TYPE_ORDER.map((type) => {
          const list = accounts
            .filter((a) => a.account_type === type)
            .sort((a, b) => a.code.localeCompare(b.code));
          if (list.length === 0) return null;
          return (
            <Card key={type}>
              <CardContent className="pt-6">
                <h3 className="mb-3 font-semibold">{ACCOUNT_TYPE_LABELS[type].ar}</h3>
                <ul className="space-y-0.5 text-sm">
                  {list.map((a) => {
                    const depth = depthOf(a, byId);
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded px-2 py-1 hover:bg-secondary/40"
                        style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}
                      >
                        <span className={a.is_group ? 'font-semibold' : ''}>
                          <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">
                            {a.code}
                          </span>
                          {a.name_ar || a.name}
                        </span>
                        {a.is_system && depth === 0 && (
                          <Badge variant="outline" className="text-[10px]">رئيسي</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
