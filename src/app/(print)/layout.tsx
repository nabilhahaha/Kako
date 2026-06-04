import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';

export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  return <div className="mx-auto max-w-3xl bg-white p-6 text-black print:p-0">{children}</div>;
}
