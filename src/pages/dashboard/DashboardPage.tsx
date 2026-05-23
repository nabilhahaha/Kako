import { useMemo } from 'react';
import {
  MapPin,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Target,
  UserCheck,
  FileEdit,
  Package,
  ShoppingBag,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import { formatDateTime } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/permissions';
import type { UserRole, Visit } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const PURPLE = '#6D28D9';
const GREEN = '#16A34A';
const AMBER = '#D97706';
const RED = '#DC2626';
const BLUE = '#2563EB';

const todayISO = new Date().toISOString().slice(0, 10);

function isToday(iso: string) {
  return iso.startsWith(todayISO);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getGreetingEmoji(): string {
  const h = new Date().getHours();
  if (h < 12) return '☀️';
  if (h < 17) return '🌤️';
  return '🌙';
}

function getTeamUserIds(role: UserRole, userId: string): string[] | null {
  if (role === 'admin') return null;
  if (role === 'manager') {
    return mockUsers.filter((u) => u.managerId === userId).map((u) => u.id);
  }
  if (role === 'supervisor') {
    return mockUsers.filter((u) => u.supervisorId === userId).map((u) => u.id);
  }
  return null;
}

function filterVisits(visits: Visit[], userIds: string[] | null) {
  if (!userIds) return visits;
  return visits.filter((v) => userIds.includes(v.userId));
}

/* ------------------------------------------------------------------ */
/*  Circular Progress Ring                                             */
/* ------------------------------------------------------------------ */

function CircularProgress({
  value,
  max,
  size = 120,
  strokeWidth = 8,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = max > 0 ? (value / max) * 100 : 0;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
          className="dark:stroke-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={PURPLE}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          {Math.round(percent)}%
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI Card (inline)                                                  */
/* ------------------------------------------------------------------ */

function KPICardInline({
  label,
  value,
  color,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
  trend?: { value: string; up: boolean };
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold" style={{ color }}>
            {value}
          </p>
          {trend && (
            <div className="mt-1.5 flex items-center gap-1">
              <TrendingUp
                className={`h-3 w-3 ${trend.up ? 'text-green-500' : 'rotate-180 text-red-500'}`}
              />
              <span
                className={`text-xs font-medium ${trend.up ? 'text-green-600' : 'text-red-600'}`}
              >
                {trend.value}
              </span>
            </div>
          )}
        </div>
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}15` }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
      {/* Decorative accent */}
      <div
        className="absolute bottom-0 left-0 h-1 w-full opacity-60"
        style={{
          background: `linear-gradient(90deg, ${color}, transparent)`,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Card Wrapper                                               */
/* ------------------------------------------------------------------ */

function SectionCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Alert Item                                                         */
/* ------------------------------------------------------------------ */

function AlertItem({
  icon,
  iconBg,
  iconColor,
  label,
  count,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg }}
      >
        <div style={{ color: iconColor }}>{icon}</div>
      </div>
      <div>
        <span className="text-lg font-bold" style={{ color: iconColor }}>{count}</span>
      </div>
      <p className="text-[11px] font-medium leading-tight text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Badge (inline)                                              */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'In Progress': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    Missed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'Out of Location': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    Approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Charts                                                             */
/* ------------------------------------------------------------------ */

const PURPOSE_COLORS = [PURPLE, GREEN, AMBER, RED, BLUE, '#8B5CF6', '#0EA5E9'];

function VisitsTrendChart({ visits }: { visits: Visit[] }) {
  const data = useMemo(() => {
    const days: { label: string; iso: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const iso = dt.toISOString().slice(0, 10);
      const dayLabel = dt.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
      });
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
    <SectionCard title="Visits Trend (Last 7 Days)">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PURPLE} stopOpacity={0.3} />
              <stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: '13px',
            }}
          />
          <Area
            type="monotone"
            dataKey="visits"
            stroke={PURPLE}
            fill="url(#purpleGrad)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: PURPLE, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: PURPLE, stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </SectionCard>
  );
}

function VisitsByPurposePie({ visits }: { visits: Visit[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    visits.forEach((v) => {
      counts[v.purpose] = (counts[v.purpose] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [visits]);

  return (
    <SectionCard title="Visits by Purpose">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
            label={({ name, value }) => `${name}: ${value}`}
            labelLine={false}
          >
            {data.map((_entry, i) => (
              <Cell
                key={i}
                fill={PURPOSE_COLORS[i % PURPOSE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: '13px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </SectionCard>
  );
}

function TopSalesmenBar({ visits }: { visits: Visit[] }) {
  const data = useMemo(() => {
    const counts: Record<string, { name: string; visits: number }> = {};
    visits.forEach((v) => {
      const user = mockUsers.find((u) => u.id === v.userId);
      if (user) {
        if (!counts[user.id]) {
          counts[user.id] = { name: user.fullName.split(' ').slice(0, 2).join(' '), visits: 0 };
        }
        counts[user.id].visits++;
      }
    });
    return Object.values(counts)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 6);
  }, [visits]);

  return (
    <SectionCard title="Top Salesmen">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={100} />
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: '13px',
            }}
          />
          <Bar dataKey="visits" fill={PURPLE} radius={[0, 6, 6, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Visits                                                      */
/* ------------------------------------------------------------------ */

function RecentVisitsSection({ visits }: { visits: Visit[] }) {
  const recent = visits.slice(0, 8);
  const customers = useAppStore((s) => s.customers);

  return (
    <SectionCard title="Recent Visits">
      {recent.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No visits recorded yet.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Customer
                  </th>
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Salesman
                  </th>
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Purpose
                  </th>
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Time
                  </th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((v) => {
                  const cust = customers.find((c) => c.id === v.customerId);
                  const salesman = mockUsers.find((u) => u.id === v.userId);
                  return (
                    <tr
                      key={v.id}
                      className="border-b border-gray-50 last:border-0 dark:border-gray-700/50"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20">
                            <ShoppingBag className="h-4 w-4 text-purple-600" />
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {cust?.customerName ?? v.customerId}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500 dark:text-gray-400">
                        {salesman?.fullName ?? v.userId}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                          {v.purpose}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400">
                        {formatDateTime(v.createdAt)}
                      </td>
                      <td className="py-3">
                        <StatusDot status={v.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {recent.map((v) => {
              const cust = customers.find((c) => c.id === v.customerId);
              const salesman = mockUsers.find((u) => u.id === v.userId);
              return (
                <div
                  key={v.id}
                  className="rounded-xl border border-gray-100 p-3 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {cust?.customerName ?? v.customerId}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {salesman?.fullName ?? v.userId}
                      </p>
                    </div>
                    <StatusDot status={v.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span className="rounded bg-purple-50 px-1.5 py-0.5 font-medium text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                      {v.purpose}
                    </span>
                    <span>{formatDateTime(v.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Data Team Recent Requests                                          */
/* ------------------------------------------------------------------ */

function RecentDataRequestsList() {
  const requests = useAppStore((s) => s.dataUpdateRequests);
  const recent = requests.slice(0, 10);

  return (
    <SectionCard title="Recent Data Update Requests">
      {recent.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No requests yet.</p>
      ) : (
        <div className="space-y-3">
          {recent.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 p-3 dark:border-gray-700"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {r.customerName}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {r.updateType} &middot; by {r.userName} &middot;{' '}
                  {formatDateTime(r.createdAt)}
                </p>
              </div>
              <StatusDot status={r.status} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
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

  const greeting = getGreeting();
  const greetingEmoji = getGreetingEmoji();
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  /* ---------------------------------------------------------------- */
  /*  Greeting Header (shared)                                         */
  /* ---------------------------------------------------------------- */
  const greetingHeader = (
    <div className="mb-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            {greeting} {greetingEmoji}
          </h1>
          <p className="mt-1 text-base font-medium text-gray-700 dark:text-gray-300">
            {user?.fullName ?? 'User'}
          </p>
        </div>
        <div className="mt-2 text-right sm:mt-0">
          <p className="text-sm text-gray-400">{todayStr}</p>
          <span
            className="mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: PURPLE }}
          >
            {ROLE_LABELS[role]}
          </span>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Admin Dashboard                                                  */
  /* ---------------------------------------------------------------- */
  if (role === 'admin') {
    const completed = todayVisits.filter((v) => v.status === 'Completed').length;
    const missed = todayVisits.filter((v) => v.status === 'Missed').length;
    const pending = todayVisits.length - completed;
    const completionPct =
      todayVisits.length > 0
        ? `${((completed / todayVisits.length) * 100).toFixed(0)}%`
        : '0%';

    const nearExpiry = 3; // simulated
    const outOfStock = 5; // simulated
    const noVisit = missed;

    return (
      <div className="space-y-6">
        {greetingHeader}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICardInline
            label="Planned Visits"
            value={todayVisits.length}
            color={PURPLE}
            icon={<MapPin className="h-5 w-5" />}
            trend={{ value: '+12%', up: true }}
          />
          <KPICardInline
            label="Completed"
            value={completed}
            color={GREEN}
            icon={<CheckCircle className="h-5 w-5" />}
            trend={{ value: '+8%', up: true }}
          />
          <KPICardInline
            label="Pending"
            value={pending}
            color={AMBER}
            icon={<Clock className="h-5 w-5" />}
          />
          <KPICardInline
            label="Completion %"
            value={completionPct}
            color={PURPLE}
            icon={<Target className="h-5 w-5" />}
          />
        </div>

        {/* Today's Progress */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Today&apos;s Progress
          </h3>
          <div className="flex items-center gap-6">
            <CircularProgress value={completed} max={todayVisits.length || 12} size={100} strokeWidth={8} />
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {completed} <span className="text-sm font-normal text-gray-400">/ {todayVisits.length || 12} Visits</span>
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${todayVisits.length > 0 ? (completed / todayVisits.length) * 100 : 66}%`,
                    background: `linear-gradient(90deg, ${PURPLE}, #8B5CF6)`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Alerts - Horizontal row */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Alerts
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <AlertItem
              icon={<AlertTriangle className="h-4 w-4" />}
              iconBg="#FEE2E2"
              iconColor={RED}
              label="Near Expiry"
              count={nearExpiry}
            />
            <AlertItem
              icon={<Package className="h-4 w-4" />}
              iconBg="#FEF3C7"
              iconColor={AMBER}
              label="Out of Stock"
              count={outOfStock}
            />
            <AlertItem
              icon={<XCircle className="h-4 w-4" />}
              iconBg="#DBEAFE"
              iconColor={BLUE}
              label="No Visit"
              count={noVisit}
            />
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <VisitsTrendChart visits={scopedVisits} />
          <VisitsByPurposePie visits={scopedVisits} />
          <TopSalesmenBar visits={scopedVisits} />
        </div>

        {/* Recent Visits */}
        <RecentVisitsSection visits={scopedVisits} />
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Manager Dashboard                                                */
  /* ---------------------------------------------------------------- */
  if (role === 'manager') {
    const completed = todayVisits.filter((v) => v.status === 'Completed').length;
    const missed = todayVisits.filter((v) => v.status === 'Missed').length;
    const pending = todayVisits.length - completed;
    const completionPct =
      todayVisits.length > 0
        ? `${((completed / todayVisits.length) * 100).toFixed(0)}%`
        : '0%';

    const teamOolPending = oolRequests.filter(
      (r) =>
        r.status === 'Pending' &&
        (teamUserIds === null || teamUserIds.includes(r.userId)),
    ).length;
    const teamDurPending = dataUpdateRequests.filter(
      (r) =>
        r.status === 'Pending' &&
        (teamUserIds === null || teamUserIds.includes(r.userId)),
    ).length;

    const activeTeam = mockUsers.filter(
      (u) => u.isActive && teamUserIds?.includes(u.id),
    ).length;

    return (
      <div className="space-y-6">
        {greetingHeader}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICardInline
            label="Team Visits"
            value={todayVisits.length}
            color={PURPLE}
            icon={<MapPin className="h-5 w-5" />}
          />
          <KPICardInline
            label="Completed"
            value={completed}
            color={GREEN}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <KPICardInline
            label="Pending"
            value={pending}
            color={AMBER}
            icon={<Clock className="h-5 w-5" />}
          />
          <KPICardInline
            label="Completion %"
            value={completionPct}
            color={PURPLE}
            icon={<Target className="h-5 w-5" />}
          />
        </div>

        {/* Today's Progress */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Today&apos;s Progress
          </h3>
          <div className="flex items-center gap-6">
            <CircularProgress value={completed} max={todayVisits.length || 12} size={100} strokeWidth={8} />
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {completed} <span className="text-sm font-normal text-gray-400">/ {todayVisits.length || 12} Visits</span>
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${todayVisits.length > 0 ? (completed / todayVisits.length) * 100 : 66}%`,
                    background: `linear-gradient(90deg, ${PURPLE}, #8B5CF6)`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Alerts
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <AlertItem icon={<Clock className="h-4 w-4" />} iconBg="#FEF3C7" iconColor={AMBER} label="Pending OOL" count={teamOolPending} />
            <AlertItem icon={<FileEdit className="h-4 w-4" />} iconBg="#E0E7FF" iconColor={PURPLE} label="Data Requests" count={teamDurPending} />
            <AlertItem icon={<Users className="h-4 w-4" />} iconBg="#D1FAE5" iconColor={GREEN} label="Active Team" count={activeTeam} />
            <AlertItem icon={<XCircle className="h-4 w-4" />} iconBg="#FEE2E2" iconColor={RED} label="Missed" count={missed} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VisitsTrendChart visits={scopedVisits} />
          <VisitsByPurposePie visits={scopedVisits} />
        </div>

        <RecentVisitsSection visits={scopedVisits} />
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Supervisor Dashboard                                             */
  /* ---------------------------------------------------------------- */
  if (role === 'supervisor') {
    const completed = todayVisits.filter((v) => v.status === 'Completed').length;
    const missed = todayVisits.filter((v) => v.status === 'Missed').length;
    const pending = todayVisits.length - completed;
    const completionPct =
      todayVisits.length > 0
        ? `${((completed / todayVisits.length) * 100).toFixed(0)}%`
        : '0%';

    const teamOolPending = oolRequests.filter(
      (r) =>
        r.status === 'Pending' &&
        (teamUserIds === null || teamUserIds.includes(r.userId)),
    ).length;

    return (
      <div className="space-y-6">
        {greetingHeader}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICardInline
            label="Today's Visits"
            value={todayVisits.length}
            color={PURPLE}
            icon={<MapPin className="h-5 w-5" />}
          />
          <KPICardInline
            label="Completed"
            value={completed}
            color={GREEN}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <KPICardInline
            label="Pending"
            value={pending}
            color={AMBER}
            icon={<Clock className="h-5 w-5" />}
          />
          <KPICardInline
            label="Completion %"
            value={completionPct}
            color={PURPLE}
            icon={<Target className="h-5 w-5" />}
          />
        </div>

        {/* Today's Progress */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Today&apos;s Progress
          </h3>
          <div className="flex items-center gap-6">
            <CircularProgress value={completed} max={todayVisits.length || 12} size={100} strokeWidth={8} />
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {completed} <span className="text-sm font-normal text-gray-400">/ {todayVisits.length || 12} Visits</span>
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${todayVisits.length > 0 ? (completed / todayVisits.length) * 100 : 66}%`, background: `linear-gradient(90deg, ${PURPLE}, #8B5CF6)` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Alerts</h3>
          <div className="grid grid-cols-2 gap-2">
            <AlertItem icon={<Clock className="h-4 w-4" />} iconBg="#FEF3C7" iconColor={AMBER} label="Pending OOL" count={teamOolPending} />
            <AlertItem icon={<XCircle className="h-4 w-4" />} iconBg="#FEE2E2" iconColor={RED} label="Missed Visits" count={missed} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <VisitsByPurposePie visits={scopedVisits} />
          <RecentVisitsSection visits={scopedVisits} />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Merchandiser Dashboard                                           */
  /* ---------------------------------------------------------------- */
  if (role === 'merchandiser') {
    const myVisits = visits.filter((v) => v.userId === user?.id);
    const myTodayVisits = myVisits.filter((v) => isToday(v.createdAt));
    const completed = myTodayVisits.filter((v) => v.status === 'Completed').length;
    const missed = myTodayVisits.filter((v) => v.status === 'Missed').length;
    const pending = myTodayVisits.length - completed;
    const completionPct =
      myTodayVisits.length > 0
        ? `${((completed / myTodayVisits.length) * 100).toFixed(0)}%`
        : '0%';
    const assignedCustomers = customers.filter(
      (c) => c.salesmanId === user?.id,
    ).length;

    return (
      <div className="space-y-6">
        {greetingHeader}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICardInline
            label="My Visits Today"
            value={myTodayVisits.length}
            color={PURPLE}
            icon={<MapPin className="h-5 w-5" />}
          />
          <KPICardInline
            label="Completed"
            value={completed}
            color={GREEN}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <KPICardInline
            label="Pending"
            value={pending}
            color={AMBER}
            icon={<Clock className="h-5 w-5" />}
          />
          <KPICardInline
            label="Completion %"
            value={completionPct}
            color={PURPLE}
            icon={<Target className="h-5 w-5" />}
          />
        </div>

        {/* Today's Progress */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Today&apos;s Progress
          </h3>
          <div className="flex items-center gap-6">
            <CircularProgress value={completed} max={myTodayVisits.length || 12} size={100} strokeWidth={8} />
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {completed} <span className="text-sm font-normal text-gray-400">/ {myTodayVisits.length || 12} Visits</span>
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${myTodayVisits.length > 0 ? (completed / myTodayVisits.length) * 100 : 66}%`, background: `linear-gradient(90deg, ${PURPLE}, #8B5CF6)` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Alerts</h3>
          <div className="grid grid-cols-3 gap-2">
            <AlertItem icon={<ShoppingBag className="h-4 w-4" />} iconBg="#E0E7FF" iconColor={PURPLE} label="Customers" count={assignedCustomers} />
            <AlertItem icon={<XCircle className="h-4 w-4" />} iconBg="#FEE2E2" iconColor={RED} label="Missed" count={missed} />
            <AlertItem icon={<UserCheck className="h-4 w-4" />} iconBg="#D1FAE5" iconColor={GREEN} label="Completed" count={completed} />
          </div>
        </div>

        <RecentVisitsSection visits={myVisits} />
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Data Team Dashboard                                              */
  /* ---------------------------------------------------------------- */
  if (role === 'data_team') {
    const total = dataUpdateRequests.length;
    const pendingCount = dataUpdateRequests.filter((r) => r.status === 'Pending').length;
    const approved = dataUpdateRequests.filter((r) => r.status === 'Approved').length;
    const rejected = dataUpdateRequests.filter((r) => r.status === 'Rejected').length;
    const completionPct =
      total > 0 ? `${(((approved + rejected) / total) * 100).toFixed(0)}%` : '0%';

    return (
      <div className="space-y-6">
        {greetingHeader}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICardInline
            label="Total Requests"
            value={total}
            color={PURPLE}
            icon={<FileEdit className="h-5 w-5" />}
          />
          <KPICardInline
            label="Pending"
            value={pendingCount}
            color={AMBER}
            icon={<Clock className="h-5 w-5" />}
          />
          <KPICardInline
            label="Approved"
            value={approved}
            color={GREEN}
            icon={<CheckCircle className="h-5 w-5" />}
          />
          <KPICardInline
            label="Processed %"
            value={completionPct}
            color={PURPLE}
            icon={<Target className="h-5 w-5" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Processing Progress
            </h3>
            <div className="flex items-center justify-center gap-8">
              <CircularProgress value={approved + rejected} max={total} size={120} strokeWidth={8} />
              <div className="text-center">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {approved + rejected}{' '}
                  <span className="text-lg font-normal text-gray-400">/ {total}</span>
                </p>
                <p className="mt-1 text-sm text-gray-400">Processed</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Status Breakdown
            </h3>
            <div className="space-y-3">
              <AlertItem
                icon={<Clock className="h-4 w-4" />}
                iconBg="#FEF3C7"
                iconColor={AMBER}
                label="Awaiting Review"
                count={pendingCount}
              />
              <AlertItem
                icon={<CheckCircle className="h-4 w-4" />}
                iconBg="#D1FAE5"
                iconColor={GREEN}
                label="Approved"
                count={approved}
              />
              <AlertItem
                icon={<XCircle className="h-4 w-4" />}
                iconBg="#FEE2E2"
                iconColor={RED}
                label="Rejected"
                count={rejected}
              />
            </div>
          </div>
        </div>

        <RecentDataRequestsList />
      </div>
    );
  }

  /* Fallback */
  return (
    <div className="space-y-6">
      {greetingHeader}
      <p className="text-gray-500">No dashboard available for this role.</p>
    </div>
  );
}
