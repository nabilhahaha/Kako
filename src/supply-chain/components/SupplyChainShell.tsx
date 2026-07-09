/** Application shell: sidebar navigation, top bar with global search, content. */
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  ClipboardList,
  FileCheck2,
  LayoutGrid,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  ShieldAlert,
  Truck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlobalSearch } from './GlobalSearch';

const NAV = [
  { to: '/supply-chain', end: true, label: 'PI Register', icon: LayoutGrid },
  { to: '/supply-chain/delivery-notes', label: 'Delivery Notes', icon: Truck },
  { to: '/supply-chain/invoices', label: 'Invoices', icon: Receipt },
  { to: '/supply-chain/invoice-validation', label: 'Invoice Validation', icon: FileCheck2 },
  { to: '/supply-chain/exceptions', label: 'Exceptions', icon: ShieldAlert },
  { to: '/supply-chain/audit', label: 'Audit Log', icon: ScrollText },
  { to: '/supply-chain/settings', label: 'Settings', icon: Settings },
];

export function SupplyChainShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e bg-card transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-maroon text-white">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">Supply Chain</p>
            <p className="text-[11px] text-muted-foreground">Validation Platform</p>
          </div>
          <button
            type="button"
            className="ms-auto rounded-md p-1 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-maroon text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4 text-[11px] text-muted-foreground">
          Roshen · Outbound Shipment Validation
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="lg:ps-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <GlobalSearch />
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
