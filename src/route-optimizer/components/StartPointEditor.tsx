import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, RotateCcw, MousePointer } from 'lucide-react';
import type { RouteResult, Depot, Customer } from '../types';

interface StartPointEditorProps {
  routes: RouteResult[];
  depots: Map<number, Depot>;
  onSetDepot: (routeIndex: number, depot: Depot) => void;
  onResetDepot: (routeIndex: number) => void;
  onStartMapClick: (routeIndex: number) => void;
  depotEditRoute: number | null;
  salesmanNames: Map<number, string>;
  onSalesmanNameChange: (routeIndex: number, name: string) => void;
}

export function StartPointEditor({
  routes,
  depots,
  onSetDepot,
  onResetDepot,
  onStartMapClick,
  depotEditRoute,
  salesmanNames,
  onSalesmanNameChange,
}: StartPointEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-h2 font-semibold">{t('depot.title')}</h2>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.route')}</th>
              <th className="px-3 py-2 text-start font-medium">Salesman</th>
              <th className="px-3 py-2 text-start font-medium">{t('depot.latitude')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('depot.longitude')}</th>
              <th className="px-3 py-2 text-start font-medium">Source</th>
              <th className="px-3 py-2 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route, i) => (
              <DepotRow
                key={i}
                routeIndex={i}
                route={route}
                depot={depots.get(i) ?? null}
                onSetDepot={onSetDepot}
                onResetDepot={onResetDepot}
                onStartMapClick={onStartMapClick}
                isMapEditing={depotEditRoute === i}
                salesmanName={salesmanNames.get(i) ?? ''}
                onSalesmanNameChange={onSalesmanNameChange}
                t={t}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DepotRow({
  routeIndex,
  route,
  depot,
  onSetDepot,
  onResetDepot,
  onStartMapClick,
  isMapEditing,
  salesmanName,
  onSalesmanNameChange,
  t,
}: {
  routeIndex: number;
  route: RouteResult;
  depot: Depot | null;
  onSetDepot: (ri: number, d: Depot) => void;
  onResetDepot: (ri: number) => void;
  onStartMapClick: (ri: number) => void;
  isMapEditing: boolean;
  salesmanName: string;
  onSalesmanNameChange: (ri: number, name: string) => void;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  const handleManualSet = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      onSetDepot(routeIndex, { lat, lng, source: 'manual' });
      setManualLat('');
      setManualLng('');
    }
  };

  const handleCustomerSelect = (c: Customer) => {
    onSetDepot(routeIndex, { lat: c.lat, lng: c.lng, source: 'customer', customerIndex: c.index });
  };

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: route.color }} />
          <span className="font-medium">{t('map.routeLabel', { number: routeIndex + 1 })}</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          placeholder="Salesman name"
          value={salesmanName}
          onChange={(e) => onSalesmanNameChange(routeIndex, e.target.value)}
          className="w-32 rounded border border-input bg-background px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {depot ? depot.lat.toFixed(6) : '—'}
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {depot ? depot.lng.toFixed(6) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {depot ? t(depot.source) : '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder={t('depot.latitude')}
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="w-24 rounded border border-input bg-background px-2 py-1 text-xs"
            />
            <input
              type="text"
              placeholder={t('depot.longitude')}
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="w-24 rounded border border-input bg-background px-2 py-1 text-xs"
            />
            <button
              onClick={handleManualSet}
              className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            >
              <MapPin className="h-3 w-3" />
            </button>
          </div>

          <button
            onClick={() => onStartMapClick(routeIndex)}
            className={`rounded px-2 py-1 text-xs ${
              isMapEditing ? 'bg-warning text-warning-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
            title={t('depot.clickOnMap')}
          >
            <MousePointer className="h-3 w-3" />
          </button>

          {route.customers.length > 0 && (
            <select
              onChange={(e) => {
                const idx = Number(e.target.value);
                const c = route.customers.find((c) => c.index === idx);
                if (c) handleCustomerSelect(c);
              }}
              defaultValue=""
              className="max-w-[120px] rounded border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="" disabled>{t('depot.selectCustomer')}</option>
              {route.customers.slice(0, 20).map((c) => (
                <option key={c.index} value={c.index}>
                  {c.customerNo}
                </option>
              ))}
            </select>
          )}

          {depot && (
            <button
              onClick={() => onResetDepot(routeIndex)}
              className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
              title={t('depot.resetDepot')}
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
