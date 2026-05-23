import { useState, useMemo } from 'react';
import {
  Search,
  Download,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import type { VisitPurpose, VisitStatus } from '@/lib/types';
import { cn, formatDateTime, exportToCsv } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const PAGE_SIZE = 10;

const ALL_STATUSES: Array<VisitStatus | 'All'> = [
  'All',
  'Completed',
  'Missed',
  'Out of Location',
  'In Progress',
];

export function VisitHistoryPage() {
  const user = useAuthStore((s) => s.user);
  const { visits, customers, settings } = useAppStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VisitStatus | 'All'>('All');
  const [purposeFilter, setPurposeFilter] = useState<VisitPurpose | 'All'>('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Role-based filtering
  const roleFilteredVisits = useMemo(() => {
    if (!user) return [];
    switch (user.role) {
      case 'admin':
        return visits;
      case 'manager': {
        const teamUserIds = mockUsers
          .filter((u) => u.managerId === user.id)
          .map((u) => u.id);
        return visits.filter((v) => teamUserIds.includes(v.userId));
      }
      case 'supervisor': {
        const subUserIds = mockUsers
          .filter((u) => u.supervisorId === user.id)
          .map((u) => u.id);
        return visits.filter((v) => subUserIds.includes(v.userId));
      }
      case 'merchandiser':
        return visits.filter((v) => v.userId === user.id);
      default:
        return visits;
    }
  }, [visits, user]);

  // Lookup helpers
  const getCustomer = (customerId: string) =>
    customers.find((c) => c.id === customerId);

  const getUserName = (userId: string) => {
    const u = mockUsers.find((mu) => mu.id === userId);
    return u ? u.fullName : 'Unknown';
  };

  // Collect unique cities from visible visits' customers for the filter
  const availableCities = useMemo(() => {
    const citySet = new Set<string>();
    roleFilteredVisits.forEach((v) => {
      const cust = getCustomer(v.customerId);
      if (cust) citySet.add(cust.city);
    });
    return Array.from(citySet).sort();
  }, [roleFilteredVisits, customers]);

  // Apply filters
  const filteredVisits = useMemo(() => {
    let result = roleFilteredVisits;

    // Status filter
    if (statusFilter !== 'All') {
      result = result.filter((v) => v.status === statusFilter);
    }

    // Purpose filter
    if (purposeFilter !== 'All') {
      result = result.filter((v) => v.purpose === purposeFilter);
    }

    // City filter
    if (cityFilter !== 'All') {
      result = result.filter((v) => {
        const cust = getCustomer(v.customerId);
        return cust?.city === cityFilter;
      });
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((v) => new Date(v.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((v) => new Date(v.createdAt) <= to);
    }

    // Search by customer name/code
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((v) => {
        const cust = getCustomer(v.customerId);
        if (!cust) return false;
        return (
          cust.customerName.toLowerCase().includes(q) ||
          cust.customerCode.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [roleFilteredVisits, statusFilter, purposeFilter, cityFilter, dateFrom, dateTo, search, customers]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredVisits.length / PAGE_SIZE));
  const paginatedVisits = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredVisits.slice(start, start + PAGE_SIZE);
  }, [filteredVisits, page]);

  // Reset page when filters change
  const handleFilterChange = <T,>(setter: (val: T) => void) => (val: T) => {
    setter(val);
    setPage(1);
  };

  // Export CSV
  const handleExport = () => {
    if (filteredVisits.length === 0) return;
    const rows = filteredVisits.map((v) => {
      const cust = getCustomer(v.customerId);
      return {
        'Visit ID': v.id,
        'Customer Code': cust?.customerCode ?? '',
        'Customer Name': cust?.customerName ?? '',
        City: cust?.city ?? '',
        Purpose: v.purpose,
        Status: v.status,
        'Salesman': getUserName(v.userId),
        'Distance (m)': v.distance,
        'Within Radius': v.withinRadius ? 'Yes' : 'No',
        Notes: v.notes,
        'Date/Time': formatDateTime(v.createdAt),
      };
    });
    exportToCsv('visit_history', rows);
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visit History"
        subtitle={`${filteredVisits.length} visit${filteredVisits.length !== 1 ? 's' : ''} found`}
        action={
          <Button variant="outline" onClick={handleExport} className="gap-2" disabled={filteredVisits.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* Search */}
          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Customer name or code..."
                value={search}
                onChange={(e) => handleFilterChange(setSearch)(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Date From */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">From Date</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
            />
          </div>

          {/* Date To */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">To Date</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
            />
          </div>

          {/* Status */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Status</Label>
            <Select
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter)(e.target.value as VisitStatus | 'All')}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          {/* Purpose */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Purpose</Label>
            <Select
              value={purposeFilter}
              onChange={(e) => handleFilterChange(setPurposeFilter)(e.target.value as VisitPurpose | 'All')}
            >
              <option value="All">All</option>
              {settings.visitPurposes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>

          {/* City */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">City</Label>
            <Select
              value={cityFilter}
              onChange={(e) => handleFilterChange(setCityFilter)(e.target.value)}
            >
              <option value="All">All</option>
              {availableCities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Visit List */}
      {paginatedVisits.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="No visits found"
          description="Try adjusting your filters or search criteria."
        />
      ) : (
        <div className="space-y-3">
          {paginatedVisits.map((visit) => {
            const cust = getCustomer(visit.customerId);
            return (
              <div
                key={visit.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Customer & Visit Details */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {cust?.customerName ?? 'Unknown Customer'}
                      </h3>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {cust?.customerCode ?? ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={visit.status} />
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {visit.purpose}
                      </span>
                    </div>

                    {/* GPS info */}
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      <span
                        className={cn(
                          'flex items-center gap-1',
                          visit.withinRadius
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {visit.withinRadius ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        )}
                        {visit.distance}m
                        {visit.withinRadius ? ' (Within radius)' : ' (Outside radius)'}
                      </span>
                    </div>

                    {/* Notes preview */}
                    {visit.notes && (
                      <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                        {visit.notes}
                      </p>
                    )}
                  </div>

                  {/* Right: Meta info */}
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5 text-right">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDateTime(visit.createdAt)}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Salesman: {getUserName(visit.userId)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Showing {(page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, filteredVisits.length)} of{' '}
            {filteredVisits.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
