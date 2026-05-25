import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { isRTL } from '@/i18n';
import { TradeSpendTopBar } from './TradeSpendTopBar';
import { TradeSpendSidebar } from './TradeSpendSidebar';
import { TradeSpendBottomNav } from './TradeSpendBottomNav';

export function TradeSpendShell() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const dir = isRTL(i18n.language) ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <TradeSpendSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TradeSpendTopBar />
        <main className="flex-1 overflow-y-auto p-4 pb-20 lg:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>
      <TradeSpendBottomNav />
    </div>
  );
}
