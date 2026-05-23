import { useMemo } from 'react';
import {
  MapPin,
  CheckCircle,
  XCircle,
  MapPinOff,
  Clock,
  FileEdit,
  UserCheck,
  Target,
  ShoppingCart,
  Database,
  FileCheck,
  FileMinus,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import { ROLE_LABELS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import { KPICard } from '@/components/shared/KPICard';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { UserRole, Visit } from '@/lib/types';

const PIE_COLORS: Record<string, string> = {
  Completed: '#22c55e',
  Missed: '#ef4444',
  'Out of Location': '#f97316',
  'In Progress': '#3b82f6',
};

const todayISO = new Date().toISOString().slice(0, 10);

function isToday(iso: string) {
  return iso.startsWith(todayISO);
}

/* ------------------------------------------------------------------ */
/*  Admin / Manager / Supervisor helpers                               */
/* ------------------------------------------------------------------ */

function getTeamUserIds(role: UserRole, userId: string): string[] | null {
  if (role === 'admin') return null; // null = all
  if (role === 'manager') {
    return mockUsers
      .filter((u) => u.managerId === userId)
      .map((u) => u.id);
  }
  if (role === 'supervisor') {
    return mockUsers
      .filter((u) => u.supervisorId === userId)
      .map((u) => u.id);
  }
  return null;
}

function filterVisits(visits: Visit[], userIds: string[] | null) {
  if (!userIds) return visits;
  return visits.filter((v) => userIds.includes(v.userId));
}

/* ------------------------------------------------------------------ */
/*  Chart wrapper                                                      */
/* ------------------------------------------------------------------ */

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {title}
      </h3>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared chart builders                                              */
/* ------------------------------------------------------------------ */

function VisitsByStatusPie({ visits }: { visits: Visit[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    visits.forEach((v) => {
      counts[v.status] = (counts[v.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [visits]);

  return (
    <ChartCard title="Visits by Status">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
            label={({ name, value }) => `${name}: ${value}`}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={PIE_COLORS[entry.name] ?? '#94a3b8'}
              />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function VisitsByCityBar({ visits }: { visits: Visit[] }) {
  const data = useMemo(() => {
    const cityCounts: Record<string, number> = {};
    visits.forEach((v) => {
      const user = mockUsers.find((u) => u.id === v.userId);
      const city = user?.city ?? 'Unknown';
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    return Object.entries(cityCounts)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }, [visits]);

  return (
    <ChartCard title="Visits by City">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="city" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function VisitsThisWeekArea({ visits }: { visits: Visit[] }) {
  const data = useMemo(() => {
    const days: { label: string; iso: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const iso = dt.toISOString().slice(0, 10);
      const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      days.push({ label: dayLabel, iso, count: 0 });
    }
    visits.forEach((v) => {
      const vDate = v.createdAt.slice(0, 10);
      const day = days.find((d) => d.iso === vDate);
      if (day) day.count++;
    });
    return days.map((d) => ({ day: d.label, visits: d.count }));
  }, [visits]);

  return (
    <ChartCard title="Visits This Week">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="visits"
            stroke="#3b82f6"
            fill="url(#areaGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Top Supervisors table                                              */
/* ------------------------------------------------------------------ */

function TopSupervisorsTable({ visits }: { visits: Visit[] }) {
  const data = useMemo(() => {
    const supervisors = mockUsers.filter((u) => u.role === 'supervisor');
    return supervisors
      .map((sup) => {
        const merchandiserIds = mockUsers
          .filter((u) => u.supervisorId === sup.id)
          .map((u) => u.id);
        const count = visits.filter((v) => merchandiserIds.includes(v.userId)).length;
        return { name: sup.fullName, city: sup.city, visits: count };
      })
      .sort((a, b) => b.visits - a.visits);
  }, [visits]);

  return (
    <ChartCard title="Top Performing Supervisors">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="pb-2 pr-4">Supervisor</th>
              <th className="pb-2 pr-4">City</th>
              <th className="pb-2 text-right">Visits</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.name}
                className="border-b border-gray-100 last:border-0 dark:border-gray-700"
              >
                <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-white">
                  {row.name}
                </td>
                <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400">
                  {row.city}
                </td>
                <td className="py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                  {row.visits}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Visits list (merchandiser)                                  */
/* ------------------------------------------------------------------ */

function RecentVisitsList({ visits }: { visits: Visit[] }) {
  const recent = visits.slice(0, 10);
  const customers = useAppStore((s) => s.customers);

  return (
    <ChartCard title="Recent Visits">
      {recent.length === 0 ? (
        <p className="text-sm text-gray-500">No visits yet.</p>
      ) : (
        <div className="space-y-3">
          {recent.map((v) => {
            const cust = customers.find((c) => c.id === v.customerId);
            return (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-700"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {cust?.customerName ?? v.customerId}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {v.purpose} &middot; {formatDateTime(v.createdAt)}
                  </p>
                </div>
                <StatusBadge status={v.status} />
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Data Requests list (data_team)                              */
/* ------------------------------------------------------------------ */

function RecentDataRequestsList() {
  const requests = useAppStore((s) => s.dataUpdateRequests);
  const recent = requests.slice(0, 10);

  return (
    <ChartCard title="Recent Data Update Requests">
      {recent.length === 0 ? (
        <p className="text-sm text-gray-500">No requests yet.</p>
      ) : (
        <div className="space-y-3">
          {recent.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-700"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {r.customerName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {r.updateType} &middot; by {r.userName} &middot;{' '}
                  {formatDateTime(r.createdAt)}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

/* ================================================================== */
/*  Main DashboardPage                                                 */
/* ================================================================== */

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const visits = useAppStore((s) => s.visits);
  const oolRequests = useAppStore((s) => s.oolRequests);
  const dataUpdateRequests = useAppStore((s) => s.dataUpdateRequests);
  const customers = useAppStore((s) => s.customers);

  const role: UserRole = user?.role ?? 'merchandiser';

  // Determine team scope
  const teamUserIds = useMemo(
    () => (user ? getTeamUserIds(role, user.id) : null),
    [role, user],
  );

  const scopedVisits = useMemo(
    () => filterVisits(visits, teamUserIds),
    [visits, teamUserIds],
  );

  const todayVisits = useMemo(
    () => scopedVisits.filter((v) => isToday(v.createdAt)),
    [scopedVisits],
  );

  const subtitle = `Welcome back, ${user?.fullName ?? 'User'} — ${ROLE_LABELS[role]}`;

  /* ---------------------------------------------------------------- */
  /*  Admin dashboard                                                  */
  /* ---------------------------------------------------------------- */
  if (role === 'admin') {
    const completed = todayVisits.filter((v) => v.status === 'Completed').length;
    const missed = todayVisits.filter((v) => v.status === 'Missed').length;
    const ool = scopedVisits.filter((v) => v.status === 'Out of Location').length;
    const pendingApprovals =
      oolRequests.filter((r) => r.status === 'Pending').length +
      dataUpdateRequests.filter((r) => r.status === 'Pending').length;
    const activeUsers = mockUsers.filter((u) => u.isActive).length;
    const compliance =
      completed + missed > 0
        ? ((completed / (completed + missed)) * 100).toFixed(1)
        : '0.0';

    return (
      <div>
        <PageHeader title="Dashboard" subtitle={subtitle} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Total Visits Today" value={todayVisits.length} icon={<MapPin className="h-5 w-5" />} color="blue" />
          <KPICard title="Completed Visits" value={completed} icon={<CheckCircle className="h-5 w-5" />} color="green" />
          <KPICard title="Missed Visits" value={missed} icon={<XCircle className="h-5 w-5" />} color="red" />
          <KPICard title="Out of Location Visits" value={ool} icon={<MapPinOff className="h-5 w-5" />} color="orange" />
          <KPICard title="Pending Approvals" value={pendingApprovals} icon={<Clock className="h-5 w-5" />} color="purple" />
          <KPICard title="Data Update Requests" value={dataUpdateRequests.length} icon={<FileEdit className="h-5 w-5" />} color="cyan" />
          <KPICard title="Active Users" value={activeUsers} icon={<UserCheck className="h-5 w-5" />} color="green" />
          <KPICard title="Visit Compliance %" value={`${compliance}%`} icon={<Target className="h-5 w-5" />} color="blue" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VisitsByStatusPie visits={scopedVisits} />
          <VisitsByCityBar visits={scopedVisits} />
          <VisitsThisWeekArea visits={scopedVisits} />
          <TopSupervisorsTable visits={scopedVisits} />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Manager dashboard                                                */
  /* ---------------------------------------------------------------- */
  if (role === 'manager') {
    const completed = todayVisits.filter((v) => v.status === 'Completed').length;
    const missed = todayVisits.filter((v) => v.status === 'Missed').length;
    const ool = scopedVisits.filter((v) => v.status === 'Out of Location').length;

    const teamOolPending = oolRequests.filter(
      (r) => r.status === 'Pending' && (teamUserIds === null || teamUserIds.includes(r.userId)),
    ).length;
    const teamDurPending = dataUpdateRequests.filter(
      (r) => r.status === 'Pending' && (teamUserIds === null || teamUserIds.includes(r.userId)),
    ).length;
    const pendingApprovals = teamOolPending + teamDurPending;

    const activeTeam = mockUsers.filter(
      (u) => u.isActive && teamUserIds?.includes(u.id),
    ).length;

    const compliance =
      completed + missed > 0
        ? ((completed / (completed + missed)) * 100).toFixed(1)
        : '0.0';

    return (
      <div>
        <PageHeader title="Dashboard" subtitle={subtitle} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Team Visits Today" value={todayVisits.length} icon={<MapPin className="h-5 w-5" />} color="blue" />
          <KPICard title="Completed" value={completed} icon={<CheckCircle className="h-5 w-5" />} color="green" />
          <KPICard title="Missed" value={missed} icon={<XCircle className="h-5 w-5" />} color="red" />
          <KPICard title="Out of Location" value={ool} icon={<MapPinOff className="h-5 w-5" />} color="orange" />
          <KPICard title="Pending Approvals" value={pendingApprovals} icon={<Clock className="h-5 w-5" />} color="purple" />
          <KPICard title="Active Team Members" value={activeTeam} icon={<UserCheck className="h-5 w-5" />} color="green" />
          <KPICard title="Data Update Requests" value={teamDurPending} icon={<FileEdit className="h-5 w-5" />} color="cyan" />
          <KPICard title="Visit Compliance %" value={`${compliance}%`} icon={<Target className="h-5 w-5" />} color="blue" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VisitsByStatusPie visits={scopedVisits} />
          <VisitsThisWeekArea visits={scopedVisits} />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Supervisor dashboard                                             */
  /* ---------------------------------------------------------------- */
  if (role === 'supervisor') {
    const completed = todayVisits.filter((v) => v.status === 'Completed').length;
    const missed = todayVisits.filter((v) => v.status === 'Missed').length;

    const teamOolPending = oolRequests.filter(
      (r) => r.status === 'Pending' && (teamUserIds === null || teamUserIds.includes(r.userId)),
    ).length;

    return (
      <div>
        <PageHeader title="Dashboard" subtitle={subtitle} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Today's Visits" value={todayVisits.length} icon={<MapPin className="h-5 w-5" />} color="blue" />
          <KPICard title="Completed" value={completed} icon={<CheckCircle className="h-5 w-5" />} color="green" />
          <KPICard title="Missed" value={missed} icon={<XCircle className="h-5 w-5" />} color="red" />
          <KPICard title="Pending Approvals" value={teamOolPending} icon={<Clock className="h-5 w-5" />} color="purple" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VisitsByStatusPie visits={scopedVisits} />
          <RecentVisitsList visits={scopedVisits} />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Merchandiser dashboard                                           */
  /* ---------------------------------------------------------------- */
  if (role === 'merchandiser') {
    const myVisits = visits.filter((v) => v.userId === user?.id);
    const myTodayVisits = myVisits.filter((v) => isToday(v.createdAt));
    const completed = myTodayVisits.filter((v) => v.status === 'Completed').length;
    const missed = myTodayVisits.filter((v) => v.status === 'Missed').length;
    const assignedCustomers = customers.filter(
      (c) => c.salesmanId === user?.id,
    ).length;

    return (
      <div>
        <PageHeader title="Dashboard" subtitle={subtitle} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="My Visits Today" value={myTodayVisits.length} icon={<MapPin className="h-5 w-5" />} color="blue" />
          <KPICard title="Completed" value={completed} icon={<CheckCircle className="h-5 w-5" />} color="green" />
          <KPICard title="Missed" value={missed} icon={<XCircle className="h-5 w-5" />} color="red" />
          <KPICard title="Assigned Customers" value={assignedCustomers} icon={<ShoppingCart className="h-5 w-5" />} color="orange" />
        </div>

        <div className="mt-6">
          <RecentVisitsList visits={myVisits} />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Data Team dashboard                                              */
  /* ---------------------------------------------------------------- */
  if (role === 'data_team') {
    const total = dataUpdateRequests.length;
    const pending = dataUpdateRequests.filter((r) => r.status === 'Pending').length;
    const approved = dataUpdateRequests.filter((r) => r.status === 'Approved').length;
    const rejected = dataUpdateRequests.filter((r) => r.status === 'Rejected').length;

    return (
      <div>
        <PageHeader title="Dashboard" subtitle={subtitle} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Total Data Requests" value={total} icon={<Database className="h-5 w-5" />} color="blue" />
          <KPICard title="Pending Requests" value={pending} icon={<Clock className="h-5 w-5" />} color="orange" />
          <KPICard title="Approved" value={approved} icon={<FileCheck className="h-5 w-5" />} color="green" />
          <KPICard title="Rejected" value={rejected} icon={<FileMinus className="h-5 w-5" />} color="red" />
        </div>

        <div className="mt-6">
          <RecentDataRequestsList />
        </div>
      </div>
    );
  }

  /* Fallback — should not happen */
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Unknown role" />
      <p className="text-gray-500">No dashboard available for this role.</p>
    </div>
  );
}
