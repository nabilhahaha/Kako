import { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  FileBarChart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import type { VisitStatus, RequestStatus, DataUpdateType } from '@/lib/types';
import { formatDateTime, exportToCsv } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const PAGE_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────────────

const getUserName = (userId: string) =>
  mockUsers.find((u) => u.id === userId)?.fullName ?? 'Unknown';

const getUserRole = (userId: string) =>
  mockUsers.find((u) => u.id === userId)?.role ?? 'merchandiser';

/** Return user ids that should be visible to the current user */
function visibleUserIds(currentUserId: string, role: string): string[] | null {
  switch (role) {
    case 'admin':
      return null; // null = no filtering
    case 'manager': {
      const ids = mockUsers
        .filter((u) => u.managerId === currentUserId)
        .map((u) => u.id);
      return ids;
    }
    case 'supervisor': {
      const ids = mockUsers
        .filter((u) => u.supervisorId === currentUserId)
        .map((u) => u.id);
      return ids;
    }
    case 'merchandiser':
      return [currentUserId];
    case 'data_team':
      return null;
    default:
      return [currentUserId];
  }
}

// ── Component ────────────────────────────────────────────────────────

export function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const { visits, customers, oolRequests, dataUpdateRequests, auditLogs } = useAppStore();

  // shared filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // visit report filters
  const [vrStatus, setVrStatus] = useState<VisitStatus | 'All'>('All');
  const [vrCity, setVrCity] = useState('All');
  const [vrSalesman, setVrSalesman] = useState('All');
  const [vrPage, setVrPage] = useState(1);

  // missed visits page
  const [mvPage, setMvPage] = useState(1);

  // ool filters
  const [oolStatus, setOolStatus] = useState<RequestStatus | 'All'>('All');
  const [oolPage, setOolPage] = useState(1);

  // data update filters
  const [duStatus, setDuStatus] = useState<RequestStatus | 'All'>('All');
  const [duType, setDuType] = useState<DataUpdateType | 'All'>('All');
  const [duPage, setDuPage] = useState(1);

  // user activity page
  const [uaPage, setUaPage] = useState(1);

  // customer updates page
  const [cuPage, setCuPage] = useState(1);

  if (!user) return null;

  const allowedIds = visibleUserIds(user.id, user.role);

  // ── Lookups ──────────────────────────────────────────────────────

  const getCustomer = (id: string) => customers.find((c) => c.id === id);

  // ── Date helpers ────────────────────────────────────────────────

  const inDateRange = (iso: string) => {
    const d = new Date(iso);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (d < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  };

  // ── Role-filtered visits ──────────────────────────────────────

  const roleVisits = allowedIds
    ? visits.filter((v) => allowedIds.includes(v.userId))
    : visits;

  // ── Cities & salesmen from visible visits ─────────────────────

  const availableCities = useMemo(() => {
    const s = new Set<string>();
    roleVisits.forEach((v) => {
      const c = getCustomer(v.customerId);
      if (c) s.add(c.city);
    });
    return Array.from(s).sort();
  }, [roleVisits, customers]);

  const availableSalesmen = useMemo(() => {
    const s = new Set<string>();
    roleVisits.forEach((v) => s.add(v.userId));
    return Array.from(s)
      .map((id) => ({ id, name: getUserName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roleVisits]);

  // ── 1. Visit Report ─────────────────────────────────────────────

  const visitReportData = useMemo(() => {
    let data = roleVisits.filter((v) => inDateRange(v.createdAt));
    if (vrStatus !== 'All') data = data.filter((v) => v.status === vrStatus);
    if (vrCity !== 'All') data = data.filter((v) => getCustomer(v.customerId)?.city === vrCity);
    if (vrSalesman !== 'All') data = data.filter((v) => v.userId === vrSalesman);
    return data;
  }, [roleVisits, dateFrom, dateTo, vrStatus, vrCity, vrSalesman, customers]);

  // ── 2. Missed Visits ────────────────────────────────────────────

  const missedVisitData = useMemo(() => {
    return roleVisits.filter((v) => v.status === 'Missed' && inDateRange(v.createdAt));
  }, [roleVisits, dateFrom, dateTo]);

  // ── 3. OOL Requests ─────────────────────────────────────────────

  const roleOol = allowedIds
    ? oolRequests.filter((r) => allowedIds.includes(r.userId))
    : oolRequests;

  const oolData = useMemo(() => {
    let data = roleOol.filter((r) => inDateRange(r.createdAt));
    if (oolStatus !== 'All') data = data.filter((r) => r.status === oolStatus);
    return data;
  }, [roleOol, dateFrom, dateTo, oolStatus]);

  // ── 4. Data Update Requests ─────────────────────────────────────

  const roleDu = allowedIds
    ? dataUpdateRequests.filter((r) => allowedIds.includes(r.userId))
    : dataUpdateRequests;

  const duData = useMemo(() => {
    let data = roleDu.filter((r) => inDateRange(r.createdAt));
    if (duStatus !== 'All') data = data.filter((r) => r.status === duStatus);
    if (duType !== 'All') data = data.filter((r) => r.updateType === duType);
    return data;
  }, [roleDu, dateFrom, dateTo, duStatus, duType]);

  // ── 5. User Activity ────────────────────────────────────────────

  const userActivityData = useMemo(() => {
    const filtered = allowedIds
      ? auditLogs.filter((l) => allowedIds.includes(l.userId) && inDateRange(l.timestamp))
      : auditLogs.filter((l) => inDateRange(l.timestamp));

    const map = new Map<string, { total: number; lastActivity: string }>();
    filtered.forEach((l) => {
      const entry = map.get(l.userId);
      if (!entry) {
        map.set(l.userId, { total: 1, lastActivity: l.timestamp });
      } else {
        entry.total += 1;
        if (l.timestamp > entry.lastActivity) entry.lastActivity = l.timestamp;
      }
    });

    return Array.from(map.entries())
      .map(([userId, data]) => ({
        userId,
        userName: getUserName(userId),
        role: getUserRole(userId),
        totalActions: data.total,
        lastActivity: data.lastActivity,
      }))
      .sort((a, b) => b.totalActions - a.totalActions);
  }, [auditLogs, dateFrom, dateTo, allowedIds]);

  // ── 6. Customer Updates ─────────────────────────────────────────

  const customerUpdatesData = useMemo(() => {
    let data = auditLogs.filter(
      (l) =>
        (l.action === 'customer_data_changed' || l.action === 'customer_gps_updated') &&
        inDateRange(l.timestamp),
    );
    if (allowedIds) data = data.filter((l) => allowedIds.includes(l.userId));
    return data;
  }, [auditLogs, dateFrom, dateTo, allowedIds]);

  // ── Pagination helper ──────────────────────────────────────────

  function paginate<T>(items: T[], currentPage: number) {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const start = (currentPage - 1) * PAGE_SIZE;
    return { paged: items.slice(start, start + PAGE_SIZE), totalPages };
  }

  // ── Export helpers ─────────────────────────────────────────────

  const exportVisitReport = () => {
    if (!visitReportData.length) return;
    exportToCsv(
      'visit_report',
      visitReportData.map((v) => {
        const c = getCustomer(v.customerId);
        return {
          Date: formatDateTime(v.createdAt),
          Customer: c?.customerName ?? '',
          Salesman: getUserName(v.userId),
          Purpose: v.purpose,
          Status: v.status,
          'GPS Distance (m)': v.distance,
          City: c?.city ?? '',
        };
      }),
    );
  };

  const exportMissedVisits = () => {
    if (!missedVisitData.length) return;
    exportToCsv(
      'missed_visits',
      missedVisitData.map((v) => {
        const c = getCustomer(v.customerId);
        return {
          Date: formatDateTime(v.createdAt),
          Customer: c?.customerName ?? '',
          Salesman: getUserName(v.userId),
          Purpose: v.purpose,
          Status: v.status,
          'GPS Distance (m)': v.distance,
          City: c?.city ?? '',
        };
      }),
    );
  };

  const exportOol = () => {
    if (!oolData.length) return;
    exportToCsv(
      'ool_requests',
      oolData.map((r) => ({
        Date: formatDateTime(r.createdAt),
        Customer: r.customerName,
        'Requested By': r.userName,
        'Distance (m)': r.distance,
        Reason: r.reason,
        Status: r.status,
        'Reviewer Comment': r.managerComment,
      })),
    );
  };

  const exportDu = () => {
    if (!duData.length) return;
    exportToCsv(
      'data_updates',
      duData.map((r) => ({
        Date: formatDateTime(r.createdAt),
        Customer: r.customerName,
        'Update Type': r.updateType,
        'Old Value': r.oldValue,
        'New Value': r.newValue,
        Status: r.status,
        'Reviewed By': r.reviewedBy ? getUserName(r.reviewedBy) : '',
      })),
    );
  };

  const exportUserActivity = () => {
    if (!userActivityData.length) return;
    exportToCsv(
      'user_activity',
      userActivityData.map((u) => ({
        User: u.userName,
        Role: ROLE_LABELS[u.role] ?? u.role,
        'Total Actions': u.totalActions,
        'Last Activity': formatDateTime(u.lastActivity),
      })),
    );
  };

  const exportCustomerUpdates = () => {
    if (!customerUpdatesData.length) return;
    exportToCsv(
      'customer_updates',
      customerUpdatesData.map((l) => ({
        Date: formatDateTime(l.timestamp),
        Customer: l.entity,
        'Field Changed': l.action === 'customer_gps_updated' ? 'GPS Location' : 'Data Field',
        'Old Value': l.oldValue,
        'New Value': l.newValue,
        'Changed By': l.userName,
      })),
    );
  };

  const handlePrint = () => toast('Print functionality coming soon');

  // ── Pagination control ────────────────────────────────────────

  const PaginationBar = ({
    page: pg,
    totalPages: tp,
    total,
    setPage: sp,
  }: {
    page: number;
    totalPages: number;
    total: number;
    setPage: (p: number) => void;
  }) =>
    tp > 1 ? (
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing {(pg - 1) * PAGE_SIZE + 1}-{Math.min(pg * PAGE_SIZE, total)} of {total}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => sp(Math.max(1, pg - 1))} disabled={pg === 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {pg} / {tp}
          </span>
          <Button variant="outline" size="sm" onClick={() => sp(Math.min(tp, pg + 1))} disabled={pg === tp}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    ) : null;

  // ── Action buttons ────────────────────────────────────────────

  const ActionButtons = ({ onExport, count }: { onExport: () => void; count: number }) => (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handlePrint}>
        <Printer className="h-4 w-4" />
        Print
      </Button>
      <Button variant="outline" size="sm" onClick={onExport} disabled={count === 0}>
        <Download className="h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );

  // ── Table wrapper ─────────────────────────────────────────────

  const TableWrap = ({ children }: { children: React.ReactNode }) => (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">{children}</table>
    </div>
  );

  const Th = ({ children }: { children: React.ReactNode }) => (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
      {children}
    </th>
  );

  const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <td className={`px-4 py-3 text-sm text-gray-700 dark:text-gray-300 ${className ?? ''}`}>{children}</td>
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Generate and export detailed reports" />

      {/* Shared date range */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">From Date</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">To Date</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="visit-report">
        <TabsList className="flex-wrap">
          <TabsTrigger value="visit-report">Visit Report</TabsTrigger>
          <TabsTrigger value="missed-visits">Missed Visits</TabsTrigger>
          <TabsTrigger value="ool">Out of Location</TabsTrigger>
          <TabsTrigger value="data-updates">Data Updates</TabsTrigger>
          <TabsTrigger value="user-activity">User Activity</TabsTrigger>
          <TabsTrigger value="customer-updates">Customer Updates</TabsTrigger>
        </TabsList>

        {/* ═══════════════════ Visit Report ═══════════════════ */}
        <TabsContent value="visit-report">
          <div className="space-y-4">
            {/* Filters */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Status</Label>
                  <Select value={vrStatus} onChange={(e) => { setVrStatus(e.target.value as VisitStatus | 'All'); setVrPage(1); }}>
                    <option value="All">All</option>
                    <option value="Completed">Completed</option>
                    <option value="Missed">Missed</option>
                    <option value="Out of Location">Out of Location</option>
                    <option value="In Progress">In Progress</option>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">City</Label>
                  <Select value={vrCity} onChange={(e) => { setVrCity(e.target.value); setVrPage(1); }}>
                    <option value="All">All</option>
                    {availableCities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Salesman</Label>
                  <Select value={vrSalesman} onChange={(e) => { setVrSalesman(e.target.value); setVrPage(1); }}>
                    <option value="All">All</option>
                    {availableSalesmen.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
                <ActionButtons onExport={exportVisitReport} count={visitReportData.length} />
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">{visitReportData.length} record(s)</p>

            {visitReportData.length === 0 ? (
              <EmptyState icon={<FileBarChart className="h-12 w-12" />} title="No visits found" description="Adjust filters or date range." />
            ) : (
              <>
                <TableWrap>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <Th>Date</Th><Th>Customer</Th><Th>Salesman</Th><Th>Purpose</Th><Th>Status</Th><Th>GPS Distance</Th><Th>City</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {paginate(visitReportData, vrPage).paged.map((v) => {
                      const c = getCustomer(v.customerId);
                      return (
                        <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <Td>{formatDateTime(v.createdAt)}</Td>
                          <Td>{c?.customerName ?? 'Unknown'}</Td>
                          <Td>{getUserName(v.userId)}</Td>
                          <Td>{v.purpose}</Td>
                          <Td><StatusBadge status={v.status} /></Td>
                          <Td>{v.distance}m</Td>
                          <Td>{c?.city ?? ''}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
                <PaginationBar page={vrPage} totalPages={paginate(visitReportData, vrPage).totalPages} total={visitReportData.length} setPage={setVrPage} />
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ Missed Visits ═══════════════════ */}
        <TabsContent value="missed-visits">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">{missedVisitData.length} record(s)</p>
              <ActionButtons onExport={exportMissedVisits} count={missedVisitData.length} />
            </div>

            {missedVisitData.length === 0 ? (
              <EmptyState icon={<FileBarChart className="h-12 w-12" />} title="No missed visits" description="No missed visits in the selected date range." />
            ) : (
              <>
                <TableWrap>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <Th>Date</Th><Th>Customer</Th><Th>Salesman</Th><Th>Purpose</Th><Th>Status</Th><Th>GPS Distance</Th><Th>City</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {paginate(missedVisitData, mvPage).paged.map((v) => {
                      const c = getCustomer(v.customerId);
                      return (
                        <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <Td>{formatDateTime(v.createdAt)}</Td>
                          <Td>{c?.customerName ?? 'Unknown'}</Td>
                          <Td>{getUserName(v.userId)}</Td>
                          <Td>{v.purpose}</Td>
                          <Td><StatusBadge status={v.status} /></Td>
                          <Td>{v.distance}m</Td>
                          <Td>{c?.city ?? ''}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
                <PaginationBar page={mvPage} totalPages={paginate(missedVisitData, mvPage).totalPages} total={missedVisitData.length} setPage={setMvPage} />
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ Out of Location ═══════════════════ */}
        <TabsContent value="ool">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Status</Label>
                  <Select value={oolStatus} onChange={(e) => { setOolStatus(e.target.value as RequestStatus | 'All'); setOolPage(1); }}>
                    <option value="All">All</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </Select>
                </div>
                <ActionButtons onExport={exportOol} count={oolData.length} />
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">{oolData.length} record(s)</p>

            {oolData.length === 0 ? (
              <EmptyState icon={<FileBarChart className="h-12 w-12" />} title="No OOL requests" description="No out-of-location requests found." />
            ) : (
              <>
                <TableWrap>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <Th>Date</Th><Th>Customer</Th><Th>Requested By</Th><Th>Distance</Th><Th>Reason</Th><Th>Status</Th><Th>Reviewer Comment</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {paginate(oolData, oolPage).paged.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <Td>{formatDateTime(r.createdAt)}</Td>
                        <Td>{r.customerName}</Td>
                        <Td>{r.userName}</Td>
                        <Td>{r.distance}m</Td>
                        <Td className="max-w-xs truncate">{r.reason}</Td>
                        <Td><StatusBadge status={r.status} /></Td>
                        <Td className="max-w-xs truncate">{r.managerComment || '-'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                <PaginationBar page={oolPage} totalPages={paginate(oolData, oolPage).totalPages} total={oolData.length} setPage={setOolPage} />
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ Data Updates ═══════════════════ */}
        <TabsContent value="data-updates">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Status</Label>
                  <Select value={duStatus} onChange={(e) => { setDuStatus(e.target.value as RequestStatus | 'All'); setDuPage(1); }}>
                    <option value="All">All</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Update Type</Label>
                  <Select value={duType} onChange={(e) => { setDuType(e.target.value as DataUpdateType | 'All'); setDuPage(1); }}>
                    <option value="All">All</option>
                    <option value="CR Number">CR Number</option>
                    <option value="VAT Number">VAT Number</option>
                    <option value="National Address">National Address</option>
                    <option value="Phone Number">Phone Number</option>
                    <option value="Customer Name">Customer Name</option>
                    <option value="GPS Location">GPS Location</option>
                    <option value="Channel">Channel</option>
                  </Select>
                </div>
                <ActionButtons onExport={exportDu} count={duData.length} />
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">{duData.length} record(s)</p>

            {duData.length === 0 ? (
              <EmptyState icon={<FileBarChart className="h-12 w-12" />} title="No data updates" description="No data update requests found." />
            ) : (
              <>
                <TableWrap>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <Th>Date</Th><Th>Customer</Th><Th>Update Type</Th><Th>Old Value</Th><Th>New Value</Th><Th>Status</Th><Th>Reviewed By</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {paginate(duData, duPage).paged.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <Td>{formatDateTime(r.createdAt)}</Td>
                        <Td>{r.customerName}</Td>
                        <Td>{r.updateType}</Td>
                        <Td className="max-w-[180px] truncate">{r.oldValue}</Td>
                        <Td className="max-w-[180px] truncate">{r.newValue}</Td>
                        <Td><StatusBadge status={r.status} /></Td>
                        <Td>{r.reviewedBy ? getUserName(r.reviewedBy) : '-'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                <PaginationBar page={duPage} totalPages={paginate(duData, duPage).totalPages} total={duData.length} setPage={setDuPage} />
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ User Activity ═══════════════════ */}
        <TabsContent value="user-activity">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">{userActivityData.length} user(s)</p>
              <ActionButtons onExport={exportUserActivity} count={userActivityData.length} />
            </div>

            {userActivityData.length === 0 ? (
              <EmptyState icon={<FileBarChart className="h-12 w-12" />} title="No activity" description="No user activity found in the selected date range." />
            ) : (
              <>
                <TableWrap>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <Th>User</Th><Th>Role</Th><Th>Total Actions</Th><Th>Last Activity</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {paginate(userActivityData, uaPage).paged.map((u) => (
                      <tr key={u.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <Td>{u.userName}</Td>
                        <Td>{ROLE_LABELS[u.role] ?? u.role}</Td>
                        <Td>
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {u.totalActions}
                          </span>
                        </Td>
                        <Td>{formatDateTime(u.lastActivity)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                <PaginationBar page={uaPage} totalPages={paginate(userActivityData, uaPage).totalPages} total={userActivityData.length} setPage={setUaPage} />
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════ Customer Updates ═══════════════════ */}
        <TabsContent value="customer-updates">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">{customerUpdatesData.length} record(s)</p>
              <ActionButtons onExport={exportCustomerUpdates} count={customerUpdatesData.length} />
            </div>

            {customerUpdatesData.length === 0 ? (
              <EmptyState icon={<FileBarChart className="h-12 w-12" />} title="No customer updates" description="No customer data changes found." />
            ) : (
              <>
                <TableWrap>
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <Th>Date</Th><Th>Customer</Th><Th>Field Changed</Th><Th>Old Value</Th><Th>New Value</Th><Th>Changed By</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {paginate(customerUpdatesData, cuPage).paged.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <Td>{formatDateTime(l.timestamp)}</Td>
                        <Td>{l.entity} ({l.entityId})</Td>
                        <Td>{l.action === 'customer_gps_updated' ? 'GPS Location' : 'Data Field'}</Td>
                        <Td className="max-w-[180px] truncate">{l.oldValue || '-'}</Td>
                        <Td className="max-w-[180px] truncate">{l.newValue || '-'}</Td>
                        <Td>{l.userName}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
                <PaginationBar page={cuPage} totalPages={paginate(customerUpdatesData, cuPage).totalPages} total={customerUpdatesData.length} setPage={setCuPage} />
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
