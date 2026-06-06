import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PrintBackBar } from '@/components/print/print-back-bar';

export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  // In the desktop shell, print views are reached by same-window navigation
  // (WKWebView opens no new tab), so every print page needs a way back. Hidden
  // in the printed output. (DF-1)
  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <PrintBackBar />
      {children}
    </div>
  );
}
