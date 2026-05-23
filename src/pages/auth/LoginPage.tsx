import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Briefcase, Users, ShoppingCart, Database } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers, roleCredentials } from '@/data/mockData';
import { homeForRole } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';

const roles: {
  key: string;
  role: UserRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}[] = [
  {
    key: 'admin',
    role: 'admin',
    label: 'Admin',
    description: 'Full system access & configuration',
    icon: <Shield className="h-8 w-8" />,
    gradient: 'from-red-500 to-rose-600',
  },
  {
    key: 'manager',
    role: 'manager',
    label: 'Manager',
    description: 'Team oversight & approvals',
    icon: <Briefcase className="h-8 w-8" />,
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    key: 'supervisor',
    role: 'supervisor',
    label: 'Supervisor',
    description: 'Field team management',
    icon: <Users className="h-8 w-8" />,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    key: 'merchandiser',
    role: 'merchandiser',
    label: 'Merchandiser',
    description: 'Store visits & execution',
    icon: <ShoppingCart className="h-8 w-8" />,
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    key: 'data_team',
    role: 'data_team',
    label: 'Data Team',
    description: 'Data management & updates',
    icon: <Database className="h-8 w-8" />,
    gradient: 'from-purple-500 to-violet-600',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const addAuditLog = useAppStore((s) => s.addAuditLog);

  useEffect(() => {
    if (user) {
      navigate(homeForRole(user.role), { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = (roleKey: string) => {
    const creds = roleCredentials[roleKey];
    if (!creds) return;

    const foundUser = mockUsers.find(
      (u) => u.username === creds.username && u.role === creds.role,
    );
    if (!foundUser) return;

    addAuditLog({
      userId: foundUser.id,
      userName: foundUser.fullName,
      role: foundUser.role,
      action: 'user_login',
      entity: 'User',
      entityId: foundUser.id,
      oldValue: '',
      newValue: 'Login',
      status: 'Success',
    });

    setUser(foundUser);
    navigate(homeForRole(foundUser.role), { replace: true });
  };

  if (user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800 p-4">
      <div className="w-full max-w-lg">
        {/* Logo / Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-lg backdrop-blur-sm">
            <Shield className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            FMCG Field Force Pro
          </h1>
          <p className="mt-1 text-sm font-medium text-blue-200">
            Field Execution Platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h2 className="mb-1 text-center text-lg font-semibold text-gray-900">
            Select Your Role
          </h2>
          <p className="mb-6 text-center text-sm text-gray-500">
            Choose a role to sign in and explore the platform
          </p>

          {/* Role grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {roles.map((r) => (
              <button
                key={r.key}
                onClick={() => handleLogin(r.key)}
                className="group relative flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-left transition-all hover:border-transparent hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {/* Icon circle */}
                <div
                  className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${r.gradient} text-white shadow-md transition-transform group-hover:scale-110`}
                >
                  {r.icon}
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {r.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-gray-500">
                    {r.description}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-[11px] text-gray-400">
            Demo mode — no password required
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-blue-300/70">
          &copy; {new Date().getFullYear()} FMCG Field Force Pro. All rights reserved.
        </p>
      </div>
    </div>
  );
}
