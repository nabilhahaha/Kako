import { useState, useMemo } from 'react';
import {
  Download,
  Search,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import type { AuditAction } from '@/lib/types';
import { cn, formatDateTime, exportToCsv } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const PAGE_SIZE = 15;

// ── Action metadata ─────────────────────────────────────────────────

const ACTION_LABELS: Record<AuditAction, string> = {
  visit_submitted: 'Visit Submitted',
  request_created: 'Request Created',
  request_approved: 'Request Approved',
  request_rejected: 'Request Rejected',
  customer_gps_updated: 'Customer GPS Updated',
  customer_data_changed: 'Customer Data Changed',
  customer_created: 'Customer Created',
  user_login: 'User Login',
  settings_changed: 'Settings Changed',
};

const ACTION_COLORS: Record<string, string> = {
  request_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  request_rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  request_created: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  visit_submitted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  customer_created: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  customer_gps_updated: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  customer_data_changed: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  user_login: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  settings_changed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const STATUS_COLORS: Record<string, string> = {
  Approved: 'text-green-600 dark:text-green-400',
  Rejected: 'text-red-600 dark:text-red-400',
  Completed: 'text-green-600 dark:text-green-400',
  Pending: 'text-yellow-600 dark:text-yellow-400',
  Applied: 'text-green-600 dark:text-green-400',
  Success: 'text-green-600 dark:text-green-400',
};

const ALL_ACTIONS: AuditAction[] = [
  'visit_submitted',
  'request_created',
  'request_approved',
  'request_rejected',
  'customer_gps_updated',
  'customer_data_changed',
  'user_login',
  'settings_changed',
];

// ── Component ────────────────────────────────────────────────────────

export function AuditLogPage() {
  const user = useAuthStore((s) => s.user);
  const { auditLogs } = useAppStore();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userFilter, setUserFilter] = useState('All');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'All'>('All');
  const [entityFilter, setEntityFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  if (!user) return null;

  // ── Unique entity types ────────────────────────────────────────

  const entityTypes = useMemo(() => {
    const s = new Set<string>();
    auditLogs.forEach((l) => s.add(l.entity));
    return Array.from(s).sort();
  }, [auditLogs]);

  // ── Unique users ────────────────────────────────────────────────

  const logUsers = useMemo(() => {
    const s = new Set<string>();
    auditLogs.forEach((l) => s.add(l.userId));
    return Array.from(s)
      .map((id) => {
        const u = mockUsers.find((mu) => mu.id === id);
        return { id, name: u?.fullName ?? 'Unknown' };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [auditLogs]);

  // ── Filtered & sorted logs ─────────────────────────────────────

  const filteredLogs = useMemo(() => {
    let result = [...auditLogs];

    // Sort newest first
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((l) => new Date(l.timestamp) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((l) => new Date(l.timestamp) <= to);
    }

    // User filter
    if (userFilter !== 'All') {
      result = result.filter((l) => l.userId === userFilter);
    }

    // Action filter
    if (actionFilter !== 'All') {
      result = result.filter((l) => l.action === actionFilter);
    }

    // Entity filter
    if (entityFilter !== 'All') {
      result = result.filter((l) => l.entity === entityFilter);
    }

    // Free text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.userName.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          l.entity.toLowerCase().includes(q) ||
          l.entityId.toLowerCase().includes(q) ||
          l.oldValue.toLowerCase().includes(q) ||
          l.newValue.toLowerCase().includes(q) ||
          l.status.toLowerCase().includes(q),
      );
    }

    return result;
  }, [auditLogs, dateFrom, dateTo, userFilter, actionFilter, entityFilter, search]);

  // ── Pagination ────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pagedLogs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, page]);

  const resetPage = () => setPage(1);

  // ── Export ────────────────────────────────────────────────────

  const handleExport = () => {
    if (!filteredLogs.length) return;
    exportToCsv(
      'audit_log',
      filteredLogs.map((l) => ({
        'Date/Time': formatDateTime(l.timestamp),
        User: l.userName,
        Role: ROLE_LABELS[l.role] ?? l.role,
        Action: ACTION_LABELS[l.action] ?? l.action,
        Entity: l.entity,
        'Entity ID': l.entityId,
        'Old Value': l.oldValue,
        'New Value': l.newValue,
        Status: l.status,
      })),
    );
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle={`${filteredLogs.length} log entries`}
        action={
          <Button variant="outline" onClick={handleExport} disabled={filteredLogs.length === 0} className="gap-2">
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
                placeholder="Search any field..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
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
              onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            />
          </div>

          {/* Date To */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">To Date</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
            />
          </div>

          {/* User */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">User</Label>
            <Select
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); resetPage(); }}
            >
              <option value="All">All Users</option>
              {logUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>

          {/* Action */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Action</Label>
            <Select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value as AuditAction | 'All'); resetPage(); }}
            >
              <option value="All">All Actions</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </Select>
          </div>

          {/* Entity */}
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Entity</Label>
            <Select
              value={entityFilter}
              onChange={(e) => { setEntityFilter(e.target.value); resetPage(); }}
            >
              <option value="All">All Entities</option>
              {entityTypes.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      {pagedLogs.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-12 w-12" />}
          title="No audit logs found"
          description="Try adjusting your filters or date range."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Date/Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Entity
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Old Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  New Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {pagedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {log.userName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {ROLE_LABELS[log.role] ?? log.role}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700',
                      )}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {log.entity}
                    <span className="ml-1 text-xs text-gray-400">({log.entityId})</span>
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {log.oldValue || '-'}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {log.newValue || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        STATUS_COLORS[log.status] ?? 'text-gray-600 dark:text-gray-400',
                      )}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredLogs.length)}{' '}
            of {filteredLogs.length}
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
